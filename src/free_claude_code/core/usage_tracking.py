"""Usage tracking ring buffer and stream capture.

Captures per-request token metrics (input/output, cache, reasoning) and full
prompt content as requests stream through the provider executor. Records are
kept in a bounded ring buffer persisted atomically to JSON, and exposed to the
admin API as aggregate stats plus a reverse-chronological request log.

The buffer is a module-level singleton initialized once at application startup
(``init_buffer``); the capture stream reads it through ``get_buffer`` so the
dependency does not need to be threaded through provider construction.
"""

import asyncio
import contextlib
import json
import os
import tempfile
import threading
import time
from collections.abc import AsyncIterator, Iterable, Mapping
from dataclasses import asdict, dataclass
from typing import Any, Literal

from loguru import logger

from free_claude_code.core.anthropic import (
    Message,
    MessagesRequest,
    SystemContent,
)
from free_claude_code.core.async_iterators import try_close_async_iterator

PROMPT_CAP_BYTES = 64 * 1024
TRUNCATED_MARKER = "[truncated]"
DEFAULT_RING_SIZE = 1000
LIVE_WINDOW_SECONDS = 60

RecordStatus = Literal["success", "error", "cancelled"]

_USAGE_KEYS = (
    "input_tokens",
    "output_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "reasoning_tokens",
)


@dataclass(slots=True)
class UsageRecord:
    """One tracked request with its token usage and captured prompt."""

    request_id: str
    timestamp: float
    provider: str
    provider_model: str
    gateway_model: str
    wire_api: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    reasoning_tokens: int = 0
    duration_ms: int = 0
    status: RecordStatus = "success"
    error_type: str | None = None
    prompt: str = ""


@dataclass(slots=True)
class PendingUsageRecord:
    """A record being accumulated while its stream is in flight."""

    request_id: str
    started_at: float
    provider: str
    provider_model: str
    gateway_model: str
    wire_api: str
    input_tokens: int
    prompt: str
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    reasoning_tokens: int = 0
    usage_seen: bool = False

    def finalize(
        self, status: RecordStatus, error_type: str | None = None
    ) -> UsageRecord:
        """Produce the immutable record with measured duration."""
        ended_at = time.time()
        return UsageRecord(
            request_id=self.request_id,
            timestamp=self.started_at,
            provider=self.provider,
            provider_model=self.provider_model,
            gateway_model=self.gateway_model,
            wire_api=self.wire_api,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            cache_creation_tokens=self.cache_creation_tokens,
            cache_read_tokens=self.cache_read_tokens,
            reasoning_tokens=self.reasoning_tokens,
            duration_ms=int((ended_at - self.started_at) * 1000),
            status=status,
            error_type=error_type,
            prompt=self.prompt,
        )


class UsageRingBuffer:
    """Bounded in-memory ring of usage records with atomic JSON persistence."""

    def __init__(
        self,
        path: str | os.PathLike[str] | None = None,
        *,
        max_entries: int = DEFAULT_RING_SIZE,
    ) -> None:
        self._path: str | None = None if path is None else os.fspath(path)
        self._max_entries = max_entries
        self._records: list[UsageRecord] = []
        self._lock = threading.Lock()
        if self._path is not None:
            self._load()

    def _load(self) -> None:
        if not self._path or not os.path.exists(self._path):
            return
        try:
            with open(self._path, encoding="utf-8") as file:
                data = json.load(file)
            records = data.get("records") if isinstance(data, dict) else None
            if isinstance(records, list):
                self._records = [record_from_dict(item) for item in records]
                overflow = len(self._records) - self._max_entries
                if overflow > 0:
                    self._records = self._records[overflow:]
        except (OSError, ValueError, TypeError) as exc:
            logger.warning(
                "Usage buffer load failed ({}): {}",
                type(exc).__name__,
                exc,
            )

    def push(self, record: UsageRecord) -> None:
        """Append a record, evicting the oldest entry when full, then persist."""
        with self._lock:
            self._records.append(record)
            overflow = len(self._records) - self._max_entries
            if overflow > 0:
                self._records = self._records[overflow:]
        self._persist()

    def query(self, since: float | None = None) -> list[UsageRecord]:
        """Return records newest-first, optionally filtered to ``since``."""
        with self._lock:
            records = self._records
            if since is not None:
                records = [r for r in records if r.timestamp >= since]
        return list(reversed(records))

    def records(self) -> tuple[UsageRecord, ...]:
        """Return all records oldest-first for persistence/aggregation."""
        with self._lock:
            return tuple(self._records)

    def stats(self, since: float | None = None) -> dict[str, Any]:
        """Return aggregate usage stats over the buffered window."""
        records = self.query(since)
        tpm, tps = self.tpm_tps(now=time.time())
        return {
            "total_requests": len(records),
            "total_input_tokens": _sum_field(records, "input_tokens"),
            "total_output_tokens": _sum_field(records, "output_tokens"),
            "total_cache_creation_tokens": _sum_field(records, "cache_creation_tokens"),
            "total_cache_read_tokens": _sum_field(records, "cache_read_tokens"),
            "total_reasoning_tokens": _sum_field(records, "reasoning_tokens"),
            "errors": sum(1 for r in records if r.status == "error"),
            "cancelled": sum(1 for r in records if r.status == "cancelled"),
            "tpm": tpm,
            "tps": tps,
        }

    def tpm_tps(
        self,
        *,
        now: float | None = None,
        window_seconds: int = LIVE_WINDOW_SECONDS,
    ) -> tuple[float, float]:
        """Return (tokens-per-minute, tokens-per-second) over the trailing window.

        Rates reflect live traffic: only records within the last
        ``window_seconds`` of wall-clock time count, so the numbers track recent
        throughput and decay toward zero once traffic stops. The per-second rate
        counts output tokens only (generation speed); the per-minute rate counts
        total tokens in and out. An empty window yields zero rates.
        """
        now = time.time() if now is None else now
        cutoff = now - window_seconds
        with self._lock:
            recent = [r for r in self._records if r.timestamp >= cutoff]
        if not recent:
            return 0.0, 0.0
        total_tokens = _sum_field(recent, "input_tokens") + _sum_field(
            recent, "output_tokens"
        )
        output_tokens = _sum_field(recent, "output_tokens")
        tokens_per_minute = total_tokens / window_seconds * 60.0
        output_per_second = output_tokens / window_seconds
        return tokens_per_minute, output_per_second

    def _persist(self) -> None:
        if self._path is None:
            return
        payload = {
            "version": 1,
            "records": [asdict(r) for r in self._records],
        }
        _atomic_write_json(self._path, payload)


_BUFFER: UsageRingBuffer | None = None


def init_buffer(
    path: str | os.PathLike[str] | None = None,
    *,
    max_entries: int = DEFAULT_RING_SIZE,
) -> UsageRingBuffer:
    """Initialize the module-level usage buffer singleton."""
    global _BUFFER
    buffer = UsageRingBuffer(path, max_entries=max_entries)
    _BUFFER = buffer
    return buffer


def get_buffer() -> UsageRingBuffer | None:
    """Return the module-level usage buffer, if initialized."""
    return _BUFFER


def reset_buffer() -> None:
    """Clear the module-level usage buffer (test isolation)."""
    global _BUFFER
    _BUFFER = None


class UsageTrackingStream:
    """Transparently forward SSE chunks while capturing usage for one request.

    Parses Anthropic ``message_delta`` events emitted by the provider pipeline
    for their ``usage`` payload (input/output tokens plus cache and reasoning
    fields when present). The record is finalized and pushed on clean
    completion, provider error, or cancellation.
    """

    def __init__(
        self,
        inner: AsyncIterator[str],
        pending: PendingUsageRecord,
    ) -> None:
        self._inner = inner
        self._pending = pending
        self._finalized = False

    def __aiter__(self) -> UsageTrackingStream:
        return self

    async def __anext__(self) -> str:
        try:
            chunk = await self._inner.__anext__()
        except StopAsyncIteration:
            self._finalize("success")
            raise
        except asyncio.CancelledError:
            self._finalize("cancelled")
            raise
        except BaseException as exc:
            self._finalize("error", error_type=type(exc).__name__)
            raise
        self._capture_usage(chunk)
        return chunk

    async def aclose(self) -> None:
        """Release the inner stream and record the request as cancelled.

        Closing is the AsyncCloseable contract: ``traced_async_stream`` calls
        this from its ``finally`` block whenever the traced stream is closed,
        including after normal completion. The finalized guard keeps the record
        at its earlier status (success/error) when closing follows completion.
        """
        try:
            await try_close_async_iterator(self._inner)
        finally:
            self._finalize("cancelled")

    def _capture_usage(self, chunk: str) -> None:
        event = _parse_sse_data(chunk)
        if event is None:
            return
        if event.get("type") != "message_delta":
            return
        usage = event.get("usage")
        if not isinstance(usage, Mapping):
            return
        captured = False
        for key in _USAGE_KEYS:
            value = usage.get(key)
            if isinstance(value, int) and value >= 0:
                setattr(self._pending, _record_field_for(key), value)
                captured = True
        if captured:
            self._pending.usage_seen = True

    def _finalize(self, status: RecordStatus, error_type: str | None = None) -> None:
        if self._finalized:
            return
        self._finalized = True
        record = self._pending.finalize(status, error_type=error_type)
        buffer = get_buffer()
        if buffer is not None:
            buffer.push(record)


def _record_field_for(usage_key: str) -> str:
    return {
        "input_tokens": "input_tokens",
        "output_tokens": "output_tokens",
        "cache_creation_input_tokens": "cache_creation_tokens",
        "cache_read_input_tokens": "cache_read_tokens",
        "reasoning_tokens": "reasoning_tokens",
    }[usage_key]


def _parse_sse_data(chunk: str) -> dict[str, Any] | None:
    """Return the JSON payload of the first ``data:`` line in an SSE chunk."""
    for line in chunk.splitlines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            if not payload:
                return None
            try:
                parsed = json.loads(payload)
            except ValueError:
                return None
            return parsed if isinstance(parsed, dict) else None
    return None


def extract_prompt(request: MessagesRequest) -> str:
    """Serialize a request's system + messages into capture text.

    Tool definitions are excluded (boilerplate); image/document blocks render
    as a short marker. The result is capped at ``PROMPT_CAP_BYTES`` to bound
    on-disk usage.
    """
    parts: list[str] = []
    system = request.system
    if isinstance(system, str):
        if system:
            parts.append(system)
    elif system:
        parts.extend(_serialize_system_block(block) for block in system)
    parts.extend(_serialize_message(message) for message in request.messages)
    text = "\n\n".join(parts)
    return _cap_prompt(text)


def _serialize_system_block(block: SystemContent) -> str:
    if isinstance(block, str):
        return block
    text = getattr(block, "text", "")
    return text if isinstance(text, str) else ""


def _serialize_message(message: Message) -> str:
    role = message.role
    content = message.content
    if isinstance(content, str):
        body = content
    else:
        body = "\n".join(_serialize_block(block) for block in content)
    return f"<{role}> {body}"


def _serialize_block(block: Any) -> str:
    block_type = getattr(block, "type", None)
    if block_type == "text":
        return _as_text(block.text)
    if block_type == "tool_use":
        name = getattr(block, "name", "")
        return f"[tool_use: {name}]"
    if block_type == "tool_result":
        return "[tool_result]"
    if block_type == "thinking":
        return f"[thinking: {_as_text(getattr(block, 'thinking', ''))}]"
    if block_type in {"image", "document"}:
        return f"[{block_type}]"
    return f"[{block_type}]" if isinstance(block_type, str) else str(block)


def _as_text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _cap_prompt(text: str) -> str:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= PROMPT_CAP_BYTES:
        return text
    marker = f"\n{TRUNCATED_MARKER}".encode()
    limit = PROMPT_CAP_BYTES - len(marker)
    truncated = encoded[:limit].decode("utf-8", errors="ignore").rstrip()
    return f"{truncated}{marker.decode('utf-8')}"


def record_from_dict(data: Mapping[str, Any]) -> UsageRecord:
    """Rebuild a usage record from persisted JSON."""
    fields = UsageRecord.__dataclass_fields__
    values: dict[str, Any] = {}
    for name in fields:
        if name == "status":
            value = data.get("status", "success")
            values[name] = (
                value if value in {"success", "error", "cancelled"} else "success"
            )
        else:
            values[name] = data.get(name, fields[name].default)
    return UsageRecord(**values)


def _sum_field(records: Iterable[UsageRecord], name: str) -> int:
    return sum(getattr(record, name, 0) for record in records)


def _atomic_write_json(path: str, payload: dict[str, Any]) -> None:
    """Write JSON atomically via a same-directory temp file + replace."""
    abs_target = os.path.abspath(path)
    dir_name = os.path.dirname(abs_target) or "."
    os.makedirs(dir_name, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=dir_name,
        prefix=".usage.",
        suffix=".tmp.json",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(payload, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(tmp_path, abs_target)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)
        raise

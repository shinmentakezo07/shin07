"""Unit tests for usage tracking (ring buffer, stream capture, prompt capture)."""

import asyncio
import json
import time

import pytest

from free_claude_code.core.anthropic import (
    Message,
    MessagesRequest,
)
from free_claude_code.core.usage_tracking import (
    PendingUsageRecord,
    UsageRecord,
    UsageRingBuffer,
    UsageTrackingStream,
    extract_prompt,
    get_buffer,
    init_buffer,
    reset_buffer,
)


def _record(
    request_id: str, *, timestamp: float | None = None, **overrides
) -> UsageRecord:
    values = {
        "request_id": request_id,
        "timestamp": time.time() if timestamp is None else timestamp,
        "provider": "openai_compatible_1",
        "provider_model": "gpt-4o",
        "gateway_model": "gpt-4o",
        "wire_api": "messages",
        "input_tokens": 10,
        "output_tokens": 20,
        "cache_creation_tokens": 5,
        "cache_read_tokens": 3,
        "reasoning_tokens": 2,
        "duration_ms": 100,
        "status": "success",
        "error_type": None,
        "prompt": "hello",
    }
    values.update(overrides)
    return UsageRecord(**values)


def test_push_and_query_newest_first(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(_record("r1", timestamp=100.0))
    buffer.push(_record("r2", timestamp=200.0))

    records = buffer.query()

    assert [r.request_id for r in records] == ["r2", "r1"]


def test_query_since_filters(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(_record("r1", timestamp=100.0))
    buffer.push(_record("r2", timestamp=200.0))
    buffer.push(_record("r3", timestamp=300.0))

    records = buffer.query(since=200.0)

    assert [r.request_id for r in records] == ["r3", "r2"]


def test_ring_evicts_oldest_when_full(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json", max_entries=2)
    buffer.push(_record("r1", timestamp=100.0))
    buffer.push(_record("r2", timestamp=200.0))
    buffer.push(_record("r3", timestamp=300.0))

    records = buffer.query()

    assert [r.request_id for r in records] == ["r3", "r2"]
    assert all(r.request_id != "r1" for r in buffer.records())


def test_stats_aggregates(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(
        _record(
            "r1",
            timestamp=100.0,
            input_tokens=10,
            output_tokens=20,
            cache_creation_tokens=5,
            cache_read_tokens=3,
            reasoning_tokens=2,
            status="success",
        )
    )
    # r2/r3 override the default cache/reasoning values set by _record().
    buffer.push(
        _record(
            "r2",
            timestamp=200.0,
            input_tokens=100,
            output_tokens=200,
            cache_creation_tokens=10,
            cache_read_tokens=0,
            reasoning_tokens=0,
            status="error",
            error_type="upstream_error",
        )
    )
    buffer.push(
        _record(
            "r3",
            timestamp=300.0,
            input_tokens=1,
            output_tokens=1,
            cache_creation_tokens=0,
            cache_read_tokens=0,
            reasoning_tokens=0,
            status="cancelled",
        )
    )

    stats = buffer.stats()

    assert stats["total_requests"] == 3
    assert stats["total_input_tokens"] == 111
    assert stats["total_output_tokens"] == 221
    assert stats["total_cache_creation_tokens"] == 15
    assert stats["total_cache_read_tokens"] == 3
    assert stats["total_reasoning_tokens"] == 2
    assert stats["errors"] == 1
    assert stats["cancelled"] == 1


def test_stats_since_filters(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(_record("r1", timestamp=100.0, input_tokens=1))
    buffer.push(_record("r2", timestamp=300.0, input_tokens=10))

    stats = buffer.stats(since=200.0)

    assert stats["total_requests"] == 1
    assert stats["total_input_tokens"] == 10


def test_tpm_tps_known_window(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(
        _record(
            "r1", timestamp=100.0, input_tokens=10, output_tokens=20, duration_ms=100
        )
    )
    buffer.push(
        _record(
            "r2", timestamp=110.0, input_tokens=30, output_tokens=40, duration_ms=100
        )
    )

    # Both records sit inside the trailing 60s window ending at now=110.
    tpm, tps = buffer.tpm_tps(now=110.0)

    # 100 total tokens over the 60s window -> 100 tokens/minute; the
    # per-second rate counts output tokens only (60 output tokens ->
    # 1 token/second).
    assert tpm == pytest.approx(100.0)
    assert tps == pytest.approx(1.0)


def test_tpm_tps_custom_window(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(
        _record(
            "r1", timestamp=100.0, input_tokens=10, output_tokens=20, duration_ms=100
        )
    )
    buffer.push(
        _record(
            "r2", timestamp=110.0, input_tokens=30, output_tokens=40, duration_ms=100
        )
    )

    # A 10s window ending at now=110 still contains both records.
    tpm, tps = buffer.tpm_tps(now=110.0, window_seconds=10)

    # 100 total tokens over the 10s window -> 600 tokens/minute; the
    # per-second rate counts output tokens only (60 output tokens ->
    # 6 tokens/second).
    assert tpm == pytest.approx(600.0)
    assert tps == pytest.approx(6.0)


def test_tps_counts_output_tokens_only(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(
        _record(
            "r1", timestamp=100.0, input_tokens=90, output_tokens=10, duration_ms=100
        )
    )

    # A 100s window ending at now=200 keeps the record in scope.
    tpm, tps = buffer.tpm_tps(now=200.0, window_seconds=100)

    # 100 total tokens over the 100s window -> 60 tokens/minute; output-only
    # 10 tokens over 100 seconds -> 0.1 tokens/second.
    assert tpm == pytest.approx(60.0)
    assert tps == pytest.approx(0.1)


def test_tpm_tps_ignores_records_older_than_window(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(
        _record(
            "r1", timestamp=100.0, input_tokens=90, output_tokens=10, duration_ms=100
        )
    )
    buffer.push(
        _record(
            "r2", timestamp=300.0, input_tokens=50, output_tokens=50, duration_ms=100
        )
    )

    # r2 is inside the window, r1 is too old to count.
    tpm, tps = buffer.tpm_tps(now=320.0, window_seconds=60)

    assert tpm == pytest.approx(100.0)
    assert tps == pytest.approx(50.0 / 60.0)


def test_tpm_tps_zero_when_window_quiet(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(_record("r1", timestamp=100.0, input_tokens=10, output_tokens=20))

    # The only record is older than the window, so traffic is idle.
    tpm, tps = buffer.tpm_tps(now=200.0)

    assert tpm == 0.0
    assert tps == 0.0


def test_tpm_tps_empty_buffer():
    buffer = UsageRingBuffer()

    assert buffer.tpm_tps() == (0.0, 0.0)


def test_file_round_trip(tmp_path):
    path = tmp_path / "usage.json"
    buffer = UsageRingBuffer(path)
    buffer.push(_record("r1", timestamp=100.0, prompt="first prompt"))

    reloaded = UsageRingBuffer(path)
    records = reloaded.query()

    assert len(records) == 1
    record = records[0]
    assert record.request_id == "r1"
    assert record.input_tokens == 10
    assert record.output_tokens == 20
    assert record.prompt == "first prompt"


def test_persistence_contains_prompt(tmp_path):
    path = tmp_path / "usage.json"
    buffer = UsageRingBuffer(path)
    buffer.push(_record("r1", prompt="a captured prompt"))

    data = json.loads(path.read_text(encoding="utf-8"))

    assert data["version"] == 1
    assert data["records"][0]["prompt"] == "a captured prompt"


def test_init_and_reset_buffer(tmp_path):
    reset_buffer()
    assert get_buffer() is None

    buffer = init_buffer(tmp_path / "usage.json")
    assert get_buffer() is buffer

    reset_buffer()
    assert get_buffer() is None


@pytest.fixture
def _isolated_singleton(tmp_path):
    reset_buffer()
    yield
    reset_buffer()


def _sample_request() -> MessagesRequest:
    return MessagesRequest(
        model="gpt-4o",
        system="You are a helpful assistant.",
        messages=[
            Message(role="user", content="Hello there"),
            Message(
                role="assistant",
                content=[
                    {
                        "type": "text",
                        "text": "Hi! How can I help?",
                    }
                ],
            ),
            Message(
                role="user",
                content=[
                    {"type": "text", "text": "Summarize this"},
                    {"type": "image", "source": {"type": "base64", "data": "abc"}},
                    {
                        "type": "tool_use",
                        "id": "tool_1",
                        "name": "search",
                        "input": {"query": "usage"},
                    },
                    {
                        "type": "tool_result",
                        "tool_use_id": "tool_1",
                        "content": "results",
                    },
                ],
            ),
        ],
    )


def test_extract_prompt_includes_system_and_messages():
    prompt = extract_prompt(_sample_request())

    assert "You are a helpful assistant." in prompt
    assert "<user> Hello there" in prompt
    assert "<assistant> Hi! How can I help?" in prompt
    assert "Summarize this" in prompt
    assert "[image]" in prompt
    assert "[tool_use: search]" in prompt
    assert "[tool_result]" in prompt


def test_extract_prompt_caps_at_limit():
    long_text = "x" * (80 * 1024)
    request = MessagesRequest(
        model="gpt-4o",
        messages=[Message(role="user", content=long_text)],
    )

    prompt = extract_prompt(request)

    assert len(prompt.encode("utf-8")) <= 64 * 1024
    assert prompt.endswith("[truncated]")


def test_extract_prompt_handles_missing_optional_fields():
    request = MessagesRequest(
        model="gpt-4o",
        messages=[Message(role="user", content="simple")],
    )

    assert "<user> simple" in extract_prompt(request)


def test_usage_tracking_stream_captures_message_delta(tmp_path, _isolated_singleton):
    buffer = init_buffer(tmp_path / "usage.json")
    pending = PendingUsageRecord(
        request_id="req-1",
        started_at=time.time(),
        provider="openai_compatible_1",
        provider_model="gpt-4o",
        gateway_model="gpt-4o",
        wire_api="messages",
        input_tokens=10,
        prompt="prompt text",
    )

    async def inner():
        yield 'event: content_block_start\ndata: {"type":"content_block_start"}\n\n'
        yield (
            'event: message_delta\ndata: {"type":"message_delta","usage":'
            '{"input_tokens":10,"output_tokens":25,"cache_creation_input_tokens":5,'
            '"cache_read_input_tokens":3,"reasoning_tokens":2}}\n\n'
        )

    async def drive():
        stream = UsageTrackingStream(inner(), pending)
        return [chunk async for chunk in stream]

    chunks = asyncio.run(drive())

    assert len(chunks) == 2
    record = buffer.query()[0]
    assert record.request_id == "req-1"
    assert record.output_tokens == 25
    assert record.cache_creation_tokens == 5
    assert record.cache_read_tokens == 3
    assert record.reasoning_tokens == 2
    assert record.status == "success"


def test_usage_tracking_stream_marks_error(tmp_path, _isolated_singleton):
    buffer = init_buffer(tmp_path / "usage.json")
    pending = PendingUsageRecord(
        request_id="req-2",
        started_at=time.time(),
        provider="openai_compatible_1",
        provider_model="gpt-4o",
        gateway_model="gpt-4o",
        wire_api="messages",
        input_tokens=1,
        prompt="",
    )

    class Boom(RuntimeError):
        pass

    async def inner():
        yield 'event: message_delta\ndata: {"type":"message_delta"}\n\n'
        raise Boom("provider failed")

    async def drive():
        stream = UsageTrackingStream(inner(), pending)
        async for _ in stream:
            pass

    with pytest.raises(Boom):
        asyncio.run(drive())

    record = buffer.query()[0]
    assert record.status == "error"
    assert record.error_type == "Boom"


def test_usage_tracking_stream_marks_cancelled(tmp_path, _isolated_singleton):
    buffer = init_buffer(tmp_path / "usage.json")
    pending = PendingUsageRecord(
        request_id="req-3",
        started_at=time.time(),
        provider="openai_compatible_1",
        provider_model="gpt-4o",
        gateway_model="gpt-4o",
        wire_api="messages",
        input_tokens=1,
        prompt="",
    )

    async def inner():
        yield 'data: {"type":"message_start"}\n\n'
        raise asyncio.CancelledError()

    async def drive():
        stream = UsageTrackingStream(inner(), pending)
        async for _ in stream:
            pass

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(drive())

    record = buffer.query()[0]
    assert record.status == "cancelled"


def test_usage_tracking_stream_aclose_releases_inner_and_records_cancelled(
    tmp_path, _isolated_singleton
):
    buffer = init_buffer(tmp_path / "usage.json")
    pending = PendingUsageRecord(
        request_id="req-close",
        started_at=time.time(),
        provider="p",
        provider_model="m",
        gateway_model="g",
        wire_api="messages",
        input_tokens=1,
        prompt="",
    )
    closed: list[bool] = []

    async def inner():
        try:
            yield 'data: {"type":"message_start"}\n\n'
        finally:
            closed.append(True)

    async def drive():
        stream = UsageTrackingStream(inner(), pending)
        # Consume a chunk so the inner generator is suspended at a yield, as
        # happens in the real executor flow, before closing it early.
        assert await anext(stream) == 'data: {"type":"message_start"}\n\n'
        await stream.aclose()

    asyncio.run(drive())

    assert closed == [True]
    record = buffer.query()[0]
    assert record.status == "cancelled"


def test_usage_tracking_stream_aclose_after_completion_is_idempotent(
    tmp_path, _isolated_singleton
):
    buffer = init_buffer(tmp_path / "usage.json")
    pending = PendingUsageRecord(
        request_id="req-close-after",
        started_at=time.time(),
        provider="p",
        provider_model="m",
        gateway_model="g",
        wire_api="messages",
        input_tokens=1,
        prompt="",
    )

    async def inner():
        yield (
            'event: message_delta\ndata: {"type":"message_delta",'
            '"usage":{"output_tokens":5}}\n\n'
        )

    async def drive():
        stream = UsageTrackingStream(inner(), pending)
        async for _ in stream:
            pass
        await stream.aclose()

    asyncio.run(drive())

    records = buffer.query()
    assert len(records) == 1
    assert records[0].status == "success"
    assert records[0].output_tokens == 5


def test_usage_tracking_stream_ignores_unrelated_events(tmp_path, _isolated_singleton):
    buffer = init_buffer(tmp_path / "usage.json")
    pending = PendingUsageRecord(
        request_id="req-4",
        started_at=time.time(),
        provider="p",
        provider_model="m",
        gateway_model="g",
        wire_api="messages",
        input_tokens=0,
        prompt="",
    )

    async def inner():
        yield 'data: {"type":"content_block_delta","delta":{"type":"text_delta"}}\n\n'

    async def drive():
        stream = UsageTrackingStream(inner(), pending)
        async for _ in stream:
            pass

    asyncio.run(drive())

    record = buffer.query()[0]
    assert record.output_tokens == 0
    assert record.status == "success"


def test_ring_buffer_records_ordering(tmp_path):
    buffer = UsageRingBuffer(tmp_path / "usage.json")
    buffer.push(_record("r1", timestamp=100.0))
    buffer.push(_record("r2", timestamp=200.0))

    assert tuple(r.request_id for r in buffer.records()) == ("r1", "r2")

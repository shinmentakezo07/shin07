"""Round-robin and failover API-key pool for provider credential rotation."""

import asyncio
from collections.abc import Sequence

from free_claude_code.providers.failure_policy import (
    is_transient_overload_error,
    retryable_transient_status,
)

_TRANSIENT_ROTATION_STATUSES = frozenset({429, 500, 502, 503, 504})


class ApiKeyPool:
    """Coordinate rotation across one provider's configured credential keys.

    ``acquire`` returns the current key index, rotating only after
    ``per_key_quota`` consecutive acquires on the same key so a balanced burst
    of requests fans out evenly across the pool. ``mark_failure`` jumps
    immediately to the next key when an upstream error is a transient HTTP
    429/5xx or a reported overload, bypassing the per-key budget for that one
    credential. ``advance`` moves the cursor unconditionally and is preserved
    for callers that want strict one-rotate-per-call semantics.
    """

    __slots__ = ("_calls", "_index", "_keys", "_length", "_lock", "_quota")

    def __init__(self, keys: Sequence[str], *, per_key_quota: int = 3) -> None:
        if per_key_quota < 1:
            raise ValueError("per_key_quota must be >= 1")
        self._keys = tuple(keys)
        if not self._keys:
            raise ValueError("ApiKeyPool requires at least one key")
        self._length = len(self._keys)
        self._quota = per_key_quota
        self._index = 0
        self._calls = 0
        self._lock = asyncio.Lock()

    @property
    def keys(self) -> tuple[str, ...]:
        return self._keys

    @property
    def size(self) -> int:
        return self._length

    @property
    def per_key_quota(self) -> int:
        return self._quota

    async def current(self) -> int:
        """Return the current key index without advancing."""
        async with self._lock:
            return self._index

    async def acquire(self) -> int:
        """Return the current key, rotating after ``per_key_quota`` acquires.

        The first ``per_key_quota - 1`` acquires on a key return its index
        unchanged; the ``per_key_quota``-th advance rotates to the next key
        and resets the count for the new key. Concurrent acquires are
        serialized through the event-loop lock so distinct callers never
        observe a stale index or skip a rotation.
        """
        async with self._lock:
            self._calls += 1
            if self._calls >= self._quota:
                self._index = (self._index + 1) % self._length
                self._calls = 0
            return self._index

    async def advance(self) -> int:
        """Advance to the next key (round-robin) and return its new index.

        Legacy unconditional-rotate contract. Resets the per-key acquire
        counter so a subsequent ``acquire`` chain starts fresh on the new key.
        """
        async with self._lock:
            self._index = (self._index + 1) % self._length
            self._calls = 0
            return self._index

    async def mark_failure(self, error: BaseException) -> tuple[int, int] | None:
        """Rotate to the next key when ``error`` warrants credential failover.

        Returns ``(rotated_from_index, rotated_to_index)`` when the error is a
        transient HTTP 429/5xx or a reported upstream overload; otherwise
        returns ``None`` and leaves the pool unchanged. The rotation resets
        the per-key acquire counter so the new key begins a fresh quota
        window.
        """
        if not self._should_rotate(error):
            return None
        async with self._lock:
            previous = self._index
            self._index = (self._index + 1) % self._length
            self._calls = 0
            return previous, self._index

    @staticmethod
    def _should_rotate(error: BaseException) -> bool:
        status = retryable_transient_status(error)
        if status is not None and status in _TRANSIENT_ROTATION_STATUSES:
            return True
        return is_transient_overload_error(error)

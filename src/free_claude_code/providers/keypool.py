"""Round-robin and failover API-key pool for provider credential rotation."""

import asyncio
from collections.abc import Sequence


class ApiKeyPool:
    """Coordinate rotation across one provider's configured credential keys.

    ``advance`` moves round-robin under an event-loop lock so concurrent
    requests and failover retries observe distinct keys without races. A pool
    with a single key is a no-op rotation target.
    """

    __slots__ = ("_index", "_keys", "_length", "_lock")

    def __init__(self, keys: Sequence[str]) -> None:
        self._keys = tuple(keys)
        if not self._keys:
            raise ValueError("ApiKeyPool requires at least one key")
        self._length = len(self._keys)
        self._index = 0
        self._lock = asyncio.Lock()

    @property
    def keys(self) -> tuple[str, ...]:
        return self._keys

    @property
    def size(self) -> int:
        return self._length

    async def current(self) -> int:
        """Return the current key index without advancing."""
        async with self._lock:
            return self._index

    async def advance(self) -> int:
        """Advance to the next key (round-robin) and return its new index."""
        async with self._lock:
            self._index = (self._index + 1) % self._length
            return self._index

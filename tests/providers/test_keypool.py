"""Tests for multi-key credential pooling: parsing, ApiKeyPool, and provider wiring."""

import asyncio
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from free_claude_code.config.provider_catalog import PROVIDER_CATALOG
from free_claude_code.providers.base import ProviderConfig
from free_claude_code.providers.keypool import ApiKeyPool
from free_claude_code.providers.openai_chat import OpenAIChatProvider
from free_claude_code.providers.runtime import (
    build_provider_config,
    create_provider,
)
from free_claude_code.providers.runtime.config import mask_api_key, split_api_key_pool


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ()),
        ("single-key", ("single-key",)),
        ("key1,key2,key3", ("key1", "key2", "key3")),
        (" key1 , key2 , ", ("key1", "key2")),
        ("key1,,key2", ("key1", "key2")),
    ],
)
def test_split_api_key_pool(raw: str, expected: tuple[str, ...]) -> None:
    assert split_api_key_pool(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", "not set"),
        ("short", "****"),
        ("sk-abcdefgh12345678", "sk-a…5678"),
        ("sk-abcdefgh12345678,sk-second-key", "sk-a…5678"),
    ],
)
def test_mask_api_key(raw: str, expected: str) -> None:
    assert mask_api_key(raw) == expected


def test_api_key_pool_rejects_empty():
    with pytest.raises(ValueError, match="at least one key"):
        ApiKeyPool(())


def test_api_key_pool_rejects_invalid_quota():
    with pytest.raises(ValueError, match="per_key_quota"):
        ApiKeyPool(("a",), per_key_quota=0)


@pytest.mark.asyncio
async def test_api_key_pool_advance_uses_legacy_contract():
    """``advance`` keeps one-rotate-per-call semantics for existing callers."""
    pool = ApiKeyPool(("a", "b", "c"))

    assert pool.size == 3
    assert pool.keys == ("a", "b", "c")
    assert await pool.current() == 0
    assert await pool.advance() == 1
    assert await pool.advance() == 2
    assert await pool.advance() == 0


@pytest.mark.asyncio
async def test_api_key_pool_advance_resets_per_key_quota():
    """A manual ``advance`` resets the quota counter on the new key."""
    pool = ApiKeyPool(("a", "b", "c"), per_key_quota=3)

    # Two acquires stay on key 0 (quota=3 leaves one acquire before rotation).
    assert await pool.acquire() == 0
    assert await pool.acquire() == 0
    # ``advance`` rotates and zeroes the quota counter.
    assert await pool.advance() == 1
    # The new key starts a fresh quota window, so two acquires stay on key 1.
    assert await pool.acquire() == 1
    assert await pool.acquire() == 1
    # One more acquire trips the quota and rotates to key 2.
    assert await pool.acquire() == 2


@pytest.mark.asyncio
async def test_api_key_pool_single_key_wraps_trivially():
    pool = ApiKeyPool(("only",))

    assert await pool.advance() == 0
    assert await pool.acquire() == 0


@pytest.mark.asyncio
async def test_api_key_pool_acquire_default_quota_three():
    """Default quota is three acquires per key before the pool rotates."""
    pool = ApiKeyPool(("a", "b", "c"))

    assert pool.per_key_quota == 3
    indices = [await pool.acquire() for _ in range(9)]

    assert indices == [0, 0, 1, 1, 1, 2, 2, 2, 0]


@pytest.mark.asyncio
async def test_api_key_pool_acquire_with_custom_quota():
    """A smaller quota rotates sooner across the pool."""
    pool = ApiKeyPool(("a", "b", "c"), per_key_quota=2)

    indices = [await pool.acquire() for _ in range(6)]

    # quota=2 ⇒ each key receives ONE acquire before the next rotates the pool.
    assert indices == [0, 1, 1, 2, 2, 0]


@pytest.mark.asyncio
async def test_api_key_pool_advances_under_concurrency_without_races():
    pool = ApiKeyPool(tuple(f"key-{i}" for i in range(20)))

    indices = await asyncio.gather(*[pool.advance() for _ in range(2000)])

    assert len(set(indices)) == 20
    for index in range(20):
        assert index in indices


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status_code",
    [429, 500, 502, 503, 504],
)
async def test_api_key_pool_mark_failure_rotates_on_transient_error(status_code: int):
    """Transient HTTP 429/5xx responses force an immediate rotation."""
    pool = ApiKeyPool(("a", "b", "c"), per_key_quota=5)
    assert await pool.acquire() == 0

    rotated = await pool.mark_failure(_http_status_error(status_code))

    assert rotated == (0, 1)
    assert await pool.current() == 1


@pytest.mark.asyncio
async def test_api_key_pool_mark_failure_resets_quota_after_rotation():
    """A rotation puts the new key on a fresh quota window."""
    pool = ApiKeyPool(("a", "b", "c"), per_key_quota=3)
    assert await pool.acquire() == 0
    assert await pool.acquire() == 0
    assert await pool.acquire() == 1

    assert await pool.mark_failure(_http_status_error(429)) == (1, 2)
    indices = [await pool.acquire() for _ in range(3)]

    assert indices == [2, 2, 0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status_code",
    [400, 401, 403, 404, 422],
)
async def test_api_key_pool_mark_failure_noop_on_non_transient_error(status_code: int):
    """Non-transient errors leave the cursor and quota untouched."""
    pool = ApiKeyPool(("a", "b", "c"), per_key_quota=3)
    assert await pool.acquire() == 0

    assert await pool.mark_failure(_http_status_error(status_code)) is None
    assert await pool.current() == 0
    assert await pool.acquire() == 0


@pytest.mark.asyncio
async def test_api_key_pool_mark_failure_noop_on_unrelated_exception():
    """Exceptions without a transient status do not rotate."""
    pool = ApiKeyPool(("a", "b", "c"), per_key_quota=3)

    assert await pool.mark_failure(RuntimeError("boom")) is None
    assert await pool.current() == 0


@pytest.mark.asyncio
async def test_api_key_pool_mark_failure_single_key_is_harmless():
    """A 1-key pool rotates back to the same index on transient failures."""
    pool = ApiKeyPool(("only",), per_key_quota=3)

    assert await pool.mark_failure(_http_status_error(429)) == (0, 0)
    assert await pool.current() == 0


def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.invalid/v1/chat/completions")
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError("upstream error", request=request, response=response)


def _settings(**overrides):
    settings = MagicMock()
    settings.open_router_proxy = ""
    settings.provider_rate_limit = 40
    settings.provider_rate_window = 60
    settings.provider_max_concurrency = 5
    settings.http_read_timeout = 300.0
    settings.http_write_timeout = 10.0
    settings.http_connect_timeout = 10.0
    settings.log_raw_sse_events = False
    settings.log_api_error_tracebacks = False
    for key, value in overrides.items():
        setattr(settings, key, value)
    return settings


def test_build_provider_config_exposes_key_pool():
    descriptor = PROVIDER_CATALOG["open_router"]

    config = build_provider_config(
        descriptor,
        _settings(**{"open_router_api_key": "r1, r2, r3"}),
    )

    assert config.api_key == "r1"
    assert config.api_keys == ("r1", "r2", "r3")


def test_build_provider_config_single_key_pool():
    descriptor = PROVIDER_CATALOG["deepseek"]

    config = build_provider_config(
        descriptor,
        _settings(deepseek_api_key="d1"),
    )

    assert config.api_key == "d1"
    assert config.api_keys == ("d1",)


def test_provider_creates_one_client_per_key():
    with patch(
        "free_claude_code.providers.openai_chat.provider.AsyncOpenAI"
    ) as client_cls:
        provider = create_provider(
            "open_router",
            _settings(open_router_api_key="k1, k2"),
        )

    assert isinstance(provider, OpenAIChatProvider)
    assert client_cls.call_count == 2
    client_args = [call.kwargs.get("api_key") for call in client_cls.call_args_list]
    assert client_args == ["k1", "k2"]
    assert provider._pool is not None
    assert provider._pool.size == 2
    assert provider._pool.per_key_quota == 3
    assert len(provider._clients) == 2


@pytest.mark.asyncio
async def test_acquire_client_respects_per_key_quota():
    """``_acquire_client`` now batches three acquires per key by default."""
    with patch("free_claude_code.providers.openai_chat.provider.AsyncOpenAI"):
        provider = cast(
            OpenAIChatProvider,
            create_provider(
                "open_router",
                _settings(open_router_api_key="k1, k2, k3"),
            ),
        )

    assert provider._pool is not None
    assert provider._pool.size == 3
    assert provider._pool.per_key_quota == 3
    indexes = []
    for _ in range(6):
        await provider._acquire_client()
        indexes.append(await provider._pool.current())

    assert indexes == [0, 0, 1, 1, 1, 2]
    assert indexes[0] != indexes[3]


@pytest.mark.asyncio
async def test_single_key_provider_acquires_same_client():
    config = ProviderConfig(
        api_key="only-key",
        base_url="https://openrouter.ai/api/v1",
        api_keys=("only-key",),
    )

    with patch("free_claude_code.providers.openai_chat.provider.AsyncOpenAI"):
        provider = OpenAIChatProvider(
            config, profile=MagicMock(), admission=MagicMock()
        )

    assert provider._pool is None
    assert await provider._acquire_client() is provider._client


@pytest.mark.asyncio
async def test_cleanup_closes_every_client_in_pool():
    client_a = MagicMock()
    client_a.close = AsyncMock()
    client_b = MagicMock()
    client_b.close = AsyncMock()
    with patch(
        "free_claude_code.providers.openai_chat.provider.AsyncOpenAI",
        side_effect=[client_a, client_b],
    ):
        provider = create_provider(
            "open_router",
            _settings(open_router_api_key="k1, k2"),
        )

    await provider.cleanup()

    client_a.close.assert_awaited_once()
    client_b.close.assert_awaited_once()

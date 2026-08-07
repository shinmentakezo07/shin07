"""Tests for multi-key credential pooling: parsing, ApiKeyPool, and provider wiring."""

import asyncio
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from free_claude_code.config.provider_catalog import PROVIDER_CATALOG
from free_claude_code.providers.base import ProviderConfig
from free_claude_code.providers.keypool import ApiKeyPool
from free_claude_code.providers.openai_chat import OpenAIChatProvider
from free_claude_code.providers.runtime import (
    build_provider_config,
    create_provider,
)
from free_claude_code.providers.runtime.config import split_api_key_pool


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


def test_api_key_pool_rejects_empty():
    with pytest.raises(ValueError, match="at least one key"):
        ApiKeyPool(())


@pytest.mark.asyncio
async def test_api_key_pool_round_robin_advances():
    pool = ApiKeyPool(("a", "b", "c"))

    assert pool.size == 3
    assert pool.keys == ("a", "b", "c")
    assert await pool.current() == 0
    assert await pool.advance() == 1
    assert await pool.advance() == 2
    assert await pool.advance() == 0


@pytest.mark.asyncio
async def test_api_key_pool_single_key_wraps_trivially():
    pool = ApiKeyPool(("only",))

    assert await pool.advance() == 0


@pytest.mark.asyncio
async def test_api_key_pool_advances_under_concurrency_without_races():
    pool = ApiKeyPool(tuple(f"key-{i}" for i in range(20)))

    indices = await asyncio.gather(*[pool.advance() for _ in range(2000)])

    assert len(set(indices)) == 20
    for index in range(20):
        assert index in indices


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
    assert len(provider._clients) == 2


@pytest.mark.asyncio
async def test_acquire_client_round_robins_across_keys():
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
    indexes = []
    for _ in range(6):
        await provider._acquire_client()
        indexes.append(await provider._pool.current())

    assert indexes == [1, 2, 0, 1, 2, 0]


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

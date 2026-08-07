"""Tests for admin multi-key pool token helpers and manifest wiring."""

import pytest

from free_claude_code.config.admin.keys import (
    pool_token,
    pool_tokens,
    resolve_key_pool,
    split_key_pool,
)
from free_claude_code.config.admin.manifest import FIELD_BY_KEY
from free_claude_code.config.provider_catalog import (
    PROVIDER_CATALOG,
    ProviderAuthKind,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", ()),
        ("a", ("a",)),
        ("a, b, c", ("a", "b", "c")),
        ("a,,b", ("a", "b")),
    ],
)
def test_split_key_pool(raw: str, expected: tuple[str, ...]) -> None:
    assert split_key_pool(raw) == expected


def test_pool_tokens_are_indexed():
    assert pool_tokens("a, b, c") == (
        "__fcc_key_0__",
        "__fcc_key_1__",
        "__fcc_key_2__",
    )
    assert pool_tokens("") == ()


def test_pool_token_format():
    assert pool_token(0) == "__fcc_key_0__"
    assert pool_token(5) == "__fcc_key_5__"


def test_resolve_key_pool_expands_tokens_and_keeps_new_keys():
    submitted = "__fcc_key_0__,,__fcc_key_2__,new-key"

    resolved = resolve_key_pool(submitted, "a, b, c")

    assert resolved == "a,c,new-key"


def test_resolve_key_pool_keeps_plain_values_when_no_tokens():
    assert resolve_key_pool("new-key", "") == "new-key"


def test_resolve_key_pool_respects_missing_stored_index():
    # A token referencing a stored key that no longer exists is dropped.
    assert resolve_key_pool("__fcc_key_1__,__fcc_key_9__", "a") == ""


def test_resolve_key_pool_returns_empty_for_empty_submission():
    assert resolve_key_pool("", "a, b") == ""


def test_all_catalog_credential_fields_are_pool_supported() -> None:
    missing: list[str] = []
    for provider_id, desc in PROVIDER_CATALOG.items():
        if desc.auth_kind is ProviderAuthKind.CONNECTED_ACCOUNT:
            continue
        if desc.credential_env is None:
            continue
        entry = FIELD_BY_KEY.get(desc.credential_env)
        if entry is None:
            continue
        if not entry.pool_supported:
            missing.append(f"{provider_id}: {desc.credential_env} not pool_supported")
    assert not missing, "\n".join(missing)

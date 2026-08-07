"""Admin key-pool token helpers for multi-key provider credentials.

Provider credential env vars may hold a comma-separated pool of keys. The Admin
UI never sees raw keys: it receives one opaque ``__fcc_key_N__`` token per stored
key, edits the token list locally, and submits the joined list. These helpers
generate and resolve those tokens against the currently stored value.
"""

import re

POOL_TOKEN_RE = re.compile(r"^__fcc_key_(\d+)__$")
POOL_TOKEN_PREFIX = "__fcc_key_"
POOL_TOKEN_SUFFIX = "__"


def split_key_pool(value: str) -> tuple[str, ...]:
    """Split a comma-separated credential pool into non-empty trimmed keys."""
    return tuple(part.strip() for part in value.split(",") if part.strip())


def pool_token(index: int) -> str:
    """Return the opaque UI token for the stored key at ``index``."""
    return f"{POOL_TOKEN_PREFIX}{index}{POOL_TOKEN_SUFFIX}"


def pool_tokens(stored: str) -> tuple[str, ...]:
    """Return one token per stored key in a comma-separated credential pool."""
    return tuple(pool_token(index) for index in range(len(split_key_pool(stored))))


def resolve_key_pool(submitted: str, stored: str) -> str:
    """Expand UI pool tokens back into the stored keys they reference.

    ``submitted`` is the comma-joined Admin value: tokens for keys the UI kept,
    and raw values for newly added keys. ``stored`` is the current persisted
    pool, used to expand each token by its stored index.
    """

    stored_keys = split_key_pool(stored)
    parts: list[str] = []
    for part in submitted.split(","):
        token = part.strip()
        match = POOL_TOKEN_RE.fullmatch(token)
        if match is not None:
            index = int(match.group(1))
            if index < len(stored_keys):
                parts.append(stored_keys[index])
            continue
        if token:
            parts.append(token)
    return ",".join(parts)

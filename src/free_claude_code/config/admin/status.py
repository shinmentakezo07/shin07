"""Provider configuration status for the Admin UI."""

import json
from collections.abc import Mapping
from typing import Any

from free_claude_code.config.provider_catalog import (
    PROVIDER_CATALOG,
    ProviderAuthKind,
)

from .manifest import FIELDS


def provider_config_status(
    state: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Return provider configuration status without making network calls."""
    instance_raw = str(state.get("OPENAI_COMPATIBLE_INSTANCES", {}).get("value", ""))
    has_instances = _openai_compatible_instances_present(instance_raw)
    statuses: list[dict[str, Any]] = []
    for provider_id, descriptor in PROVIDER_CATALOG.items():
        if provider_id == "openai_compatible" and has_instances:
            # Numbered instances replace the single-endpoint status entry.
            continue
        if descriptor.auth_kind is ProviderAuthKind.CONNECTED_ACCOUNT:
            statuses.append(
                {
                    "provider_id": provider_id,
                    "display_name": descriptor.display_name,
                    "kind": "connected_account",
                    "status": "disconnected",
                    "label": "Not connected",
                }
            )
            continue
        if descriptor.local:
            base_url = ""
            if descriptor.base_url_attr is not None:
                base_url = _value_for_settings_attr(state, descriptor.base_url_attr)
            statuses.append(
                {
                    "provider_id": provider_id,
                    "display_name": descriptor.display_name,
                    "kind": "local",
                    "status": "missing_url" if not base_url.strip() else "unknown",
                    "label": "Missing URL" if not base_url.strip() else "Not checked",
                    "base_url": base_url or descriptor.default_base_url or "",
                }
            )
            continue

        configuration_attrs = descriptor.configuration_attrs()
        missing_attrs = tuple(
            attr
            for attr in configuration_attrs
            if not _value_for_settings_attr(state, attr).strip()
        )
        configured = not missing_attrs
        configuration = " + ".join(
            _field_key_for_settings_attr(attr) for attr in configuration_attrs
        )
        missing_key = descriptor.credential_attr in missing_attrs
        statuses.append(
            {
                "provider_id": provider_id,
                "display_name": descriptor.display_name,
                "kind": "remote",
                "status": (
                    "configured"
                    if configured
                    else "missing_key"
                    if missing_key
                    else "missing_config"
                ),
                "label": (
                    "Configured"
                    if configured
                    else "Missing key"
                    if missing_key
                    else "Missing configuration"
                ),
                "configuration": configuration,
            }
        )
    statuses.extend(_openai_compatible_instance_statuses(instance_raw))
    return statuses


def _openai_compatible_instances_present(raw: str) -> bool:
    """Return whether a non-empty instances list is configured."""
    if not raw.strip():
        return False
    try:
        parsed = json.loads(raw)
    except ValueError:
        return False
    return isinstance(parsed, list) and bool(parsed)


def _openai_compatible_instance_statuses(raw: str) -> list[dict[str, Any]]:
    """Return one status entry per numbered endpoint instance."""
    if not raw.strip():
        return []
    try:
        instances = json.loads(raw)
    except ValueError:
        return []
    if not isinstance(instances, list):
        return []
    statuses: list[dict[str, Any]] = []
    for index, instance in enumerate(instances, start=1):
        if not isinstance(instance, dict):
            continue
        base_url = str(instance.get("base_url", "") or "")
        configured = bool(base_url.strip())
        raw_models = instance.get("models")
        if isinstance(raw_models, list):
            models = [
                str(model)
                for model in raw_models
                if isinstance(model, str) and model.strip()
            ]
        else:
            models = []
        statuses.append(
            {
                "provider_id": f"openai_compatible_{index}",
                "display_name": f"OpenAI-Compatible Endpoint #{index}",
                "kind": "remote",
                "status": "configured" if configured else "missing_config",
                "label": "Configured" if configured else "Missing base URL",
                "base_url": base_url,
                "configuration": "OPENAI_COMPATIBLE_BASE_URL",
                "models": models,
            }
        )
    return statuses


def _value_for_settings_attr(
    state: Mapping[str, Mapping[str, Any]], settings_attr: str
) -> str:
    for field in FIELDS:
        if field.settings_attr == settings_attr:
            return str(state.get(field.key, {}).get("value", field.default))
    return ""


def _field_key_for_settings_attr(settings_attr: str) -> str:
    for field in FIELDS:
        if field.settings_attr == settings_attr:
            return field.key
    raise AssertionError(f"No admin field owns settings attribute {settings_attr!r}")

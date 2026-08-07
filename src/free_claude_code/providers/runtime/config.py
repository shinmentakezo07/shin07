"""Provider configuration construction from neutral catalog metadata."""

from free_claude_code.application.errors import ApplicationUnavailableError
from free_claude_code.config.provider_catalog import (
    OPENAI_COMPATIBLE_INSTANCE_RE,
    ProviderDescriptor,
)
from free_claude_code.config.settings import OpenAICompatibleInstance, Settings
from free_claude_code.providers.base import ProviderConfig


def string_setting(settings: Settings, attr_name: str | None, default: str = "") -> str:
    """Return a string-valued settings attribute, ignoring non-string mocks."""
    if attr_name is None:
        return default
    value = getattr(settings, attr_name, default)
    return value if isinstance(value, str) else default


def split_api_key_pool(value: str) -> tuple[str, ...]:
    """Split a comma-separated credential value into a non-empty key pool."""
    return tuple(part.strip() for part in value.split(",") if part.strip())


def provider_credential(descriptor: ProviderDescriptor, settings: Settings) -> str:
    """Return the configured credential for a provider descriptor."""
    if descriptor.static_credential is not None:
        return descriptor.static_credential
    if descriptor.credential_attr:
        return string_setting(settings, descriptor.credential_attr)
    return ""


def has_provider_configuration(
    descriptor: ProviderDescriptor, settings: Settings
) -> bool:
    """Return whether all provider-defining settings are present."""
    attrs = descriptor.configuration_attrs()
    if attrs:
        return all(string_setting(settings, attr).strip() for attr in attrs)
    return descriptor.static_credential is not None


def require_provider_credential(
    descriptor: ProviderDescriptor, credential: str
) -> None:
    """Raise a user-facing configuration error when a required key is missing."""
    if descriptor.credential_env is None:
        return
    if credential and credential.strip():
        return
    message = f"{descriptor.credential_env} is not set. Add it to your .env file."
    if descriptor.credential_url:
        message = f"{message} Get a key at {descriptor.credential_url}"
    raise ApplicationUnavailableError(message)


def build_provider_config(
    descriptor: ProviderDescriptor, settings: Settings
) -> ProviderConfig:
    """Build shared provider configuration for one provider descriptor."""
    credential = provider_credential(descriptor, settings)
    require_provider_credential(descriptor, credential)
    api_keys = split_api_key_pool(credential)
    if not api_keys:
        api_keys = (credential,)
    base_url = string_setting(
        settings, descriptor.base_url_attr, descriptor.default_base_url or ""
    )
    resolved_base_url = base_url or descriptor.default_base_url
    if not resolved_base_url:
        if descriptor.base_url_attr is None:
            raise AssertionError(
                f"Provider {descriptor.provider_id!r} has no base URL owner."
            )
        field = Settings.model_fields[descriptor.base_url_attr]
        env_name = field.validation_alias or descriptor.base_url_attr
        raise ApplicationUnavailableError(
            f"{env_name} is not set. Add it to your .env file."
        )
    proxy = string_setting(settings, descriptor.proxy_attr)
    return ProviderConfig(
        api_key=api_keys[0],
        base_url=resolved_base_url,
        api_keys=api_keys,
        rate_limit=settings.provider_rate_limit,
        rate_window=settings.provider_rate_window,
        max_concurrency=settings.provider_max_concurrency,
        http_read_timeout=settings.http_read_timeout,
        http_write_timeout=settings.http_write_timeout,
        http_connect_timeout=settings.http_connect_timeout,
        proxy=proxy,
        log_raw_sse_events=settings.log_raw_sse_events,
        log_api_error_tracebacks=settings.log_api_error_tracebacks,
    )


def openai_compatible_instance_ids(settings: Settings) -> tuple[str, ...]:
    """Return numbered provider ids for configured endpoint instances."""
    return tuple(
        f"openai_compatible_{index}"
        for index, instance in enumerate(settings.openai_compatible_instances, start=1)
        if instance.base_url.strip()
    )


def resolve_openai_compatible_instance(
    provider_id: str, settings: Settings
) -> tuple[OpenAICompatibleInstance | None, str | None]:
    """Resolve a numbered OpenAI-compatible instance provider id.

    Returns ``(instance, None)`` for a usable numbered id, ``(None, error)``
    for a numbered id that is unknown or not yet configured, and ``(None, None)``
    when the id is not an OpenAI-compatible instance id so callers can fall
    back to the catalog.
    """
    instances = settings.openai_compatible_instances
    if not isinstance(instances, tuple):
        return None, None
    if provider_id == "openai_compatible":
        if instances and instances[0].base_url.strip():
            return instances[0], None
        return None, None
    match = OPENAI_COMPATIBLE_INSTANCE_RE.fullmatch(provider_id)
    if match is None:
        return None, None
    index = int(match.group(1)) - 1
    if index < 0 or index >= len(instances):
        configured = ", ".join(openai_compatible_instance_ids(settings)) or "none"
        return None, (
            f"Unknown provider_type: '{provider_id}'. "
            f"Configured OpenAI-compatible instances: {configured}"
        )
    instance = instances[index]
    if not instance.base_url.strip():
        return None, (
            f"Provider '{provider_id}' has no base URL. Configure it on the "
            "OpenAI-Compatible Endpoints page."
        )
    return instance, None


def build_openai_compatible_instance_config(
    provider_id: str,
    instance: OpenAICompatibleInstance,
    settings: Settings,
) -> ProviderConfig:
    """Build shared provider configuration for one numbered endpoint instance."""
    api_keys = split_api_key_pool(instance.api_keys)
    if not api_keys:
        api_keys = (instance.api_keys,)
    return ProviderConfig(
        api_key=api_keys[0],
        base_url=instance.base_url,
        api_keys=api_keys,
        rate_limit=settings.provider_rate_limit,
        rate_window=settings.provider_rate_window,
        max_concurrency=settings.provider_max_concurrency,
        http_read_timeout=settings.http_read_timeout,
        http_write_timeout=settings.http_write_timeout,
        http_connect_timeout=settings.http_connect_timeout,
        proxy=instance.proxy,
        log_raw_sse_events=settings.log_raw_sse_events,
        log_api_error_tracebacks=settings.log_api_error_tracebacks,
    )

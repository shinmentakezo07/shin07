from unittest.mock import patch

import pytest

from free_claude_code.application.errors import UnknownProviderError
from free_claude_code.application.routing import ModelRouter
from free_claude_code.config.provider_catalog import PROVIDER_CATALOG
from free_claude_code.config.reasoning import ReasoningPreference
from free_claude_code.config.settings import OpenAICompatibleInstance, Settings
from free_claude_code.core.anthropic.models import (
    Message,
    MessagesRequest,
    TokenCountRequest,
)
from free_claude_code.core.reasoning import ReasoningControl, ReasoningEffort


@pytest.fixture
def settings():
    settings = Settings()
    settings.model = "nvidia_nim/fallback-model"
    settings.model_fable = None
    settings.model_opus = None
    settings.model_sonnet = None
    settings.model_haiku = None
    settings.reasoning_policy = ReasoningPreference.CLIENT
    settings.reasoning_fable = ReasoningPreference.INHERIT
    settings.reasoning_opus = ReasoningPreference.INHERIT
    settings.reasoning_sonnet = ReasoningPreference.INHERIT
    settings.reasoning_haiku = ReasoningPreference.INHERIT
    return settings


def test_model_router_resolves_default_model(settings):
    resolved = ModelRouter(settings).resolve("claude-3-opus")

    assert resolved.original_model == "claude-3-opus"
    assert resolved.provider_id == "nvidia_nim"
    assert resolved.provider_model == "fallback-model"
    assert resolved.provider_model_ref == "nvidia_nim/fallback-model"
    assert resolved.reasoning_preference is ReasoningPreference.CLIENT


def test_model_router_applies_opus_override(settings):
    settings.model_opus = "open_router/deepseek/deepseek-r1"

    request = MessagesRequest(
        model="claude-opus-4-20250514",
        max_tokens=100,
        messages=[Message(role="user", content="hello")],
    )
    routed = ModelRouter(settings).resolve_messages_request(request)

    assert routed.request.model == "deepseek/deepseek-r1"
    assert routed.resolved.provider_model_ref == "open_router/deepseek/deepseek-r1"
    assert routed.resolved.original_model == "claude-opus-4-20250514"
    assert routed.reasoning.control is ReasoningControl.DEFAULT
    assert request.model == "claude-opus-4-20250514"


def test_model_router_applies_fable_override(settings):
    settings.model_fable = "open_router/anthropic/claude-fable-5"

    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="claude-fable-5",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "anthropic/claude-fable-5"
    assert routed.resolved.provider_model_ref == "open_router/anthropic/claude-fable-5"
    assert routed.resolved.original_model == "claude-fable-5"


def test_model_router_resolves_route_reasoning_preferences(settings):
    settings.reasoning_policy = ReasoningPreference.OFF
    settings.reasoning_fable = ReasoningPreference.HIGH
    settings.reasoning_opus = ReasoningPreference.MAX
    settings.reasoning_haiku = ReasoningPreference.OFF

    router = ModelRouter(settings)

    assert (
        router.resolve("claude-fable-5").reasoning_preference
        is ReasoningPreference.HIGH
    )
    assert (
        router.resolve("claude-opus-4-20250514").reasoning_preference
        is ReasoningPreference.MAX
    )
    assert (
        router.resolve("claude-sonnet-4-20250514").reasoning_preference
        is ReasoningPreference.OFF
    )
    assert (
        router.resolve("claude-3-haiku-20240307").reasoning_preference
        is ReasoningPreference.OFF
    )
    assert router.resolve("claude-2.1").reasoning_preference is ReasoningPreference.OFF


def test_model_router_applies_haiku_override(settings):
    settings.model_haiku = "lmstudio/qwen2.5-7b"

    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="claude-3-haiku-20240307",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "qwen2.5-7b"
    assert routed.resolved.provider_model_ref == "lmstudio/qwen2.5-7b"


def test_model_router_applies_sonnet_override(settings):
    settings.model_sonnet = "nvidia_nim/meta/llama-3.3-70b-instruct"

    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "meta/llama-3.3-70b-instruct"
    assert (
        routed.resolved.provider_model_ref == "nvidia_nim/meta/llama-3.3-70b-instruct"
    )


def test_model_router_routes_prefixed_provider_model_directly(settings):
    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="deepseek/deepseek-chat",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "deepseek-chat"
    assert routed.resolved.original_model == "deepseek/deepseek-chat"
    assert routed.resolved.provider_id == "deepseek"
    assert routed.resolved.provider_model == "deepseek-chat"
    assert routed.resolved.provider_model_ref == "deepseek/deepseek-chat"


def test_model_router_routes_explicit_opencode_zen_prefix(settings):
    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="opencode_zen/kimi-k2.6",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "kimi-k2.6"
    assert routed.resolved.provider_id == "opencode_zen"
    assert routed.resolved.provider_model_ref == "opencode_zen/kimi-k2.6"


def test_model_router_routes_wafer_provider_model_directly(settings):
    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="wafer/DeepSeek-V4-Pro",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "DeepSeek-V4-Pro"
    assert routed.resolved.provider_id == "wafer"
    assert routed.resolved.provider_model == "DeepSeek-V4-Pro"
    assert routed.resolved.provider_model_ref == "wafer/DeepSeek-V4-Pro"


def test_model_router_routes_minimax_provider_model_directly(settings):
    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="minimax/MiniMax-M3",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "MiniMax-M3"
    assert routed.resolved.provider_id == "minimax"
    assert routed.resolved.provider_model == "MiniMax-M3"
    assert routed.resolved.provider_model_ref == "minimax/MiniMax-M3"


def test_model_router_routes_gateway_encoded_provider_model_directly(settings):
    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="anthropic/nvidia_nim/deepseek-ai/deepseek-v4-pro",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "deepseek-ai/deepseek-v4-pro"
    assert (
        routed.resolved.original_model
        == "anthropic/nvidia_nim/deepseek-ai/deepseek-v4-pro"
    )
    assert routed.resolved.provider_id == "nvidia_nim"
    assert routed.resolved.provider_model == "deepseek-ai/deepseek-v4-pro"
    assert (
        routed.resolved.provider_model_ref
        == "anthropic/nvidia_nim/deepseek-ai/deepseek-v4-pro"
    )


def test_model_router_routes_no_thinking_gateway_model_directly(settings):
    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="claude-3-freecc-no-thinking/nvidia_nim/deepseek-ai/deepseek-v4-pro",
            max_tokens=100,
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.request.model == "deepseek-ai/deepseek-v4-pro"
    assert (
        routed.resolved.original_model
        == "claude-3-freecc-no-thinking/nvidia_nim/deepseek-ai/deepseek-v4-pro"
    )
    assert routed.resolved.provider_id == "nvidia_nim"
    assert routed.resolved.provider_model == "deepseek-ai/deepseek-v4-pro"
    assert routed.reasoning.control is ReasoningControl.OFF


def test_direct_provider_model_uses_root_policy_without_model_name_guessing(settings):
    settings.reasoning_policy = ReasoningPreference.LOW
    settings.reasoning_opus = ReasoningPreference.MAX

    routed = ModelRouter(settings).resolve_messages_request(
        MessagesRequest(
            model="open_router/anthropic/claude-opus-4",
            messages=[Message(role="user", content="hello")],
        )
    )

    assert routed.resolved.provider_id == "open_router"
    assert routed.resolved.provider_model == "anthropic/claude-opus-4"
    assert routed.reasoning.effort is ReasoningEffort.LOW


def test_model_router_routes_token_count_request(settings):
    settings.model_haiku = "lmstudio/qwen2.5-7b"

    request = TokenCountRequest(
        model="claude-3-haiku-20240307",
        messages=[Message(role="user", content="hello")],
    )
    routed = ModelRouter(settings).resolve_token_count_request(request)

    assert routed.request.model == "qwen2.5-7b"
    assert request.model == "claude-3-haiku-20240307"


def test_model_router_logs_mapping(settings):
    with patch("free_claude_code.application.routing.logger.debug") as mock_log:
        ModelRouter(settings).resolve("claude-2.1")

    mock_log.assert_called()
    args = mock_log.call_args[0]
    assert "MODEL MAPPING" in args[0]
    assert args[1] == "claude-2.1"
    assert args[2] == "fallback-model"


def test_model_router_preserves_typed_error_for_unknown_mapped_provider(settings):
    settings.model = "unknown/model"

    with pytest.raises(UnknownProviderError) as exc_info:
        ModelRouter(settings).resolve("claude-2.1")

    supported = "', '".join(PROVIDER_CATALOG)
    assert str(exc_info.value) == (
        f"Unknown provider_type: 'unknown'. Supported: '{supported}'"
    )


def test_model_router_routes_numbered_openai_compatible_instance(settings):
    settings.model = "openai_compatible_1/GPT 5.6 Luna"

    resolved = ModelRouter(settings).resolve("claude-2.1")

    assert resolved.provider_id == "openai_compatible_1"
    assert resolved.provider_model == "GPT 5.6 Luna"
    assert resolved.provider_model_ref == "openai_compatible_1/GPT 5.6 Luna"


def test_model_router_defers_instance_existence_to_provider_factory(settings):
    # Numbered instance ids are dynamic (settings.openai_compatible_instances),
    # so route validation accepts the numbering scheme and the provider
    # factory reports which instance numbers are actually configured.
    settings.model = "openai_compatible_999/some-model"

    resolved = ModelRouter(settings).resolve("claude-2.1")

    assert resolved.provider_id == "openai_compatible_999"
    assert resolved.provider_model == "some-model"


def test_model_router_resolves_bare_endpoint_model(settings):
    # The numbered-instance prefix is optional: a bare model id resolves to
    # the single endpoint that advertises it.
    settings.model = "deepseek-chat"
    settings.openai_compatible_instances = (
        OpenAICompatibleInstance(
            base_url="https://one.example/v1",
            api_keys="key-a,key-b",
            models=("deepseek-chat",),
        ),
    )

    resolved = ModelRouter(settings).resolve("claude-2.1")

    assert resolved.provider_id == "openai_compatible_1"
    assert resolved.provider_model == "deepseek-chat"
    assert resolved.provider_model_ref == "openai_compatible_1/deepseek-chat"
    assert resolved.reasoning_preference is ReasoningPreference.CLIENT


def test_model_router_round_robins_bare_model_across_instances(settings):
    # The same model id on several endpoints rotates provider (and its key
    # pool) across requests instead of pinning one endpoint.
    settings.model = "deepseek-chat"
    settings.openai_compatible_instances = (
        OpenAICompatibleInstance(
            base_url="https://one.example/v1",
            api_keys="key-a",
            models=("deepseek-chat",),
        ),
        OpenAICompatibleInstance(
            base_url="https://two.example/v1",
            api_keys="key-b,key-c",
            models=("deepseek-chat",),
        ),
    )
    router = ModelRouter(settings)

    first = router.resolve("claude-2.1")
    second = router.resolve("claude-2.1")

    assert {first.provider_id, second.provider_id} == {
        "openai_compatible_1",
        "openai_compatible_2",
    }
    assert first.provider_model_ref == f"{first.provider_id}/deepseek-chat"
    assert second.provider_model_ref == f"{second.provider_id}/deepseek-chat"


def test_model_router_logs_multi_provider_rotation_with_masked_keys(settings):
    settings.model = "shared-model"
    settings.openai_compatible_instances = (
        OpenAICompatibleInstance(
            base_url="https://one.example/v1",
            api_keys="sk-abcdefgh12345678",
            models=("shared-model",),
        ),
        OpenAICompatibleInstance(
            base_url="https://two.example/v1",
            api_keys="sk-zyxwvuts87654321",
            models=("shared-model",),
        ),
    )

    with patch("free_claude_code.application.routing.logger.info") as mock_log:
        ModelRouter(settings).resolve("claude-2.1")

    mock_log.assert_called_once()
    message = mock_log.call_args[0][0].format(*mock_log.call_args[0][1:])
    assert "MODEL MULTI-PROVIDER" in message
    assert "openai_compatible_1" in message
    assert "openai_compatible_2" in message
    assert "1 key" in message
    # Raw keys are never logged; only masked tails are.
    assert "sk-abcdefgh12345678" not in message
    assert "sk-zyxwvuts87654321" not in message
    assert "…5678" in message
    assert "…4321" in message


def test_model_router_bare_endpoint_model_applies_route_reasoning(settings):
    settings.model_opus = "deepseek-chat"
    settings.reasoning_opus = ReasoningPreference.OFF
    settings.openai_compatible_instances = (
        OpenAICompatibleInstance(
            base_url="https://one.example/v1",
            api_keys="key-a",
            models=("deepseek-chat",),
        ),
    )

    resolved = ModelRouter(settings).resolve("claude-opus-4-20250514")

    assert resolved.provider_id == "openai_compatible_1"
    assert resolved.provider_model_ref == "openai_compatible_1/deepseek-chat"
    assert resolved.reasoning_preference is ReasoningPreference.OFF


def test_model_router_unknown_bare_model_still_raises(settings):
    # A bare id that no endpoint advertises keeps the previous behavior:
    # it is treated as an unknown provider type rather than silently routed.
    settings.model = "no-such-model"
    settings.openai_compatible_instances = (
        OpenAICompatibleInstance(
            base_url="https://one.example/v1",
            api_keys="key-a",
            models=("other-model",),
        ),
    )

    with pytest.raises(UnknownProviderError):
        ModelRouter(settings).resolve("claude-2.1")

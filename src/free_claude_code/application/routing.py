"""Model routing for Claude-compatible requests."""

from dataclasses import dataclass

from loguru import logger

from free_claude_code.application.errors import UnknownProviderError
from free_claude_code.config.model_refs import parse_model_name, parse_provider_type
from free_claude_code.config.provider_catalog import (
    OPENAI_COMPATIBLE_INSTANCE_RE,
    PROVIDER_CATALOG,
    SUPPORTED_PROVIDER_IDS,
)
from free_claude_code.config.reasoning import ReasoningPreference
from free_claude_code.config.settings import OpenAICompatibleInstance, Settings
from free_claude_code.core.anthropic import MessagesRequest, TokenCountRequest
from free_claude_code.core.gateway_model_ids import decode_gateway_model_id
from free_claude_code.core.reasoning import ReasoningPolicy
from free_claude_code.providers.runtime.config import (
    mask_api_key,
    openai_compatible_model_candidates,
    split_api_key_pool,
)

from .reasoning import resolve_reasoning_policy

_ROUTE_SETTINGS = (
    ("fable", "model_fable", "reasoning_fable"),
    ("opus", "model_opus", "reasoning_opus"),
    ("haiku", "model_haiku", "reasoning_haiku"),
    ("sonnet", "model_sonnet", "reasoning_sonnet"),
)


@dataclass(frozen=True, slots=True)
class ResolvedModel:
    original_model: str
    provider_id: str
    provider_model: str
    provider_model_ref: str
    reasoning_preference: ReasoningPreference


@dataclass(frozen=True, slots=True)
class RoutedMessagesRequest:
    request: MessagesRequest
    resolved: ResolvedModel
    reasoning: ReasoningPolicy


@dataclass(frozen=True, slots=True)
class RoutedTokenCountRequest:
    request: TokenCountRequest
    resolved: ResolvedModel


class ModelRouter:
    """Resolve incoming Claude model names to configured provider/model pairs."""

    def __init__(self, settings: Settings):
        self._settings = settings
        # Per-model rotation counters for bare model ids served by multiple
        # OpenAI-compatible endpoints. Best-effort rotation across requests;
        # exact fairness is not required for request distribution.
        self._rotations: dict[str, int] = {}

    def resolve(self, claude_model_name: str) -> ResolvedModel:
        (
            direct_provider_id,
            direct_provider_model,
            force_reasoning_off,
        ) = self._direct_provider_model(claude_model_name)
        if direct_provider_id is not None and direct_provider_model is not None:
            reasoning_preference = (
                ReasoningPreference.OFF
                if force_reasoning_off
                else self._settings.reasoning_policy
            )
            logger.debug(
                "MODEL DIRECT: '{}' -> provider='{}' model='{}' reasoning={}",
                claude_model_name,
                direct_provider_id,
                direct_provider_model,
                reasoning_preference.value,
            )
            return ResolvedModel(
                original_model=claude_model_name,
                provider_id=direct_provider_id,
                provider_model=direct_provider_model,
                provider_model_ref=claude_model_name,
                reasoning_preference=reasoning_preference,
            )

        provider_model_ref = self._resolve_model_ref(claude_model_name)
        # A bare model id (no provider prefix) is valid when an OpenAI-
        # compatible endpoint advertises it; the provider prefix is optional.
        if "/" not in provider_model_ref:
            resolved = self._resolve_bare_endpoint_model(
                provider_model_ref, claude_model_name
            )
            if resolved is not None:
                return resolved
        reasoning_preference = self._resolve_reasoning_preference(claude_model_name)
        provider_id = parse_provider_type(provider_model_ref)
        self._validate_provider_id(provider_id)
        provider_model = parse_model_name(provider_model_ref)
        if provider_model != claude_model_name:
            logger.debug(
                "MODEL MAPPING: '{}' -> '{}'", claude_model_name, provider_model
            )
        return ResolvedModel(
            original_model=claude_model_name,
            provider_id=provider_id,
            provider_model=provider_model,
            provider_model_ref=provider_model_ref,
            reasoning_preference=reasoning_preference,
        )

    def _resolve_bare_endpoint_model(
        self, model_id: str, original_model: str
    ) -> ResolvedModel | None:
        """Resolve a bare model id to an OpenAI-compatible endpoint.

        Returns ``None`` when no configured endpoint advertises the id so the
        caller falls back to the configured model refs.
        """
        candidates = openai_compatible_model_candidates(self._settings, model_id)
        if not candidates:
            return None
        provider_id, _instance = self._select_rotation_candidate(model_id, candidates)
        self._log_rotation(model_id, candidates, provider_id)
        return ResolvedModel(
            original_model=original_model,
            provider_id=provider_id,
            provider_model=model_id,
            provider_model_ref=f"{provider_id}/{model_id}",
            reasoning_preference=self._resolve_reasoning_preference(original_model),
        )

    def _select_rotation_candidate(
        self,
        model_id: str,
        candidates: tuple[tuple[str, OpenAICompatibleInstance], ...],
    ) -> tuple[str, OpenAICompatibleInstance]:
        """Pick the endpoint for a request, rotating across duplicates."""
        if len(candidates) == 1:
            return candidates[0]
        counter = self._rotations.get(model_id, 0)
        self._rotations[model_id] = counter + 1
        return candidates[counter % len(candidates)]

    @staticmethod
    def _log_rotation(
        model_id: str,
        candidates: tuple[tuple[str, OpenAICompatibleInstance], ...],
        chosen_provider_id: str,
    ) -> None:
        """Log provider/key distribution when one model id spans endpoints."""
        entries = []
        for provider_id, instance in candidates:
            key_count = len(split_api_key_pool(instance.api_keys))
            entries.append(
                f"{provider_id} (key {mask_api_key(instance.api_keys)}, "
                f"{key_count} key{'s' if key_count != 1 else ''})"
            )
        if len(candidates) > 1:
            logger.info(
                "MODEL MULTI-PROVIDER: '{}' served by {}; rotating to {} "
                "(provider + key pool round-robin)",
                model_id,
                ", ".join(entries),
                chosen_provider_id,
            )
        else:
            logger.debug("MODEL ENDPOINT: '{}' served by {}", model_id, entries[0])

    def _validate_provider_id(self, provider_id: str) -> None:
        if provider_id in PROVIDER_CATALOG:
            return
        # Numbered OpenAI-compatible endpoint instances are dynamic (configured
        # via settings.openai_compatible_instances), so they are not catalog
        # entries. Whether the specific number exists is validated by the
        # provider factory, which reports the configured instance ids.
        if OPENAI_COMPATIBLE_INSTANCE_RE.fullmatch(provider_id):
            return
        raise UnknownProviderError.for_provider(provider_id, PROVIDER_CATALOG)

    def _direct_provider_model(
        self, model_name: str
    ) -> tuple[str | None, str | None, bool]:
        decoded = decode_gateway_model_id(model_name)
        if decoded is not None:
            if decoded.provider_id not in SUPPORTED_PROVIDER_IDS:
                return None, None, False
            return (
                decoded.provider_id,
                decoded.provider_model,
                decoded.force_reasoning_off,
            )

        provider_id, separator, provider_model = model_name.partition("/")
        if not separator:
            return None, None, False
        if provider_id not in SUPPORTED_PROVIDER_IDS:
            return None, None, False
        if not provider_model:
            return None, None, False
        return provider_id, provider_model, False

    def _resolve_model_ref(self, claude_model_name: str) -> str:
        """Resolve a Claude model name to the configured provider/model ref."""

        route = self._matched_route(claude_model_name)
        if route is not None:
            model = getattr(self._settings, route[1])
            if isinstance(model, str):
                return model
        return self._settings.model

    def _resolve_reasoning_preference(
        self, claude_model_name: str
    ) -> ReasoningPreference:
        """Resolve a route override without inspecting the provider model."""

        route = self._matched_route(claude_model_name)
        if route is not None:
            preference = getattr(self._settings, route[2])
            if preference is not ReasoningPreference.INHERIT:
                return preference
        return self._settings.reasoning_policy

    @staticmethod
    def _matched_route(model_name: str) -> tuple[str, str, str] | None:
        normalized = model_name.lower()
        return next(
            (route for route in _ROUTE_SETTINGS if route[0] in normalized),
            None,
        )

    def resolve_messages_request(
        self, request: MessagesRequest
    ) -> RoutedMessagesRequest:
        """Return an internal routed request context."""
        resolved = self.resolve(request.model)
        routed = request.model_copy(deep=True)
        routed.model = resolved.provider_model
        return RoutedMessagesRequest(
            request=routed,
            resolved=resolved,
            reasoning=resolve_reasoning_policy(
                routed,
                resolved.reasoning_preference,
            ),
        )

    def resolve_token_count_request(
        self, request: TokenCountRequest
    ) -> RoutedTokenCountRequest:
        """Return an internal token-count request context."""
        resolved = self.resolve(request.model)
        routed = request.model_copy(
            update={"model": resolved.provider_model}, deep=True
        )
        return RoutedTokenCountRequest(request=routed, resolved=resolved)

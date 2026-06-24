"""
NGNotes: LLM Client for OpenAI-compatible API calls
"""

import asyncio
import httpx
from typing import Optional, Dict, Any, List
from .config import settings

class LLMClient:
    """Handles communication with the LLM backend via OpenAI-compatible API"""
    
    def __init__(self):
        self.base_url = settings.VLLM_BASE_URL
        self.api_key = settings.VLLM_API_KEY
        self.timeout = settings.DEFAULT_TIMEOUT_SECONDS
        
        # Create HTTP client with timeout
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(float(self.timeout)),
            headers={"Authorization": f"Bearer {self.api_key}"}
        )

        # Cache of model -> list of capability strings (e.g. ["completion","vision","tools"]).
        # Populated lazily via get_model_capabilities() and reset by refresh_capabilities().
        self._capabilities_cache: Dict[str, List[str]] = {}
    
    async def generate(
        self,
        model: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        images: Optional[List[str]] = None,
    ) -> str:
        """Generate text using the LLM.

        When ``images`` is provided (list of data URLs), the user message is sent
        as a multimodal OpenAI ``content`` array. Only do this for models known
        to support vision -- caller is responsible for that check.
        """

        # Merge caller params over defaults
        merged: Dict[str, Any] = {
            "temperature": 0.3,
            "top_p": 0.95,
            "min_p": None,
            "top_k": 40,
            "max_tokens": 700,
            "repetition_penalty": None,
        }
        if params:
            merged.update(params)

        # Build the user message content. String for text-only, list of parts for multimodal.
        if images:
            user_content: Any = [{"type": "text", "text": prompt}]
            for url in images:
                if not url:
                    continue
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                })
        else:
            user_content = prompt

        # Build the base payload (always-present fields)
        payload: Dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": (system_prompt or "You are an expert technical summarization assistant.")},
                {"role": "user", "content": user_content},
            ],
            "temperature": merged["temperature"],
            "top_p": merged["top_p"],
            "max_tokens": merged["max_tokens"],
        }

        # Only add optional params when they have a real value
        if merged.get("top_k") is not None:
            payload["top_k"] = merged["top_k"]
        if merged.get("min_p") is not None:
            payload["min_p"] = merged["min_p"]
        if merged.get("repetition_penalty") is not None:
            payload["repetition_penalty"] = merged["repetition_penalty"]

        # Disable "thinking" / chain-of-thought by default on models that support
        # it (Qwen3, DeepSeek-R1, etc.). Without this the model can burn the
        # entire max_tokens budget on hidden reasoning and return an empty
        # `content`, leaving the UI with a blank summary.
        # Both fields are accepted by recent Ollama OpenAI-compat servers; extras
        # are ignored by runtimes that don't know them.
        payload["reasoning_effort"] = "none"
        payload["think"] = False

        try:
            # Make the API call
            response = await self.client.post(
                f"{self.base_url}/chat/completions",
                json=payload
            )

            if response.status_code >= 400:
                # Surface the runtime's error body instead of a generic httpx message.
                snippet = (response.text or "").strip()[:500]
                raise Exception(
                    f"runtime returned HTTP {response.status_code} from {response.url}: {snippet}"
                )

            result = response.json()
            message = (result.get("choices") or [{}])[0].get("message") or {}
            content = (message.get("content") or "").strip()
            if content:
                return content

            # Fallback: some thinking models put the answer (or its reasoning) in
            # an alternative field when `content` is empty. Surface that so the
            # user gets *something* rather than a silent blank.
            for alt_key in ("reasoning_content", "reasoning", "thinking"):
                alt = message.get(alt_key)
                if isinstance(alt, str) and alt.strip():
                    return alt.strip()

            # Final fallback: explicit, actionable error.
            raise Exception(
                f"Model '{model}' returned an empty response. "
                "It is likely a 'thinking' model that exhausted max_tokens on "
                "internal reasoning. Try increasing max_tokens, lowering "
                "temperature, or selecting a non-thinking model."
            )

        except Exception as e:
            raise Exception(f"LLM generation failed: {str(e)}")

    async def list_available_models(self) -> List[str]:
        """
        List models from the runtime.

        Tries OpenAI-compatible `/models` first, then Ollama `/api/tags` fallback.
        """
        # 1) OpenAI-compatible: GET {base_url}/models
        try:
            res = await self.client.get(f"{self.base_url}/models")
            res.raise_for_status()
            data = res.json()
            model_ids = [m.get("id") for m in data.get("data", []) if m.get("id")]
            if model_ids:
                return model_ids
        except Exception:
            pass

        # 2) Ollama native fallback: GET {host}/api/tags
        try:
            if self.base_url.endswith("/v1"):
                tags_url = self.base_url[:-3] + "/api/tags"
            else:
                tags_url = self.base_url.rstrip("/") + "/api/tags"

            res = await self.client.get(tags_url)
            res.raise_for_status()
            data = res.json()
            model_names = [m.get("name") for m in data.get("models", []) if m.get("name")]
            return model_names
        except Exception:
            return []
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

    # ── Capability lookup (Ollama-native) ─────────────────────────────────────

    def _ollama_host(self) -> str:
        """Return the Ollama base (without the OpenAI ``/v1`` suffix)."""
        if self.base_url.endswith("/v1"):
            return self.base_url[:-3]
        return self.base_url.rstrip("/")

    async def get_model_capabilities(self, model: str) -> List[str]:
        """Return Ollama capability strings for ``model`` (e.g. ['completion','vision']).

        Cached per-model. Returns ``[]`` if the runtime can't be queried (for
        example when pointed at a non-Ollama OpenAI-compatible endpoint).
        """
        if model in self._capabilities_cache:
            return self._capabilities_cache[model]

        host = self._ollama_host()
        try:
            res = await self.client.post(f"{host}/api/show", json={"name": model})
            res.raise_for_status()
            data = res.json()
            caps = data.get("capabilities") or []
            if not isinstance(caps, list):
                caps = []
            self._capabilities_cache[model] = caps
            return caps
        except Exception:
            self._capabilities_cache[model] = []
            return []

    async def capabilities_for_models(self, models: List[str]) -> Dict[str, List[str]]:
        """Fetch capabilities for many models concurrently. Order-preserving dict."""
        if not models:
            return {}
        results = await asyncio.gather(
            *(self.get_model_capabilities(m) for m in models),
            return_exceptions=True,
        )
        out: Dict[str, List[str]] = {}
        for model, caps in zip(models, results):
            out[model] = caps if isinstance(caps, list) else []
        return out

    async def vision_capable_models(self, models: List[str]) -> List[str]:
        """Filter ``models`` down to those Ollama reports as vision-capable."""
        caps_map = await self.capabilities_for_models(models)
        return [m for m, caps in caps_map.items() if "vision" in caps]

    def invalidate_capabilities_cache(self) -> None:
        self._capabilities_cache.clear()
"""Optional AI captioning through an OpenAI-compatible chat-completions endpoint.

Works with any provider that accepts the OpenAI vision message format
(OpenAI, OpenRouter, Azure OpenAI, or a local Ollama/vLLM server). Disabled
unless VISION_API_KEY is set.
"""

import httpx

from . import config


class CaptioningError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def is_configured() -> bool:
    return bool(config.VISION_API_KEY)


def ensure_configured() -> None:
    if not is_configured():
        raise CaptioningError(
            503,
            "AI captioning is unavailable: VISION_API_KEY is not configured on the server. "
            "Upload without auto_describe, or supply a description manually.",
        )


async def generate_caption(image_b64: str) -> str:
    """Send the base64 JPEG to the configured vision model; return the caption."""
    ensure_configured()
    payload = {
        "model": config.VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": config.VISION_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            }
        ],
        "max_tokens": 300,
    }
    headers = {
        "Authorization": f"Bearer {config.VISION_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(config.VISION_API_URL, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise CaptioningError(502, f"Vision model request failed: {exc.__class__.__name__}")
    if resp.status_code != 200:
        raise CaptioningError(
            502, f"Vision model request failed (upstream HTTP {resp.status_code})."
        )
    try:
        body = resp.json()
        caption = body["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        raise CaptioningError(502, "Vision model returned an unexpected response shape.")
    if not caption:
        raise CaptioningError(502, "Vision model returned an empty caption.")
    return caption

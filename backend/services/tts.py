"""Text-to-speech provider abstraction.

Default provider is `mock` — no network call, no cost, used in dev/test/CI.
Set TTS_PROVIDER=piper to synthesize real audio locally via the open-source
Piper TTS engine (no API key, no per-request cost; requires a one-time voice
model download, see README).
"""

import asyncio
import os
import re
from pathlib import Path
from typing import Protocol

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
PODCASTS_DIR = STATIC_DIR / "podcasts"


class TTSProvider(Protocol):
    async def synthesize(self, text: str, slug: str) -> str:
        """Synthesizes `text` to audio and returns a URL the client can fetch."""
        ...


class MockTTSProvider:
    """Fake TTS used by default — no network, no cost, no model download."""

    async def synthesize(self, text: str, slug: str) -> str:
        await asyncio.sleep(0.5)  # simulate network delay
        return f"https://cdn.tripweaver.ai/podcasts/history_{slug}.mp3"


class PiperTTSProvider:
    """
    Real local TTS via the open-source Piper engine (rhasspy/piper). Runs fully
    offline against a downloaded ONNX voice model — no API key and no per-request
    cost. Writes a WAV file under backend/static/podcasts/ and returns the path
    served by the app's StaticFiles mount.
    """

    def __init__(self, model_path: str | None = None) -> None:
        self.model_path = model_path or os.environ.get("PIPER_VOICE_MODEL", "")
        if not self.model_path:
            raise RuntimeError(
                "PIPER_VOICE_MODEL must point to a downloaded Piper .onnx voice model "
                "to use TTS_PROVIDER=piper. See README for the one-time download step."
            )

    async def synthesize(self, text: str, slug: str) -> str:
        PODCASTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = PODCASTS_DIR / f"{slug}.wav"

        def _run() -> None:
            from piper import PiperVoice

            voice = PiperVoice.load(self.model_path)
            with open(out_path, "wb") as f:
                voice.synthesize(text, f)

        await asyncio.to_thread(_run)
        return f"/static/podcasts/{slug}.wav"


def _slugify(title: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", title.lower().strip()).strip("_")
    return normalized or "podcast"


_PROVIDERS: dict[str, type] = {
    "mock": MockTTSProvider,
    "piper": PiperTTSProvider,
}


class TTSService:
    """Facade used by TripBuilder; delegates to the provider chosen via TTS_PROVIDER."""

    @staticmethod
    def _get_provider() -> TTSProvider:
        name = os.environ.get("TTS_PROVIDER", "mock").strip().lower()
        try:
            provider_cls = _PROVIDERS[name]
        except KeyError:
            raise RuntimeError(
                f"Unknown TTS_PROVIDER '{name}'. Valid options: {', '.join(_PROVIDERS)}"
            ) from None
        return provider_cls()

    @classmethod
    async def generate_podcast_for_activity(
        cls, activity_title: str, activity_desc: str, activity_brief: str | None = None
    ) -> str:
        """Synthesizes narration for an activity and returns a playable URL.

        `activity_brief` is an optional short historical/contextual brief about
        the site; when present it's narrated after `activity_desc` so the
        podcast covers the place itself, not just the raw schedule text.
        """
        slug = _slugify(activity_title)
        provider = cls._get_provider()
        narration = f"{activity_desc} {activity_brief}" if activity_brief else activity_desc
        return await provider.synthesize(narration, slug)

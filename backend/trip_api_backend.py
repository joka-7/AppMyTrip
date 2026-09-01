import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.builder import router as builder_router
from services.rate_limit import RateLimitMiddleware
from services.tts import PODCASTS_DIR, STATIC_DIR

# Load a local backend/.env if present (optional dependency).
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = FastAPI(
    title="TripWeaver AI API",
    description="Production-ready API for building trip apps dynamically using LLMs.",
)

# Serves locally-synthesized TTS audio (see services/tts.py: PiperTTSProvider).
# Skipped on read-only filesystems (e.g. Vercel serverless) — fine there since
# TTS_PROVIDER=mock never writes local files; Piper needs a writable host.
try:
    PODCASTS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
except OSError:
    pass

# Opt-in per-IP rate limit on /api/trip/* — off by default (see
# services/rate_limit.py for why, and RATE_LIMIT_PER_MINUTE in .env.example to
# enable it on a persistent deployment). Added before CORSMiddleware so CORS
# ends up the outermost middleware and still decorates a 429 response — every
# middleware added after this one wraps around it, and Starlette applies the
# outermost-wrapping middleware first on the way in / last on the way out.
app.add_middleware(RateLimitMiddleware)

# Allow the web client (and later the Android app) to call the API from a
# different origin. Origins are configurable via the CORS_ORIGINS env var
# (comma-separated); defaults to the local Vite dev server so an unset env
# var fails closed instead of open on a real deploy. `allow_credentials` is
# intentionally left off — no cookie/session auth crosses this boundary (API
# keys travel in the request body, see services/llm.py), and pairing
# `allow_credentials=True` with a `*` origin is invalid per the CORS spec
# anyway (browsers reject it), so leaving it on bought nothing but a trap for
# whoever later sets CORS_ORIGINS=*.
_cors_origins = (os.environ.get("CORS_ORIGINS") or "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(builder_router)


# Entry point for local testing
if __name__ == "__main__":
    import uvicorn

    # Binding all interfaces is the point: this entrypoint is how the API is
    # started for local testing and inside a container, where 127.0.0.1 would
    # be unreachable from the host. Not narrowed to loopback because there is
    # no separate production entrypoint to narrow away from.
    uvicorn.run(app, host="0.0.0.0", port=8000)  # nosec B104

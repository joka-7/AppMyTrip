import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.builder import router as builder_router
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

# Allow the web client (and later the Android app) to call the API from a
# different origin. Origins are configurable via the CORS_ORIGINS env var
# (comma-separated); defaults to "*" for local prototype development.
_cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(builder_router)


# Entry point for local testing
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

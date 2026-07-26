"""A minimal in-memory sliding-window rate limiter.

Deliberately not backed by Redis or any shared store — this app has no shared
state by design (see trip_api_backend.py's module docstring/comments). On a
persistent host (local dev, or a long-lived Render/Fly deploy) this is real
protection: it bounds how many requests a single IP can fire per minute
before every one of them fans out into 1-6 LLM calls (see services/llm.py).
On a serverless host (e.g. Vercel) each invocation may run in a fresh
process, so the in-memory counter can reset between requests and this becomes
best-effort at best there — the payload-size caps in models.py are the limit
that holds regardless of host.

Off by default (RATE_LIMIT_PER_MINUTE unset or 0) so local dev and the
existing test suite aren't affected; a real deployment opts in by setting
RATE_LIMIT_PER_MINUTE (see backend/.env.example).
"""

import os
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_WINDOW_SECONDS = 60.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        limit_per_minute: int | None = None,
        path_prefix: str = "/api/trip/",
    ) -> None:
        super().__init__(app)
        self.limit = (
            limit_per_minute
            if limit_per_minute is not None
            else int(os.environ.get("RATE_LIMIT_PER_MINUTE", "0") or "0")
        )
        self.path_prefix = path_prefix
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next) -> Response:
        if self.limit <= 0 or not request.url.path.startswith(self.path_prefix):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        hits = self._hits[client_ip]
        while hits and now - hits[0] > _WINDOW_SECONDS:
            hits.popleft()

        if len(hits) >= self.limit:
            # Returned directly (not raised) so it's produced *inside* this
            # middleware's own response path rather than propagating past
            # CORSMiddleware — an HTTPException raised from a BaseHTTPMiddleware
            # doesn't reliably pass through FastAPI's own exception handling, and
            # a response without CORS headers would show up to the browser as an
            # opaque network error instead of a readable 429.
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests from this address — wait a minute and try again."
                },
            )

        hits.append(now)
        return await call_next(request)

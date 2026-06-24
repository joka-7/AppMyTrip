# Vercel serverless entrypoint: @vercel/python detects the ASGI `app` here
# and serves it as a function, with the rest of backend/ (routers/, services/,
# requirements.txt, ...) bundled alongside it. See README "Deploying" ->
# "Backend".
from trip_api_backend import app  # noqa: F401

"""Bearer-token auth for write endpoints. Reads are public and skip this."""

import secrets

from fastapi import Header, HTTPException

from . import config


async def require_token(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency: validates `Authorization: Bearer <TENURE_API_TOKEN>`."""
    if not config.API_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Write API is not configured: TENURE_API_TOKEN is not set on the server.",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token. Send: Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[len("Bearer ") :].strip()
    if not secrets.compare_digest(token, config.API_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid token.")

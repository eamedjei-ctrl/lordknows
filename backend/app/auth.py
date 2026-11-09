"""Guard for the admin (write) API.

Temporary: a single secret token from the ADMIN_TOKEN env var, sent as
`Authorization: Bearer <token>`. The admin login (users, sessions) replaces
this dependency in the next step; the routes themselves won't change.
"""
import secrets

from fastapi import Header, HTTPException, status

from .config import settings


def require_admin(authorization: str = Header(default="")) -> None:
    if not settings.admin_token:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Admin API is off: set ADMIN_TOKEN.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token.encode(), settings.admin_token.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.", headers={"WWW-Authenticate": "Bearer"})

"""Admin sign-in.

- Passwords: scrypt (Python standard library), salted, stored as one string.
- Sessions: a random token in an HttpOnly cookie; the database keeps only its
  SHA-256, so a leaked database can't be used to sign in.
- CSRF: every change (POST/PUT/PATCH/DELETE) must send the session's
  X-CSRF-Token header, which the admin app gets from /api/auth/me.
- Brute force: repeated failed sign-ins from one address or for one email are
  refused for a while.
"""
import base64
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AdminSession, User

COOKIE = "lk_session"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
MIN_PASSWORD = 10

# ---------------------------------------------------------------- passwords
_N, _R, _P = 2**15, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, maxmem=64 * 1024 * 1024, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, dk = stored.split("$")
        assert algo == "scrypt"
        expected = base64.b64decode(dk)
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                             maxmem=64 * 1024 * 1024, dklen=len(expected))
    except Exception:  # malformed hash: never matches
        return False
    return hmac.compare_digest(got, expected)


_DUMMY_HASH = hash_password(secrets.token_hex(8))  # equalises timing for unknown emails


def check_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise HTTPException(422, f"Use at least {MIN_PASSWORD} characters for the password.")
    if len(password) > 200:
        raise HTTPException(422, "That password is too long.")


# ---------------------------------------------------------------- failed sign-ins
_WINDOW, _MAX_FAILS = 15 * 60, 8
_fails: dict[str, deque] = defaultdict(deque)


def _recent(key: str) -> deque:
    q, now = _fails[key], time.monotonic()
    while q and now - q[0] > _WINDOW:
        q.popleft()
    return q


def check_throttle(*keys: str) -> None:
    if any(len(_recent(k)) >= _MAX_FAILS for k in keys):
        raise HTTPException(429, "Too many sign-in attempts. Wait 15 minutes and try again.")


def record_failure(*keys: str) -> None:
    for k in keys:
        _recent(k).append(time.monotonic())


def clear_failures(*keys: str) -> None:
    for k in keys:
        _fails.pop(k, None)


# ---------------------------------------------------------------- sessions
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def now() -> datetime:
    return datetime.now(UTC)


def start_session(db: Session, user: User, request: Request, response: Response) -> AdminSession:
    token = secrets.token_urlsafe(32)
    s = AdminSession(token_hash=_hash_token(token), csrf=secrets.token_urlsafe(24), user=user,
                     user_agent=(request.headers.get("user-agent") or "")[:300],
                     expires_at=now() + timedelta(days=settings.session_days))
    db.add(s)
    db.execute(delete(AdminSession).where(AdminSession.expires_at < now()))  # tidy old ones
    response.set_cookie(COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
                        secure=request.url.scheme == "https", samesite="lax", path="/")
    return s


def end_session(db: Session, request: Request, response: Response) -> None:
    if token := request.cookies.get(COOKIE):
        db.execute(delete(AdminSession).where(AdminSession.token_hash == _hash_token(token)))
    response.delete_cookie(COOKIE, path="/")


def current_session(db: Session, request: Request) -> AdminSession | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    s = db.scalar(select(AdminSession).where(AdminSession.token_hash == _hash_token(token)))
    if s is None or s.expires_at < now() or not s.user.is_active:
        return None
    return s


def require_session(request: Request, db: Session = Depends(get_db)) -> AdminSession:
    s = current_session(db, request)
    if s is None:
        raise HTTPException(401, "Please sign in.")
    if request.method not in SAFE_METHODS:
        sent = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(sent.encode(), s.csrf.encode()):
            raise HTTPException(403, "Your session token is missing or out of date. Reload the page.")
    if now() - s.last_seen_at > timedelta(minutes=5):
        s.last_seen_at = now()
        db.commit()
    return s


def require_admin(s: AdminSession = Depends(require_session)) -> User:
    return s.user

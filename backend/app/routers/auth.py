"""Sign in / out, who am I, change my password."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..auth import (_DUMMY_HASH, AdminSession, check_new_password, check_throttle, clear_failures, end_session,
                    now, record_failure, require_session, start_session, verify_password, hash_password)
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Login(BaseModel):
    email: Annotated[str, Field(max_length=254)]
    password: Annotated[str, Field(max_length=200)]


class PasswordChange(BaseModel):
    current: Annotated[str, Field(max_length=200)]
    new: Annotated[str, Field(max_length=200)]


def me_out(s: AdminSession) -> dict:
    u = s.user
    return {"user": {"id": u.id, "email": u.email, "name": u.name}, "csrf": s.csrf}


@router.post("/login")
def login(body: Login, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "?"
    keys = (f"ip:{ip}", f"email:{email}")
    check_throttle(*keys)
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not (user and ok and user.is_active):
        record_failure(*keys)
        raise HTTPException(401, "That email and password don't match.")
    clear_failures(*keys)
    user.last_login_at = now()
    s = start_session(db, user, request, response)
    db.commit()
    return me_out(s)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    end_session(db, request, response)
    db.commit()
    response.status_code = 204
    return response


@router.get("/me")
def me(s: AdminSession = Depends(require_session)):
    return me_out(s)


@router.post("/password", status_code=204)
def change_password(body: PasswordChange, request: Request, s: AdminSession = Depends(require_session),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current, s.user.password_hash):
        raise HTTPException(422, "Your current password isn't right.")
    check_new_password(body.new)
    s.user.password_hash = hash_password(body.new)
    # sign out every other browser
    db.execute(delete(AdminSession).where(AdminSession.user_id == s.user_id, AdminSession.id != s.id))
    db.commit()
    return Response(status_code=204)

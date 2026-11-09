"""Admin accounts from the command line.

    python -m app.users create you@example.com "Your Name"   (asks for a password)
    python -m app.users reset you@example.com                (new password, signs out everywhere)
    python -m app.users list
    python -m app.users bootstrap   (on start: creates ADMIN_EMAIL / ADMIN_PASSWORD if there are no users)
"""
import getpass
import sys

from sqlalchemy import delete, func, select

from .auth import MIN_PASSWORD, hash_password
from .config import settings
from .db import SessionLocal
from .models import AdminSession, User


def ask_password() -> str:
    while True:
        pw = getpass.getpass("Password: ")
        if len(pw) < MIN_PASSWORD:
            print(f"Use at least {MIN_PASSWORD} characters.")
        elif pw != getpass.getpass("Again: "):
            print("Those don't match.")
        else:
            return pw


def main(args: list[str]) -> int:
    cmd = args[0] if args else "help"
    with SessionLocal() as db:
        if cmd == "list":
            for u in db.scalars(select(User).order_by(User.id)):
                print(f"{u.id:>3}  {u.email:<40} {u.name:<24} {'active' if u.is_active else 'disabled'}")
            return 0
        if cmd == "bootstrap":
            if db.scalar(select(func.count()).select_from(User)):
                return 0
            if not (settings.admin_email and settings.admin_password):
                print("No admin users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, or run: python -m app.users create EMAIL")
                return 0
            if len(settings.admin_password) < MIN_PASSWORD:
                print(f"ADMIN_PASSWORD must be at least {MIN_PASSWORD} characters; no admin created.")
                return 1
            db.add(User(email=settings.admin_email.strip().lower(), name="Admin",
                        password_hash=hash_password(settings.admin_password)))
            db.commit()
            print(f"Created admin user {settings.admin_email}.")
            return 0
        if cmd in ("create", "reset") and len(args) >= 2:
            email = args[1].strip().lower()
            user = db.scalar(select(User).where(func.lower(User.email) == email))
            if cmd == "create":
                if user:
                    print("That email already has an account; use reset.")
                    return 1
                user = User(email=email, name=args[2] if len(args) > 2 else "", password_hash=hash_password(ask_password()))
                db.add(user)
            else:
                if not user:
                    print("No account with that email.")
                    return 1
                user.password_hash = hash_password(ask_password())
                user.is_active = True
                db.execute(delete(AdminSession).where(AdminSession.user_id == user.id))
            db.commit()
            print(f"{'Created' if cmd == 'create' else 'Reset'} {email}.")
            return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

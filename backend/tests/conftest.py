"""Tests run against a real Postgres (TEST_DATABASE_URL), migrated and seeded fresh."""
import os
import tempfile

import pytest

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://lordknows:lordknows@127.0.0.1:5433/lordknows_test")
os.environ["MEDIA_ROOT"] = tempfile.mkdtemp(prefix="lk-media-")
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["ADMIN_PASSWORD"] = "correct horse battery"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import BACKEND_DIR  # noqa: E402
from app.db import engine  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    with engine.begin() as c:
        c.execute(text("drop schema public cascade; create schema public"))
    command.upgrade(Config(str(BACKEND_DIR / "alembic.ini")), "head")
    from app.seed import seed
    from app.users import main as users
    assert seed()
    assert users(["bootstrap"]) == 0
    yield


@pytest.fixture()
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture()
def admin(client):
    r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "correct horse battery"})
    assert r.status_code == 200, r.text
    client.headers["X-CSRF-Token"] = r.json()["csrf"]
    return client

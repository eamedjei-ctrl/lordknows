"""Settings, read from environment variables (or a .env file in backend/)."""
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Coolify (and most hosts) hand out postgres:// URLs; we normalise to psycopg 3.
    database_url: str = "postgresql+psycopg://lordknows:lordknows@localhost:5432/lordknows"
    # Uploaded images live here. In Coolify this is a persistent volume.
    media_root: Path = BACKEND_DIR / "media"
    # The static site (CSS, JS, fonts, built-in images).
    frontend_dir: Path = BACKEND_DIR.parent / "frontend"
    # First admin account, created on start if there are no users yet.
    admin_email: str = ""
    admin_password: str = ""
    session_days: int = 14
    max_upload_mb: int = 25

    @field_validator("database_url")
    @classmethod
    def _psycopg(cls, v: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v


settings = Settings()

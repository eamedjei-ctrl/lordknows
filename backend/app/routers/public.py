import json
import re

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from markupsafe import Markup, escape
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import BACKEND_DIR
from ..db import get_db
from ..media import pick, picked_size, srcset
from ..site import ON_TONE, load_site, payload

router = APIRouter()
templates = Jinja2Templates(directory=BACKEND_DIR / "app" / "templates")


def em(value: str) -> Markup:
    """Escape, then turn *words* into <em>words</em>."""
    return Markup(re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", str(escape(value))))


def tone_style(tone: str) -> str:
    on = "var(--lk-ink)" if ON_TONE.get(tone) == "ink" else "#fff"
    return f"--tone: var(--lk-{tone}); --tone-on: {on};"


def page_json(data: dict) -> Markup:
    # safe inside <script type="application/json">: no closing tags, no comments
    s = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return Markup(s.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"))


@router.get("/", response_class=HTMLResponse)
def home(request: Request, db: Session = Depends(get_db)):
    site = load_site(db)
    data = payload(site)
    first_look = data["looks"][0]["src"]["640"] if data["looks"] else None
    return templates.TemplateResponse(request, "index.html", {
        "site": site, "data": data, "data_json": page_json(data), "first_look": first_look,
        "media": site.media, "pick": pick, "picked_size": picked_size, "srcset": srcset,
        "em": em, "tone_style": tone_style,
    })


@router.get("/api/site")
def site_data(db: Session = Depends(get_db)):
    site = load_site(db)
    return {"content": site.blocks, **payload(site)}


@router.get("/healthz")
def health(db: Session = Depends(get_db)):
    db.execute(text("select 1"))
    return {"ok": True}

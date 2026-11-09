"""Lord Knows: the site and its CMS API.

  /               the page, rendered from the database
  /api/site       the same content as JSON
  /api/admin/*    the CMS (create / edit / reorder / delete; guarded)
  /media/*        uploaded images (persistent volume)
  /*              static site files: CSS, JS, fonts, built-in images
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import admin, public

app = FastAPI(title="Lord Knows CMS", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
app.include_router(public.router)
app.include_router(admin.router)

settings.media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_root), name="media")
# last: everything else is a static file from frontend/ (only that folder is exposed)
app.mount("/", StaticFiles(directory=settings.frontend_dir), name="static")

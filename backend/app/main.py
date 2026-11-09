"""Lord Knows: the site and its CMS.

  /               the page, rendered from the database
  /admin          the admin dashboard (sign in required for its API)
  /api/site       the page content as JSON
  /api/auth/*     sign in / out
  /api/admin/*    the CMS API (create / edit / reorder / delete)
  /media/*        uploaded images (persistent volume)
  /*              static site files: CSS, JS, fonts, built-in images
"""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import admin, auth, public

ADMIN_DIR = Path(__file__).with_name("admin")

app = FastAPI(title="Lord Knows CMS", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)


@app.middleware("http")
async def admin_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith(("/admin", "/api/admin", "/api/auth")):
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


@app.get("/admin", include_in_schema=False)
def admin_redirect():
    return RedirectResponse("/admin/")


@app.get("/admin/", include_in_schema=False)
def admin_app():
    return FileResponse(ADMIN_DIR / "index.html", headers={
        "Content-Security-Policy": "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; "
                                   "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})


app.mount("/admin/assets", StaticFiles(directory=ADMIN_DIR), name="admin")
settings.media_root.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_root), name="media")
# last: everything else is a static file from frontend/ (only that folder is exposed)
app.mount("/", StaticFiles(directory=settings.frontend_dir), name="static")

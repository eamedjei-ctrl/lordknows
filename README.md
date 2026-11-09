# Lord Knows

The Lord Knows runway site and its CMS: one Python (FastAPI) app that serves the
page from a Postgres database, plus an admin API to change everything on it.

```
frontend/   CSS, JS, fonts and the built-in images (served as static files)
backend/
  app/
    templates/index.html   the page, filled in from the database
    models.py              tables: media, lines, products, looks, content blocks
    content.py             the editable page sections and their fields
    routers/public.py      /  and  /api/site
    routers/admin.py       /api/admin/*  (the CMS)
    media.py               image uploads: resized to web sizes, stored on disk
    seed.py, seed_data.json  the launch catalogue, loaded into an empty database
  alembic/                 database migrations
  tests/
Dockerfile, docker-compose.yml   deployment (Coolify)
```

## What the CMS controls

| Thing | Admin API | Notes |
|---|---|---|
| Images | `GET/POST /api/admin/media`, `PATCH/DELETE /api/admin/media/{id}` | Upload JPG/PNG/WebP/AVIF; resized to 240–2000px WebP. `frame=look` fits a photo into the 9:16 runway frame. In-use images can't be deleted. |
| Product lines | `/api/admin/lines` (+ `PUT /lines/order`) | Shop filters; each has a colour (`ink red flame green pink gold`). |
| Products | `/api/admin/products` (+ `PUT /products/order`) | Name, meta, sizes, price (`null` hides prices), image, thumbnail, gallery, published. |
| Looks | `/api/admin/looks` (+ `PUT /looks/order`) | Image, colour, pieces with pins `[left %, top %]`, published. |
| Page sections | `GET/PUT /api/admin/content/{key}` | `site runway shop story lookbook club community`: all text and section photos. `PUT` takes the whole section. `*words*` in the story body become italics. |

Interactive docs: `/api/docs`.

**Access (temporary):** admin routes need `Authorization: Bearer <ADMIN_TOKEN>`.
The admin dashboard and login replace this next; the routes stay the same.

## Run locally

Needs Python 3.13 and Postgres.

```sh
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
createdb lordknows                       # or any Postgres database
cp backend/.env.example backend/.env     # set DATABASE_URL and ADMIN_TOKEN
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.seed
../.venv/bin/uvicorn app.main:app --reload --reload-dir app --reload-dir ../frontend
```

Open http://127.0.0.1:8000. Tests: `TEST_DATABASE_URL=postgresql://… ../.venv/bin/python -m pytest`
(they wipe that database, so point it at a throwaway one).

Changing a table: edit `app/models.py`, then
`../.venv/bin/alembic revision --autogenerate -m "what changed"` and check the file it writes.

## Deploy on Coolify

1. New resource → **Docker Compose** → this repository (`docker-compose.yml`).
2. Coolify generates the database password and `ADMIN_TOKEN` (shown under
   Environment Variables as `SERVICE_PASSWORD_64_ADMIN`) and assigns the domain.
3. Deploy. On start the app migrates the database and, if it's empty, loads the
   launch catalogue.

Two persistent volumes hold the data: `lk-pgdata` (database) and `lk-media`
(uploaded images, at `/data/media`). Back up both.

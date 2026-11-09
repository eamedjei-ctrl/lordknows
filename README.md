# Lord Knows

The Lord Knows runway site and its CMS: one Python (FastAPI) app that serves the
page from a Postgres database, with an admin dashboard at **/admin** to change
everything on it.

```
frontend/   CSS, JS, fonts and the built-in images (served as static files)
backend/
  app/
    templates/index.html   the page, filled in from the database
    models.py              tables: media, lines, products, looks, content blocks
    content.py             the editable page sections and their fields
    routers/public.py      /  and  /api/site
    routers/admin.py       /api/admin/*  (the CMS API)
    routers/auth.py        /api/auth/*   (sign in / out, change password)
    admin/                 the admin dashboard (plain JS, no build step)
    users.py               admin accounts from the command line
    media.py               image uploads: resized to web sizes, stored on disk
    seed.py, seed_data.json  the launch catalogue, loaded into an empty database
  alembic/                 database migrations
  tests/
Dockerfile, docker-compose.yml   deployment (Coolify)
```

## What the CMS controls

| Thing | Admin API | Notes |
|---|---|---|
| Admin users | `/api/admin/users` | Add people, disable, set a new password, delete. |
| Images | `GET/POST /api/admin/media`, `PATCH/DELETE /api/admin/media/{id}` | Upload JPG/PNG/WebP/AVIF; resized to 240–2000px WebP. `frame=look` fits a photo into the 9:16 runway frame. In-use images can't be deleted. |
| Product lines | `/api/admin/lines` (+ `PUT /lines/order`) | Shop filters; each has a colour (`ink red flame green pink gold`). |
| Products | `/api/admin/products` (+ `PUT /products/order`) | Name, meta, sizes, price (`null` hides prices), image, thumbnail, gallery, published. |
| Looks | `/api/admin/looks` (+ `PUT /looks/order`) | Image, colour, pieces with pins `[left %, top %]`, published. |
| Page sections | `GET/PUT /api/admin/content/{key}` | `site runway shop story lookbook club community`: all text and section photos. `PUT` takes the whole section. `*words*` in the story body become italics. |

Interactive docs: `/api/docs`.

## Admin sign-in

- The dashboard is at `/admin`. Sign-in uses a secure, HttpOnly session cookie
  (14 days); every change also needs the session's CSRF token, which the
  dashboard sends automatically.
- Passwords are hashed with scrypt; repeated failed sign-ins are refused for 15 minutes.
- **First admin:** on start, if there are no users, one is created from
  `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Or from a shell:
  `python -m app.users create you@example.com "Your Name"`.
  Forgotten password: `python -m app.users reset you@example.com`.

## Run locally

Needs Python 3.13 and Postgres.

```sh
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
createdb lordknows                       # or any Postgres database
cp backend/.env.example backend/.env     # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.seed
../.venv/bin/python -m app.users bootstrap
../.venv/bin/uvicorn app.main:app --reload --reload-dir app --reload-dir ../frontend
```

Open http://127.0.0.1:8000 (site) and http://127.0.0.1:8000/admin (dashboard). Tests: `TEST_DATABASE_URL=postgresql://… ../.venv/bin/python -m pytest`
(they wipe that database, so point it at a throwaway one).

Changing a table: edit `app/models.py`, then
`../.venv/bin/alembic revision --autogenerate -m "what changed"` and check the file it writes.

## Deploy on Coolify

1. New resource → **Docker Compose** → this repository (`docker-compose.yml`).
2. Under Environment Variables set `ADMIN_EMAIL` to your email. Coolify
   generates the database password and your first admin password
   (`SERVICE_PASSWORD_ADMIN`, shown in the same list) and assigns the domain.
3. Deploy. On start the app migrates the database, loads the launch catalogue
   if it's empty, and creates your admin account if there are no users.
4. Sign in at `https://<your domain>/admin` and change the password under My account.

Two persistent volumes hold the data: `lk-pgdata` (database) and `lk-media`
(uploaded images, at `/data/media`). Back up both.

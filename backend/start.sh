#!/bin/sh
# Container start: bring the database schema up to date, add the launch
# catalogue if the database is empty, then serve.
set -e
alembic upgrade head
python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --workers "${WEB_WORKERS:-2}" --proxy-headers --forwarded-allow-ips '*'

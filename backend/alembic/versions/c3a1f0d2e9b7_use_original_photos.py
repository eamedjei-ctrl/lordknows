"""Built-in photos: serve the original uploads as the large size.

Revision ID: c3a1f0d2e9b7
Revises: b09e284a54b4
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "c3a1f0d2e9b7"
down_revision = "b09e284a54b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    seed = json.loads((Path(__file__).resolve().parents[2] / "app" / "seed_data.json").read_text())
    conn = op.get_bind()
    for m in seed["media"]:
        if m["key"].startswith("web/"):
            conn.execute(sa.text("update media set variants = cast(:v as jsonb) where key = :k and storage = 'static'"),
                         {"v": json.dumps(m["variants"]), "k": m["key"]})


def downgrade() -> None:
    conn = op.get_bind()
    for row in conn.execute(sa.text("select id, key from media where key like 'web/%' and storage = 'static'")):
        name = row.key[4:]
        conn.execute(sa.text("update media set variants = jsonb_set(variants, '{1400}', to_jsonb(cast(:u as text))) where id = :i"),
                     {"u": f"/assets/images/web/{name}-1400.webp", "i": row.id})

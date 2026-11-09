"""Everything the public page needs, read from the database in one go."""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from .content import BLOCKS
from .media import pick, picked_size
from .models import ContentBlock, Line, Look, Media, Product

# text on a coloured fill: dark on the light colours, white on the deep ones
ON_TONE = {"green": "ink", "pink": "ink", "gold": "ink"}


@dataclass
class Site:
    blocks: dict[str, dict]
    media: dict[int, Media]
    lines: list[Line]
    products: list[Product]
    looks: list[Look]

    def block(self, key: str) -> dict:
        return self.blocks.get(key, {})


def load_site(db: Session) -> Site:
    stored = {b.key: b.data for b in db.scalars(select(ContentBlock))}
    # fill in defaults for any field not stored yet
    blocks = {k: model.model_validate(stored.get(k, {})).model_dump() for k, model in BLOCKS.items()}
    lines = list(db.scalars(select(Line).order_by(Line.position, Line.id)))
    products = list(db.scalars(select(Product).where(Product.published).order_by(Product.position, Product.id)))
    looks = list(db.scalars(select(Look).where(Look.published).order_by(Look.position, Look.id)))
    ids = {f["image_id"] for b in blocks.values() for f in b.get("items", [])}
    ids |= {b["image_id"] for b in blocks.values() if b.get("image_id")}
    media = {m.id: m for m in db.scalars(select(Media).where(Media.id.in_(ids)))} if ids else {}
    return Site(blocks, media, lines, products, looks)


def payload(site: Site) -> dict:
    """The JSON handed to runway.js / shop.js (window data, see index.html)."""
    products = {}
    for p in site.products:
        if not p.image:
            continue  # can't be drawn without an image
        w, h = picked_size(p.image, 720)
        products[p.slug] = {
            "name": p.name,
            "meta": p.meta,
            "line": p.line.key,
            "sizes": p.sizes,
            "price": float(p.price) if p.price is not None else None,
            "img": pick(p.image, 720),
            "w": w,
            "h": h,
            "cutout": p.cutout,
            "thumb": pick(p.thumb or p.image, 240),
            "gallery": [
                {"sm": pick(g.media, 720), "lg": pick(g.media, 1400), "bg": g.media.bg, "fit": g.media.fit, "alt": g.media.alt}
                for g in p.gallery
            ],
        }
    looks = []
    for lk in site.looks:
        items = []
        for it in lk.items:
            if it.product.slug not in products:
                continue
            item = {"id": it.product.slug}
            if it.pin_x is not None and it.pin_y is not None:
                item["pin"] = [it.pin_x, it.pin_y]
            items.append(item)
        if items:
            looks.append({"name": lk.name, "tone": lk.tone, "rack": lk.rack,
                          "src": {"640": pick(lk.image, 640), "1080": pick(lk.image, 1080)}, "items": items})
    site_block, runway = site.block("site"), site.block("runway")
    return {
        "currency": site_block["currency"],
        "bundleSaving": site_block["bundle_saving"],
        "runway": {"title": runway["title"], "sub": runway["sub"].replace("{count}", str(len(looks)))},
        "lines": {l.key: {"label": l.label, "tag": l.tag, "tone": l.tone} for l in site.lines},
        "order": list(products),
        "products": products,
        "looks": looks,
    }

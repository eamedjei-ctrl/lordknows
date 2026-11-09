"""Admin API: every change the CMS can make. All routes need the admin guard."""
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..content import BLOCKS, media_ids
from ..db import get_db
from ..media import BadImage, delete_files, save_upload
from ..models import ContentBlock, Line, Look, LookItem, Media, Product, ProductImage
from ..schemas import (LineIn, LineOut, LinePatch, LookIn, LookItemOut, LookOut, LookPatch, MediaOut,
                       MediaPatch, Order, ProductIn, ProductOut, ProductPatch)

router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)], tags=["admin"])
DB = Annotated[Session, Depends(get_db)]


def get_or_404(db: Session, model, id_: int):
    obj = db.get(model, id_)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} {id_} not found.")
    return obj


def check_media(db: Session, ids) -> None:
    ids = {i for i in ids if i is not None}
    if not ids:
        return
    found = set(db.scalars(select(Media.id).where(Media.id.in_(ids))))
    if missing := ids - found:
        raise HTTPException(422, f"Unknown media id(s): {sorted(missing)}")


def commit(db: Session, what: str) -> None:
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"{what} conflicts with existing data (duplicate key?).") from e


def next_position(db: Session, model) -> int:
    return (db.scalar(select(func.max(model.position))) or 0) + 1


def reorder(db: Session, model, ids: list[int]) -> None:
    rows = {o.id: o for o in db.scalars(select(model).where(model.id.in_(ids)))}
    if len(rows) != len(set(ids)):
        raise HTTPException(422, "Order lists unknown or repeated ids.")
    for pos, i in enumerate(ids):
        rows[i].position = pos


# =========================================================================== media
@router.get("/media", response_model=list[MediaOut])
def list_media(db: DB):
    return db.scalars(select(Media).order_by(Media.id.desc())).all()


@router.post("/media", response_model=MediaOut, status_code=201)
async def upload_media(
    db: DB,
    file: UploadFile = File(...),
    alt: str = Form(""),
    frame: str | None = Form(None, description='"look" fits the image into the 9:16 runway frame'),
):
    if frame not in (None, "", "look"):
        raise HTTPException(422, 'frame must be "look" or empty.')
    try:
        m = save_upload(await file.read(), file.filename or "upload", alt=alt, frame=frame or None)
    except BadImage as e:
        raise HTTPException(422, str(e)) from e
    db.add(m)
    db.commit()
    return m


@router.patch("/media/{media_id}", response_model=MediaOut)
def update_media(media_id: int, body: MediaPatch, db: DB):
    m = get_or_404(db, Media, media_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return m


def media_usage(db: Session, media_id: int) -> list[str]:
    used = [f"product {s}" for s in db.scalars(select(Product.slug).where(
        or_(Product.image_id == media_id, Product.thumb_id == media_id,
            Product.id.in_(select(ProductImage.product_id).where(ProductImage.media_id == media_id)))))]
    used += [f"look {n}" for n in db.scalars(select(Look.name).where(Look.image_id == media_id))]
    used += [f"section {b.key}" for b in db.scalars(select(ContentBlock)) if media_id in media_ids(b.key, b.data)]
    return used


@router.delete("/media/{media_id}", status_code=204)
def delete_media(media_id: int, db: DB):
    m = get_or_404(db, Media, media_id)
    if used := media_usage(db, media_id):
        raise HTTPException(409, "Still in use by: " + ", ".join(used))
    db.delete(m)
    db.commit()
    delete_files(m)
    return Response(status_code=204)


# =========================================================================== lines
@router.get("/lines", response_model=list[LineOut])
def list_lines(db: DB):
    return db.scalars(select(Line).order_by(Line.position, Line.id)).all()


@router.post("/lines", response_model=LineOut, status_code=201)
def create_line(body: LineIn, db: DB):
    line = Line(**body.model_dump(), position=next_position(db, Line))
    db.add(line)
    commit(db, "Line")
    return line


@router.patch("/lines/{line_id}", response_model=LineOut)
def update_line(line_id: int, body: LinePatch, db: DB):
    line = get_or_404(db, Line, line_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(line, k, v)
    commit(db, "Line")
    return line


@router.delete("/lines/{line_id}", status_code=204)
def delete_line(line_id: int, db: DB):
    line = get_or_404(db, Line, line_id)
    if db.scalar(select(func.count()).where(Product.line_id == line_id)):
        raise HTTPException(409, "Move or delete this line's products first.")
    db.delete(line)
    db.commit()
    return Response(status_code=204)


@router.put("/lines/order", response_model=list[LineOut])
def order_lines(body: Order, db: DB):
    reorder(db, Line, body.ids)
    db.commit()
    return list_lines(db)


# =========================================================================== products
def product_out(p: Product) -> ProductOut:
    return ProductOut.model_validate({**{c: getattr(p, c) for c in ProductOut.model_fields if c != "gallery"},
                                      "gallery": [g.media_id for g in p.gallery]})


def apply_product(db: Session, p: Product, data: dict) -> None:
    if "line_id" in data:
        get_or_404(db, Line, data["line_id"])
    check_media(db, [data.get("image_id"), data.get("thumb_id"), *(data.get("gallery") or [])])
    gallery = data.pop("gallery", None)
    for k, v in data.items():
        setattr(p, k, v)
    if gallery is not None:
        p.gallery = [ProductImage(media_id=mid, position=i) for i, mid in enumerate(gallery)]


@router.get("/products", response_model=list[ProductOut])
def list_products(db: DB):
    return [product_out(p) for p in db.scalars(select(Product).order_by(Product.position, Product.id))]


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: DB):
    return product_out(get_or_404(db, Product, product_id))


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(body: ProductIn, db: DB):
    p = Product(position=next_position(db, Product))
    apply_product(db, p, body.model_dump(exclude_unset=False))
    db.add(p)
    commit(db, "Product slug")
    return product_out(p)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductPatch, db: DB):
    p = get_or_404(db, Product, product_id)
    data = body.model_dump(exclude_unset=True)
    for required in ("slug", "name", "line_id", "sizes"):
        if required in data and data[required] is None:
            raise HTTPException(422, f"{required} can't be empty.")
    apply_product(db, p, data)
    commit(db, "Product slug")
    db.refresh(p)
    return product_out(p)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: DB):
    db.delete(get_or_404(db, Product, product_id))
    db.commit()
    return Response(status_code=204)


@router.put("/products/order", response_model=list[ProductOut])
def order_products(body: Order, db: DB):
    reorder(db, Product, body.ids)
    db.commit()
    return list_products(db)


# =========================================================================== looks
def look_out(lk: Look) -> LookOut:
    return LookOut.model_validate({
        **{c: getattr(lk, c) for c in LookOut.model_fields if c != "items"},
        "items": [LookItemOut(product_id=i.product_id,
                              pin=(i.pin_x, i.pin_y) if i.pin_x is not None and i.pin_y is not None else None)
                  for i in lk.items],
    })


def apply_look(db: Session, lk: Look, data: dict) -> None:
    check_media(db, [data.get("image_id")])
    items = data.pop("items", None)
    for k, v in data.items():
        if v is None and k in ("name", "image_id"):
            raise HTTPException(422, f"{k} can't be empty.")
        setattr(lk, k, v)
    if items is not None:
        ids = {i["product_id"] for i in items}
        if missing := ids - set(db.scalars(select(Product.id).where(Product.id.in_(ids)))):
            raise HTTPException(422, f"Unknown product id(s): {sorted(missing)}")
        lk.items = [LookItem(product_id=i["product_id"], position=n,
                             pin_x=i["pin"][0] if i.get("pin") else None,
                             pin_y=i["pin"][1] if i.get("pin") else None) for n, i in enumerate(items)]


@router.get("/looks", response_model=list[LookOut])
def list_looks(db: DB):
    return [look_out(lk) for lk in db.scalars(select(Look).order_by(Look.position, Look.id))]


@router.get("/looks/{look_id}", response_model=LookOut)
def get_look(look_id: int, db: DB):
    return look_out(get_or_404(db, Look, look_id))


@router.post("/looks", response_model=LookOut, status_code=201)
def create_look(body: LookIn, db: DB):
    lk = Look(position=next_position(db, Look))
    apply_look(db, lk, body.model_dump())
    db.add(lk)
    db.commit()
    return look_out(lk)


@router.patch("/looks/{look_id}", response_model=LookOut)
def update_look(look_id: int, body: LookPatch, db: DB):
    lk = get_or_404(db, Look, look_id)
    apply_look(db, lk, body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(lk)
    return look_out(lk)


@router.delete("/looks/{look_id}", status_code=204)
def delete_look(look_id: int, db: DB):
    db.delete(get_or_404(db, Look, look_id))
    db.commit()
    return Response(status_code=204)


@router.put("/looks/order", response_model=list[LookOut])
def order_looks(body: Order, db: DB):
    reorder(db, Look, body.ids)
    db.commit()
    return list_looks(db)


# =========================================================================== page sections
@router.get("/content")
def list_content(db: DB):
    stored = {b.key: b.data for b in db.scalars(select(ContentBlock))}
    return {k: m.model_validate(stored.get(k, {})).model_dump() for k, m in BLOCKS.items()}


@router.get("/content/{key}")
def get_content(key: str, db: DB):
    model = BLOCKS.get(key) or _no_block(key)
    b = db.get(ContentBlock, key)
    return model.model_validate(b.data if b else {}).model_dump()


@router.put("/content/{key}")
def put_content(key: str, body: dict, db: DB):
    """Replace a section. Send the whole section (GET it, change fields, PUT it back)."""
    model = BLOCKS.get(key) or _no_block(key)
    try:
        data = model.model_validate(body).model_dump()
    except ValidationError as e:
        raise HTTPException(422, e.errors(include_url=False, include_context=False)) from e
    check_media(db, media_ids(key, data))
    if data.get("product_slug") and not db.scalar(select(Product.id).where(Product.slug == data["product_slug"])):
        raise HTTPException(422, f"Unknown product: {data['product_slug']}")
    if data.get("line_key") and not db.scalar(select(Line.id).where(Line.key == data["line_key"])):
        raise HTTPException(422, f"Unknown line: {data['line_key']}")
    b = db.get(ContentBlock, key)
    if b:
        b.data = data
    else:
        db.add(ContentBlock(key=key, data=data))
    db.commit()
    return data


def _no_block(key: str):
    raise HTTPException(404, f"No section called {key!r}. Sections: {', '.join(BLOCKS)}")

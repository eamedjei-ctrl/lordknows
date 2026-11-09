"""Database tables.

media           every image: built-in site images and uploads, with resized variants
lines           product lines (Graphic, Shirts, Stadium set, ...), used for shop filters
products        the catalogue; `slug` is the stable id the styling bag stores
product_images  a product's gallery photos, in order
looks           the runway looks, each a 9:16 image
look_items      the pieces in a look, with their pin position on the image
content_blocks  editable page text and section images, one JSON document per section
users           admin accounts (scrypt password hashes)
sessions        signed-in admin browsers
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

Json = JSON().with_variant(JSONB(), "postgresql")

TONES = ("ink", "red", "flame", "green", "pink", "gold")


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Media(Timestamps, Base):
    __tablename__ = "media"
    id: Mapped[int] = mapped_column(primary_key=True)
    # "static" = shipped with the site under /assets; "upload" = stored on the media volume
    storage: Mapped[str] = mapped_column(String(10), default="upload")
    # stable name for built-in images (e.g. "web/black-set"); null for uploads
    key: Mapped[str | None] = mapped_column(String(200), unique=True)
    # folder under MEDIA_ROOT holding an upload's files
    folder: Mapped[str | None] = mapped_column(String(200))
    filename: Mapped[str] = mapped_column(String(255), default="")
    alt: Mapped[str] = mapped_column(Text, default="")
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    # backdrop colour + "contain" for product shots on a plain background
    bg: Mapped[str | None] = mapped_column(String(20))
    fit: Mapped[str] = mapped_column(String(10), default="cover")
    # {"640": "/media/...-640.webp", "1080": ...}: width -> URL
    variants: Mapped[dict] = mapped_column(Json, default=dict)


class Line(Base):
    __tablename__ = "lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    label: Mapped[str] = mapped_column(String(80))  # filter button, e.g. "Shirts"
    tag: Mapped[str] = mapped_column(String(80))  # card tag, e.g. "Shirt"
    tone: Mapped[str] = mapped_column(String(10), default="ink")
    position: Mapped[int] = mapped_column(Integer, default=0)


class Product(Timestamps, Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    meta: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    line_id: Mapped[int] = mapped_column(ForeignKey("lines.id", ondelete="RESTRICT"))
    sizes: Mapped[list] = mapped_column(Json, default=list)
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # the runway / bag image; cutout = transparent PNG-style shot
    image_id: Mapped[int | None] = mapped_column(ForeignKey("media.id", ondelete="RESTRICT"))
    thumb_id: Mapped[int | None] = mapped_column(ForeignKey("media.id", ondelete="RESTRICT"))
    cutout: Mapped[bool] = mapped_column(Boolean, default=False)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    line: Mapped[Line] = relationship(lazy="joined")
    image: Mapped[Media | None] = relationship(foreign_keys=[image_id], lazy="joined")
    thumb: Mapped[Media | None] = relationship(foreign_keys=[thumb_id], lazy="joined")
    gallery: Mapped[list["ProductImage"]] = relationship(
        order_by="ProductImage.position", cascade="all, delete-orphan", lazy="selectin")


class ProductImage(Base):
    __tablename__ = "product_images"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    media_id: Mapped[int] = mapped_column(ForeignKey("media.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    media: Mapped[Media] = relationship(lazy="joined")


class Look(Timestamps, Base):
    __tablename__ = "looks"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    tone: Mapped[str] = mapped_column(String(10), default="ink")
    image_id: Mapped[int] = mapped_column(ForeignKey("media.id", ondelete="RESTRICT"))
    # garment display (no model): drawn without the floor shadow
    rack: Mapped[bool] = mapped_column(Boolean, default=False)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    image: Mapped[Media] = relationship(lazy="joined")
    items: Mapped[list["LookItem"]] = relationship(
        order_by="LookItem.position", cascade="all, delete-orphan", lazy="selectin")


class LookItem(Base):
    __tablename__ = "look_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    look_id: Mapped[int] = mapped_column(ForeignKey("looks.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    # pin position as % of the image box; null = listed in the look but not pinned
    pin_x: Mapped[float | None] = mapped_column(Float)
    pin_y: Mapped[float | None] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)
    product: Mapped[Product] = relationship(lazy="joined")


class ContentBlock(Base):
    __tablename__ = "content_blocks"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    data: Mapped[dict] = mapped_column(Json, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Timestamps, Base):
    """Someone who can sign in to the admin."""
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSession(Base):
    """A signed-in browser. The cookie holds a random token; only its hash is stored."""
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship(lazy="joined")

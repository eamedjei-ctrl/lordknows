"""Request/response shapes for the admin API."""
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import TONES

Slug = Annotated[str, Field(min_length=1, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
Tone = Annotated[str, Field(pattern="^(" + "|".join(TONES) + ")$")]
Pct = Annotated[float, Field(ge=0, le=100)]
Colour = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- media
class MediaOut(Out):
    id: int
    storage: str
    key: str | None
    filename: str
    alt: str
    width: int
    height: int
    bg: str | None
    fit: str
    variants: dict[str, str]


class MediaPatch(BaseModel):
    alt: str | None = None
    bg: Colour | None = None
    fit: Annotated[str, Field(pattern="^(cover|contain)$")] | None = None


# ---- lines
class LineIn(BaseModel):
    key: Slug
    label: Annotated[str, Field(min_length=1, max_length=80)]
    tag: Annotated[str, Field(min_length=1, max_length=80)]
    tone: Tone = "ink"


class LinePatch(BaseModel):
    key: Slug | None = None
    label: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    tag: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    tone: Tone | None = None


class LineOut(Out):
    id: int
    key: str
    label: str
    tag: str
    tone: str
    position: int


# ---- products
Sizes = Annotated[list[Annotated[str, Field(min_length=1, max_length=20)]], Field(min_length=1, max_length=20)]


class ProductBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    meta: Annotated[str, Field(max_length=200)] | None = None
    description: Annotated[str, Field(max_length=5000)] | None = None
    line_id: int | None = None
    sizes: Sizes | None = None
    price: Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)] | None = None
    image_id: int | None = None
    thumb_id: int | None = None
    cutout: bool | None = None
    published: bool | None = None
    gallery: Annotated[list[int], Field(max_length=12)] | None = None  # media ids, in order

    @field_validator("sizes")
    @classmethod
    def _unique(cls, v):
        if v is not None and len(set(v)) != len(v):
            raise ValueError("sizes must be unique")
        return v


class ProductIn(ProductBase):
    slug: Slug
    name: Annotated[str, Field(min_length=1, max_length=160)]
    line_id: int
    sizes: Sizes = ["S", "M", "L", "XL", "2XL"]


class ProductPatch(ProductBase):
    slug: Slug | None = None


class ProductOut(Out):
    id: int
    slug: str
    name: str
    meta: str
    description: str
    line_id: int
    sizes: list[str]
    price: Decimal | None
    image_id: int | None
    thumb_id: int | None
    cutout: bool
    published: bool
    position: int
    gallery: list[int]


# ---- looks
class LookItemIn(BaseModel):
    product_id: int
    pin: tuple[Pct, Pct] | None = None  # [left %, top %] of the image; omit for an unpinned piece


class LookBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    tone: Tone | None = None
    image_id: int | None = None
    rack: bool | None = None
    published: bool | None = None
    items: Annotated[list[LookItemIn], Field(max_length=12)] | None = None


class LookIn(LookBase):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    image_id: int
    items: Annotated[list[LookItemIn], Field(min_length=1, max_length=12)]


class LookPatch(LookBase):
    pass


class LookItemOut(BaseModel):
    product_id: int
    pin: tuple[float, float] | None


class LookOut(Out):
    id: int
    name: str
    tone: str
    image_id: int
    rack: bool
    published: bool
    position: int
    items: list[LookItemOut]


class Order(BaseModel):
    ids: Annotated[list[int], Field(min_length=1)]


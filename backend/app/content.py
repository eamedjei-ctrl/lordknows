"""The editable page sections. Each is one row in content_blocks, validated here.

Images are referenced by media id. Text marked `body` may use *asterisks* for
italics; everything else is plain text (HTML is escaped when the page renders).
"""
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

Short = Annotated[str, Field(max_length=200)]
Long = Annotated[str, Field(max_length=2000)]


class Block(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Figure(Block):
    image_id: int
    caption: Short = ""


class SiteBlock(Block):
    title: Short = "Lord Knows"
    description: Long = ""
    currency: Annotated[str, Field(max_length=8)] = "GHS"
    bundle_saving: Annotated[float, Field(ge=0, le=0.9)] = 0.10  # 0.10 = 10% off the full look
    contact_email: Short = ""
    footer_note: Short = ""
    bag_note: Long = ""
    intro_kicker: Short = ""


class RunwayBlock(Block):
    title: Short = "Try the Look."
    sub: Short = "{count} looks, styled head to toe. Tap a pin to see the piece."  # {count} = number of looks


class ShopBlock(Block):
    kicker: Short = ""
    title: Short = ""
    sub: Long = ""


class StoryBlock(Block):
    kicker: Short = ""
    title: Short = ""
    verse: Long = ""
    body: Long = ""
    image_id: int | None = None
    product_slug: Short = ""  # the piece featured under the text
    button_label: Short = "Shop the shirt"


class LookbookBlock(Block):
    kicker: Short = ""
    title: Short = ""
    sub: Long = ""
    items: Annotated[list[Figure], Field(max_length=40)] = []


class ClubBlock(Block):
    kicker: Short = ""
    title: Short = ""
    sub: Long = ""
    button_label: Short = ""
    line_key: Short = ""  # which shop filter the button opens
    items: Annotated[list[Figure], Field(max_length=12)] = []


class CommunityBlock(Block):
    kicker: Short = ""
    title: Short = ""
    sub: Long = ""
    items: Annotated[list[Figure], Field(max_length=3)] = []  # big photo + two beside it


BLOCKS: dict[str, type[Block]] = {
    "site": SiteBlock,
    "runway": RunwayBlock,
    "shop": ShopBlock,
    "story": StoryBlock,
    "lookbook": LookbookBlock,
    "club": ClubBlock,
    "community": CommunityBlock,
}


def media_ids(key: str, data: dict) -> set[int]:
    """Every media id a block points at (for validation and delete protection)."""
    ids = {f["image_id"] for f in data.get("items", [])}
    if data.get("image_id"):
        ids.add(data["image_id"])
    return ids

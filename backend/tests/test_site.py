import json
import re
from io import BytesIO
from pathlib import Path

from PIL import Image

from app.config import settings


def page_data(html: str) -> dict:
    return json.loads(re.search(r'<script type="application/json" id="lk-data">(.*?)</script>', html, re.S).group(1))


def png(w=600, h=900, alpha=True) -> bytes:
    buf = BytesIO()
    Image.new("RGBA" if alpha else "RGB", (w, h), (200, 30, 30, 255) if alpha else (200, 30, 30)).save(buf, "PNG")
    return buf.getvalue()


def test_page_renders_seeded_content(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "{{" not in r.text and "{%" not in r.text
    data = page_data(r.text)
    assert len(data["looks"]) == 14 and len(data["products"]) == 21
    assert data["looks"][0]["items"][0] == {"id": "college-tee-black", "pin": [50.0, 26.0]}
    assert "Every piece." in r.text and "Armour of God." in r.text
    assert "<em>when the devil strikes" in r.text  # *emphasis* in the story body
    assert r.text.count('class="lk-look"') == 8 and r.text.count('class="lk-club-fig"') == 4


def test_static_and_health(client):
    assert client.get("/healthz").json() == {"ok": True}
    assert client.get("/runway.js").status_code == 200
    assert client.get("/assets/images/runway/look-1-640.webp").status_code == 200
    assert client.get("/app/config.py").status_code == 404


def test_upload_new_product_and_look(admin):
    # a look photo, fitted into the 9:16 frame
    r = admin.post("/api/admin/media", files={"file": ("look.png", png(), "image/png")}, data={"frame": "look", "alt": "New look"})
    assert r.status_code == 201, r.text
    look_img = r.json()
    assert (look_img["width"], look_img["height"]) == (1080, 1920)
    assert set(look_img["variants"]) == {"240", "640", "720", "1080"}
    files = list(Path(settings.media_root).rglob("*.webp"))
    assert len(files) == 4
    assert admin.get(look_img["variants"]["640"]).status_code == 200  # served from the media volume

    shot = admin.post("/api/admin/media", files={"file": ("tee.jpg", png(1600, 2000, alpha=False), "image/jpeg")}).json()
    assert set(shot["variants"]) == {"240", "640", "720", "1080", "1400", "1600"}

    line = admin.post("/api/admin/lines", json={"key": "outerwear", "label": "Outerwear", "tag": "Jacket", "tone": "green"}).json()
    r = admin.post("/api/admin/products", json={
        "slug": "stadium-jacket", "name": "Stadium <Jacket>", "meta": "Black", "line_id": line["id"],
        "price": "450.00", "image_id": shot["id"], "gallery": [shot["id"]]})
    assert r.status_code == 201, r.text
    prod = r.json()
    assert admin.post("/api/admin/products", json={"slug": "stadium-jacket", "name": "x", "line_id": line["id"]}).status_code == 409

    r = admin.post("/api/admin/looks", json={"name": "Night Game", "tone": "flame", "image_id": look_img["id"],
                                             "items": [{"product_id": prod["id"], "pin": [48, 40]}]})
    assert r.status_code == 201, r.text
    look = r.json()

    page = admin.get("/").text
    data = page_data(page)
    assert data["products"]["stadium-jacket"]["price"] == 450.0
    assert data["looks"][-1]["name"] == "Night Game" and data["looks"][-1]["tone"] == "flame"
    assert data["looks"][-1]["src"]["640"] == look_img["variants"]["640"]
    assert "<Jacket>" not in page  # escaped in the page JSON
    assert 'data-filter="outerwear"' in page and "--tone: var(--lk-green)" in page

    # move it to the front, then unpublish it
    ids = [lk["id"] for lk in admin.get("/api/admin/looks").json()]
    admin.put("/api/admin/looks/order", json={"ids": [look["id"]] + [i for i in ids if i != look["id"]]})
    assert page_data(admin.get("/").text)["looks"][0]["name"] == "Night Game"
    admin.patch(f"/api/admin/looks/{look['id']}", json={"published": False})
    assert "Night Game" not in [lk["name"] for lk in page_data(admin.get("/").text)["looks"]]

    # media in use can't be deleted; once free it can, and its files go too
    assert admin.delete(f"/api/admin/media/{look_img['id']}").status_code == 409
    assert admin.delete(f"/api/admin/looks/{look['id']}").status_code == 204
    assert admin.delete(f"/api/admin/media/{look_img['id']}").status_code == 204
    assert len(list(Path(settings.media_root).rglob("*.webp"))) == len(shot["variants"])

    # clean up so other tests see the seed
    admin.delete(f"/api/admin/products/{prod['id']}")
    admin.delete(f"/api/admin/media/{shot['id']}")
    admin.delete(f"/api/admin/lines/{line['id']}")


def test_content_validation(admin):
    story = admin.get("/api/admin/content/story").json()
    assert admin.put("/api/admin/content/story", json={**story, "image_id": 999999}).status_code == 422
    assert admin.put("/api/admin/content/story", json={**story, "product_slug": "nope"}).status_code == 422
    assert admin.put("/api/admin/content/story", json={**story, "surprise": 1}).status_code == 422
    assert admin.put("/api/admin/content/nope", json={}).status_code == 404
    r = admin.put("/api/admin/content/story", json={**story, "title": "Armour <of> God."})
    assert r.status_code == 200
    page = admin.get("/").text
    assert "Armour &lt;of&gt; God." in page
    admin.put("/api/admin/content/story", json=story)


def test_bad_inputs(admin):
    assert admin.post("/api/admin/media", files={"file": ("x.png", b"not an image", "image/png")}).status_code == 422
    assert admin.post("/api/admin/lines", json={"key": "Bad Key", "label": "x", "tag": "x"}).status_code == 422
    assert admin.post("/api/admin/lines", json={"key": "ok", "label": "x", "tag": "x", "tone": "purple"}).status_code == 422
    line_id = admin.get("/api/admin/lines").json()[0]["id"]
    assert admin.delete(f"/api/admin/lines/{line_id}").status_code == 409  # still has products
    look = admin.get("/api/admin/looks").json()[0]
    assert admin.patch(f"/api/admin/looks/{look['id']}", json={"items": [{"product_id": 1, "pin": [120, 5]}]}).status_code == 422

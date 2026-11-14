import io

import pytest
from PIL import Image


def png_bytes(color=(198, 42, 36), size=80) -> bytes:
    image = Image.new("RGB", (size, size), "white")
    pixels = image.load()
    for y in range(22, 58):
        for x in range(22, 58):
            pixels[x, y] = color
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def upload(client, category, subtype, color):
    response = client.post(
        "/api/items/upload",
        files={"files": ("kiyim.png", png_bytes(color), "image/png")},
        data={"category": category, "subtype": subtype, "seasons": "all"},
    )
    assert response.status_code == 200, response.text
    return response.json()["items"][0]


def test_personal_flow_has_no_library_cap(client):
    health = client.get("/api/health")
    assert health.json()["ok"] is True
    meta = client.get("/api/meta").json()
    assert meta["limits"]["library"] is None
    assert meta["categories"]

    profile = client.get("/api/profile").json()
    assert profile["name"] == "Kio"
    saved = client.put(
        "/api/profile",
        json={
            "name": "Kio",
            "city": "Toshkent",
            "style": "smart",
            "preferences": "Qora rang yoqadi",
            "height_cm": 176,
            "weight_kg": 72,
            "age": 29,
        },
    )
    assert saved.status_code == 200
    assert client.put("/api/profile", json={"name": "Kio", "height_cm": 10, "city": "Toshkent", "style": "smart"}).status_code == 400

    top = upload(client, "top", "futbolka", (30, 30, 30))
    bottom = upload(client, "bottom", "jinsi", (36, 58, 120))
    shoes = upload(client, "shoes", "krossovka", (240, 240, 240))
    assert top["color_name"] != "oq"
    assert top["image_url"].startswith("/media/items/")
    assert top["thumb_url"].startswith("/media/thumb/items/")
    picture = client.get(top["image_url"])
    assert picture.status_code == 200
    assert picture.headers["content-type"].startswith("image/")
    assert len(picture.content) <= 100 * 1024
    thumb = client.get(top["thumb_url"])
    assert thumb.status_code == 200
    assert len(thumb.content) <= len(picture.content)
    assert client.get("/api/health").json()["images"] == "database"

    renamed = client.patch(f"/api/items/{top['id']}", json={"name": "Qora futbolka", "notes": "sevimli"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Qora futbolka"

    chat = client.post("/api/stylist/chat", json={"message": "Bugun ishga nima kiyaman?"})
    assert chat.status_code == 200, chat.text
    body = chat.json()
    assert body["occasion"] == "ish"
    assert body["outfits"]
    assert body["reply"]
    history = client.get("/api/stylist/history").json()
    assert len(history) == 2

    day = client.post(
        "/api/calendar",
        json={"worn_on": "2026-11-14", "item_ids": [top["id"], bottom["id"], shoes["id"]], "occasion": "ish", "note": "ofis"},
    )
    assert day.status_code == 200, day.text
    assert len(day.json()["items"]) == 3
    again = client.get("/api/items").json()
    worn = next(item for item in again if item["id"] == top["id"])
    assert worn["wear_count"] == 1
    assert worn["last_worn_on"] == "2026-11-14"

    month = client.get("/api/calendar", params={"month": "2026-11"}).json()
    assert any(entry["date"] == "2026-11-14" for entry in month["days"])

    cleared = client.post("/api/calendar", json={"worn_on": "2026-11-14", "item_ids": [], "occasion": "kundalik"})
    assert cleared.json()["item_ids"] == []
    after = next(item for item in client.get("/api/items").json() if item["id"] == top["id"])
    assert after["wear_count"] == 0

    stats = client.get("/api/stats").json()
    assert stats["total"] == 3

    shop = client.post(
        "/api/shop/check",
        files={"file": ("dokon.png", png_bytes((32, 32, 32)), "image/png")},
        data={"category": "top", "subtype": "futbolka"},
    )
    assert shop.status_code == 200, shop.text
    advice = shop.json()
    assert advice["verdict"] == "similar"
    assert advice["headline_percent"] >= 70
    assert advice["temp_id"]

    kept = client.post(
        "/api/shop/keep",
        json={"temp_id": advice["temp_id"], "category": "top", "subtype": "futbolka", "seasons": ["all"], "name": "Yana qora"},
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["name"] == "Yana qora"

    removed = client.delete(f"/api/items/{shoes['id']}")
    assert removed.status_code == 204
    left = client.get("/api/items").json()
    assert all(item["id"] != shoes["id"] for item in left)
    assert len(left) == 3


def test_body_measurements_follow_height_and_bmi(client):
    reference = client.get("/api/body", params={"height_cm": 175, "weight_kg": 70})
    assert reference.status_code == 200, reference.text
    body = reference.json()
    assert body["bmi"] == pytest.approx(22.86, abs=0.05)
    assert body["girths_cm"]["chest"] == pytest.approx(96.1, abs=0.6)
    assert body["girths_cm"]["waist"] < body["girths_cm"]["chest"]
    assert body["segments_cm"]["shoulder_height"] == pytest.approx(143.2, abs=0.2)

    lean = client.get("/api/body", params={"height_cm": 185, "weight_kg": 61}).json()
    heavy = client.get("/api/body", params={"height_cm": 185, "weight_kg": 95}).json()
    assert lean["girths_cm"]["waist"] < heavy["girths_cm"]["waist"]
    assert lean["segments_cm"]["knee_height"] == heavy["segments_cm"]["knee_height"]
    assert heavy["morph"][1] > lean["morph"][1]

    rejected = client.get("/api/body", params={"height_cm": 50, "weight_kg": 70})
    assert rejected.status_code == 422

import io
from types import SimpleNamespace

from PIL import Image

from app.services.images import process_bytes
from app.services.shop import NewGarment, advise
from app.services.stylist import parse_request, preference_delta, suggest


def piece(**kwargs):
    data = {
        "id": 1,
        "name": "Kiyim",
        "category": "top",
        "subtype": "ko'ylak",
        "color_name": "qora",
        "color_hex": "#222222",
        "seasons": ["all"],
        "wear_count": 0,
        "last_worn_on": None,
    }
    data.update(kwargs)
    return SimpleNamespace(**data)


def profile():
    return SimpleNamespace(
        name="Kio",
        height_cm=176,
        weight_kg=72,
        age=29,
        city="Toshkent",
        style="smart",
        preferences="",
    )


def wardrobe():
    return [
        piece(id=1, name="Qora futbolka", category="top", subtype="futbolka", color_hex="#222222", color_name="qora"),
        piece(id=2, name="Ko'k jinsi", category="bottom", subtype="jinsi", color_hex="#2a3f6f", color_name="ko'k"),
        piece(id=3, name="Oq krossovka", category="shoes", subtype="krossovka", color_hex="#f2f2f2", color_name="oq"),
        piece(
            id=4,
            name="Jigarrang palto",
            category="outerwear",
            subtype="palto",
            color_hex="#4a3728",
            color_name="jigarrang",
            seasons=["winter"],
        ),
        piece(
            id=5,
            name="Sandalet",
            category="shoes",
            subtype="sandalet",
            color_hex="#c2a37a",
            color_name="bej",
            seasons=["summer"],
        ),
    ]


def test_parse_request_ignores_lookalike_words():
    parsed = parse_request("Ishonch bilan 12 daraja, bugun ishga nima kiyaman? Yomg'ir yog'yapti.")
    assert parsed["occasion"] == "ish"
    assert parsed["temp"] == 12
    assert parsed["rain"] is True
    assert parse_request("qora futbolka")["snow"] is False
    assert parse_request("qor yog'yapti")["snow"] is True


def test_hot_day_skips_coat():
    result = suggest(wardrobe(), {"city": "Toshkent", "temp": 31, "description": "ochiq", "precipitation": 0, "code": 0}, profile())
    assert result.outfits
    for outfit in result.outfits:
        assert all(item.id != 4 for item in outfit.items)


def test_cold_rain_uses_coat_not_sandals():
    weather = {"city": "Toshkent", "temp": 1, "description": "qor", "precipitation": 1, "code": 71, "rain": True}
    result = suggest(wardrobe(), weather, profile(), user_text="Ishga qanday kiyinaman?")
    assert result.occasion == "ish"
    assert result.outfits
    ids = [item.id for item in result.outfits[0].items]
    assert 4 in ids
    assert 5 not in ids


def test_preference_penalty():
    red = piece(color_name="qizil", subtype="ko'ylak")
    assert preference_delta(red, "Qizilni yoqtirmayman") < 0
    assert preference_delta(red, "Qizil rang yoqadi") > 0


def test_shop_finds_duplicate_and_pairing():
    owned = [
        piece(id=1, name="Qora ko'ylak", category="top", subtype="ko'ylak", color_hex="#111111", color_name="qora"),
        piece(id=2, name="Ko'k jinsi", category="bottom", subtype="jinsi", color_hex="#2a3f6f", color_name="ko'k"),
    ]
    duplicate = advise(
        NewGarment("#141414", "qora", ["#141414"], "top", "ko'ylak"),
        owned,
    )
    assert duplicate["verdict"] == "similar"
    assert duplicate["headline_percent"] >= 80

    pairing = advise(
        NewGarment("#c0392b", "qizil", ["#c0392b"], "bottom", "shim"),
        owned,
    )
    assert pairing["verdict"] == "pairs"
    assert pairing["pairings"][0]["item"].name == "Qora ko'ylak"
    assert pairing["pairings"][0]["percent"] >= 70


def test_shop_empty_wardrobe():
    result = advise(NewGarment("#111111", "qora", ["#111111"], "top", "futbolka"), [])
    assert result["verdict"] == "fresh"
    assert result["headline_percent"] == 0


def test_background_removal_keeps_garment():
    image = Image.new("RGB", (80, 80), "white")
    pixels = image.load()
    for y in range(25, 55):
        for x in range(25, 55):
            pixels[x, y] = (198, 42, 36)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    png, info = process_bytes(buffer.getvalue())
    cut = Image.open(io.BytesIO(png)).convert("RGBA")
    assert cut.getpixel((2, 2))[3] == 0
    assert cut.getpixel((40, 40))[3] == 255
    assert info["color_name"] == "qizil"

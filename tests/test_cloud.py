from app.config import sqlalchemy_url
from app.services.storage import promote_inbox, read_bytes, save_bytes


def test_postgres_urls_use_psycopg():
    assert sqlalchemy_url("postgres://user:secret@db.example/garderob") == (
        "postgresql+psycopg://user:secret@db.example/garderob"
    )
    neon = sqlalchemy_url("postgresql://user:secret@ep.neon.tech/garderob?sslmode=require")
    assert neon.startswith("postgresql+psycopg://")
    assert "sslmode=require" in neon
    assert sqlalchemy_url("sqlite:///tmp/garderob.db") == "sqlite:///tmp/garderob.db"


def test_large_photo_becomes_light_webp():
    from io import BytesIO

    from PIL import Image

    from app.services.storage import read_bytes, save_bytes

    image = Image.new("RGBA", (1400, 1600), (180, 40, 40, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    name = "b" * 32 + ".png"
    save_bytes("items", buffer.getvalue(), name)
    stored = read_bytes("items", name)
    assert stored.startswith(b"RIFF")
    assert len(stored) <= 100 * 1024


def test_local_image_roundtrip():
    name = "a" * 32 + ".png"
    payload = b"\x89PNG\r\n\x1a\nlocal-image"
    stored = save_bytes("inbox", payload, name)
    assert stored.url == f"/media/inbox/{name}"
    assert read_bytes("inbox", name) == payload
    moved = promote_inbox(name)
    assert moved.url == f"/media/items/{name}"
    assert read_bytes("items", name) == payload

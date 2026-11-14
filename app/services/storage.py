import io
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from PIL import Image, ImageOps

from ..config import INBOX_DIR, ITEMS_DIR

logger = logging.getLogger("garderob")
_NAME = re.compile(r"^[a-f0-9]{32}\.png$")
_configured = False
_tables_ready = False


@dataclass
class StoredImage:
    key: str
    url: str


@dataclass
class BlobRecord:
    data: bytes
    mime: str


def cloudinary_enabled() -> bool:
    if os.getenv("CLOUDINARY_URL", "").strip():
        return True
    return all(
        os.getenv(name, "").strip()
        for name in ("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET")
    )


def _configure() -> None:
    global _configured
    import cloudinary

    if os.getenv("CLOUDINARY_URL", "").strip():
        cloudinary.config(secure=True)
    else:
        cloudinary.config(
            cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
            api_key=os.environ["CLOUDINARY_API_KEY"],
            api_secret=os.environ["CLOUDINARY_API_SECRET"],
            secure=True,
        )
    _configured = True


def _public_id(folder: str, name: str) -> str:
    return f"garderob/{folder}/{name[:-4]}"


def public_url(folder: str, name: str) -> str:
    name = _check_name(name)
    if cloudinary_enabled():
        return _remote_url(folder, name)
    return f"/media/{folder}/{name}"


def _remote_url(folder: str, name: str) -> str:
    import cloudinary

    _configure()
    return cloudinary.CloudinaryImage(_public_id(folder, name)).build_url(secure=True, format="png")


def _check_name(name: str) -> str:
    if not _NAME.match(name or ""):
        raise ValueError("Rasm nomi noto'g'ri.")
    return name


def _folder_dir(folder: str):
    if folder == "items":
        return ITEMS_DIR
    if folder == "inbox":
        return INBOX_DIR
    raise ValueError("Papka noto'g'ri.")


def optimize_image(data: bytes) -> tuple[bytes, str]:
    """Haqiqiy rasmni WebP qiladi. Buzilgan baytlar o'zgarmaydi."""
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        image = image.convert("RGBA")
        image.thumbnail((960, 960), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        try:
            image.save(out, format="WEBP", quality=78, method=4)
            mime = "image/webp"
        except Exception:
            out = io.BytesIO()
            image.save(out, format="PNG", optimize=True)
            mime = "image/png"
        blob = out.getvalue()
        if blob:
            return blob, mime
    except Exception:
        logger.debug("Rasm siqilmadi, asl baytlar saqlanadi", exc_info=True)
    return data, "image/png"


def _ensure_tables() -> None:
    global _tables_ready
    if _tables_ready:
        return
    from ..database import Base, engine
    from .. import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _tables_ready = True


def _blob_key(folder: str, name: str) -> str:
    return f"{folder}/{name}"


def get_blob(folder: str, name: str):
    if not _NAME.match(name or ""):
        return None
    _ensure_tables()
    from ..database import SessionLocal
    from ..models import ImageBlob

    with SessionLocal() as db:
        row = db.get(ImageBlob, _blob_key(folder, name))
        if row is None:
            return None
        return BlobRecord(data=bytes(row.data), mime=row.mime or "image/webp")


def _put_blob(folder: str, name: str, data: bytes, mime: str) -> None:
    _ensure_tables()
    from ..database import SessionLocal
    from ..models import ImageBlob

    key = _blob_key(folder, name)
    with SessionLocal() as db:
        row = db.get(ImageBlob, key)
        if row is None:
            db.add(ImageBlob(key=key, data=data, mime=mime))
        else:
            row.data = data
            row.mime = mime
        db.commit()


def _move_blob(source_folder: str, target_folder: str, name: str) -> None:
    _ensure_tables()
    from ..database import SessionLocal
    from ..models import ImageBlob

    source = _blob_key(source_folder, name)
    target = _blob_key(target_folder, name)
    with SessionLocal() as db:
        row = db.get(ImageBlob, source)
        if row is None:
            raise ValueError("Vaqtinchalik rasm topilmadi.")
        existing = db.get(ImageBlob, target)
        if existing is not None:
            db.delete(existing)
            db.flush()
        db.add(ImageBlob(key=target, data=bytes(row.data), mime=row.mime))
        db.delete(row)
        db.commit()


def _delete_blob(folder: str, name: str) -> None:
    if not _NAME.match(name or ""):
        return
    _ensure_tables()
    from ..database import SessionLocal
    from ..models import ImageBlob

    with SessionLocal() as db:
        row = db.get(ImageBlob, _blob_key(folder, name))
        if row is not None:
            db.delete(row)
            db.commit()


def cleanup_stored_inbox(max_age_hours: int = 48) -> None:
    _ensure_tables()
    from ..database import SessionLocal
    from ..models import ImageBlob

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=max_age_hours)
    with SessionLocal() as db:
        stale = db.query(ImageBlob).filter(ImageBlob.key.like("inbox/%"), ImageBlob.created_at < cutoff).all()
        for row in stale:
            db.delete(row)
        db.commit()


def save_bytes(folder: str, data: bytes, name: str) -> StoredImage:
    name = _check_name(name)
    if cloudinary_enabled():
        import cloudinary.uploader

        _configure()
        result = cloudinary.uploader.upload(
            data,
            public_id=_public_id(folder, name),
            overwrite=True,
            resource_type="image",
            format="png",
        )
        return StoredImage(key=name, url=result["secure_url"])
    payload, mime = optimize_image(data)
    _put_blob(folder, name, payload, mime)
    return StoredImage(key=name, url=f"/media/{folder}/{name}")


def read_bytes(folder: str, name: str) -> bytes:
    name = _check_name(name)
    if cloudinary_enabled():
        response = httpx.get(_remote_url(folder, name), timeout=20)
        if response.status_code != 200:
            raise ValueError("Vaqtinchalik rasm topilmadi.")
        return response.content
    row = get_blob(folder, name)
    if row is not None:
        return bytes(row.data)
    path = _folder_dir(folder) / name
    if not path.exists():
        raise ValueError("Vaqtinchalik rasm topilmadi.")
    return path.read_bytes()


def promote_inbox(name: str) -> StoredImage:
    name = _check_name(name)
    if cloudinary_enabled():
        import cloudinary.uploader

        _configure()
        cloudinary.uploader.rename(
            _public_id("inbox", name),
            _public_id("items", name),
            overwrite=True,
            invalidate=True,
        )
        return StoredImage(key=name, url=_remote_url("items", name))
    try:
        _move_blob("inbox", "items", name)
    except ValueError:
        source = INBOX_DIR / name
        if not source.exists():
            raise
        _put_blob("items", name, source.read_bytes(), "image/png")
        source.unlink(missing_ok=True)
    return StoredImage(key=name, url=f"/media/items/{name}")


def demote_item(name: str) -> None:
    try:
        name = _check_name(name)
    except ValueError:
        return
    if cloudinary_enabled():
        try:
            import cloudinary.uploader

            _configure()
            cloudinary.uploader.rename(
                _public_id("items", name),
                _public_id("inbox", name),
                overwrite=True,
                invalidate=True,
            )
        except Exception:
            logger.warning("Rasm qaytarilmadi", exc_info=True)
        return
    try:
        _move_blob("items", "inbox", name)
        return
    except ValueError:
        pass
    target = ITEMS_DIR / name
    source = INBOX_DIR / name
    if target.exists() and not source.exists():
        target.replace(source)


def delete_image(folder: str, name: str) -> None:
    if cloudinary_enabled() and _NAME.match(name or ""):
        try:
            import cloudinary.uploader

            _configure()
            cloudinary.uploader.destroy(_public_id(folder, name), invalidate=True)
        except Exception:
            logger.warning("Bulutdagi rasm o'chirilmadi", exc_info=True)
        return
    _delete_blob(folder, name)
    if _NAME.match(name or ""):
        (_folder_dir(folder) / name).unlink(missing_ok=True)

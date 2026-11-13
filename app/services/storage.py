import logging
import os
import re
from dataclasses import dataclass

import httpx

from ..config import INBOX_DIR, ITEMS_DIR

logger = logging.getLogger("garderob")
_NAME = re.compile(r"^[a-f0-9]{32}\.png$")
_configured = False


@dataclass
class StoredImage:
    key: str
    url: str


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
    path = _folder_dir(folder) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return StoredImage(key=name, url=f"/media/{folder}/{name}")


def read_bytes(folder: str, name: str) -> bytes:
    name = _check_name(name)
    if cloudinary_enabled():
        response = httpx.get(_remote_url(folder, name), timeout=20)
        if response.status_code != 200:
            raise ValueError("Vaqtinchalik rasm topilmadi.")
        return response.content
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
    source = INBOX_DIR / name
    target = ITEMS_DIR / name
    if not source.exists():
        raise ValueError("Vaqtinchalik rasm topilmadi.")
    source.replace(target)
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
    if _NAME.match(name or ""):
        (_folder_dir(folder) / name).unlink(missing_ok=True)

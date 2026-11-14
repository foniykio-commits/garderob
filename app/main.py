import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

from .config import INBOX_DIR, ITEMS_DIR, ROOT, USING_POSTGRES
from .constants import meta_dict
from .database import Base, engine, ensure_schema
from .routers import items, planner, profile, shop, stylist
from .services.images import rembg_available
from .services.storage import cleanup_stored_inbox, cloudinary_enabled, get_blob, get_thumb

logger = logging.getLogger("garderob")
STATIC_DIR = ROOT / "app" / "static"


def _prepare_dirs() -> None:
    ITEMS_DIR.mkdir(parents=True, exist_ok=True)
    INBOX_DIR.mkdir(parents=True, exist_ok=True)


def image_backend() -> str:
    if cloudinary_enabled():
        return "cloudinary"
    return "database"


def cleanup_inbox(max_age_hours: int = 48) -> None:
    cutoff = time.time() - max_age_hours * 3600
    for path in INBOX_DIR.glob("*.png"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            logger.warning("Eski rasm o'chirilmadi: %s", path.name)
    try:
        cleanup_stored_inbox(max_age_hours)
    except Exception:
        logger.warning("Bazadagi eski rasmlar tozalanmadi", exc_info=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _prepare_dirs()
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    cleanup_inbox()
    yield


_prepare_dirs()
app = FastAPI(title="Garderob", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=256)
app.include_router(profile.router)
app.include_router(items.router)
app.include_router(stylist.router)
app.include_router(shop.router)
app.include_router(planner.router)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "app": "garderob",
        "database": "postgres" if USING_POSTGRES else "sqlite",
        "images": image_backend(),
    }


@app.get("/api/meta")
def meta():
    payload = meta_dict()
    payload["bg_removal"] = "rembg" if rembg_available() else "fast"
    payload["storage"] = image_backend()
    payload["database"] = "postgres" if USING_POSTGRES else "sqlite"
    return payload


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/service-worker.js")
def service_worker():
    return FileResponse(
        STATIC_DIR / "service-worker.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"},
    )


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


def _image_response(blob) -> Response:
    return Response(
        content=bytes(blob.data),
        media_type=blob.mime or "image/webp",
        headers={"Cache-Control": "private, max-age=604800"},
    )


@app.get("/media/thumb/{folder}/{name}")
def media_thumb(folder: str, name: str):
    if folder not in {"items", "inbox"}:
        raise HTTPException(404, "Rasm topilmadi.")
    blob = get_thumb(folder, name)
    if blob is None:
        raise HTTPException(404, "Rasm topilmadi.")
    return _image_response(blob)


@app.get("/media/{folder}/{name}")
def media_file(folder: str, name: str):
    if folder not in {"items", "inbox"}:
        raise HTTPException(404, "Rasm topilmadi.")
    blob = get_blob(folder, name)
    if blob is not None:
        return _image_response(blob)
    path = (ITEMS_DIR if folder == "items" else INBOX_DIR) / name
    if path.is_file():
        return FileResponse(path)
    raise HTTPException(404, "Rasm topilmadi.")


app.mount("/assets", StaticFiles(directory=str(STATIC_DIR)), name="assets")

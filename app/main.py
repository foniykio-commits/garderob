import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import INBOX_DIR, ITEMS_DIR, ROOT, UPLOAD_DIR, USING_POSTGRES
from .constants import meta_dict
from .database import Base, engine, ensure_schema
from .routers import items, planner, profile, shop, stylist
from .services.images import rembg_available
from .services.storage import cloudinary_enabled

logger = logging.getLogger("garderob")
STATIC_DIR = ROOT / "app" / "static"


def _prepare_dirs() -> None:
    ITEMS_DIR.mkdir(parents=True, exist_ok=True)
    INBOX_DIR.mkdir(parents=True, exist_ok=True)


def cleanup_inbox(max_age_hours: int = 48) -> None:
    cutoff = time.time() - max_age_hours * 3600
    for path in INBOX_DIR.glob("*.png"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            logger.warning("Eski rasm o'chirilmadi: %s", path.name)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _prepare_dirs()
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    cleanup_inbox()
    yield


_prepare_dirs()
app = FastAPI(title="Garderob", version="1.0.0", lifespan=lifespan)
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
        "images": "cloudinary" if cloudinary_enabled() else "local",
    }


@app.get("/api/meta")
def meta():
    payload = meta_dict()
    payload["bg_removal"] = "rembg" if rembg_available() else "fast"
    payload["storage"] = "cloudinary" if cloudinary_enabled() else "local"
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


app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")
app.mount("/assets", StaticFiles(directory=str(STATIC_DIR)), name="assets")

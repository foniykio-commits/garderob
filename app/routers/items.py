import asyncio
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import MAX_BATCH, MAX_IMAGE_BYTES
from ..constants import clean_seasons
from ..database import get_db
from ..schemas import ItemUpdate
from ..serialize import dump_item
from ..services.images import process_bytes
from ..services.storage import delete_image, save_bytes
from ..services.wardrobe import WardrobeError, create_item, delete_item, list_items, update_item

router = APIRouter(prefix="/api/items", tags=["items"])


def _seasons(raw: str) -> list[str]:
    return clean_seasons([part.strip() for part in (raw or "").split(",") if part.strip()])


@router.get("")
def all_items(db: Session = Depends(get_db)):
    return [dump_item(item) for item in list_items(db)]


@router.post("/upload")
async def upload_items(
    files: list[UploadFile] = File(...),
    category: str = Form("other"),
    subtype: str = Form(""),
    seasons: str = Form("all"),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(400, "Rasm tanlanmadi.")
    if len(files) > MAX_BATCH:
        raise HTTPException(400, f"Bir safarda {MAX_BATCH} tagacha rasm yuboring. Kutubxonaning o'zi cheklanmagan.")
    season_list = _seasons(seasons)
    created = []
    errors = []
    for upload in files:
        raw = await upload.read()
        if not raw:
            errors.append({"filename": upload.filename or "rasm", "error": "Bo'sh fayl"})
            continue
        if len(raw) > MAX_IMAGE_BYTES:
            errors.append({"filename": upload.filename or "rasm", "error": "Rasm 12 MB dan katta"})
            continue
        stored = None
        try:
            png, info = await asyncio.to_thread(process_bytes, raw)
            filename = f"{uuid.uuid4().hex}.png"
            stored = await asyncio.to_thread(save_bytes, "items", png, filename)
            item = create_item(
                db,
                filename=stored.key,
                info=info,
                category=category,
                subtype=subtype,
                seasons=season_list,
                stored_url=stored.url,
            )
            created.append(dump_item(item))
        except WardrobeError as exc:
            if stored is not None:
                delete_image("items", stored.key)
            errors.append({"filename": upload.filename or "rasm", "error": str(exc)})
        except Exception:
            if stored is not None:
                delete_image("items", stored.key)
            errors.append({"filename": upload.filename or "rasm", "error": "Rasm o'qilmadi"})
    if not created and errors:
        raise HTTPException(400, errors[0]["error"])
    return {"items": created, "errors": errors}


@router.patch("/{item_id}")
def patch_item(item_id: int, data: ItemUpdate, db: Session = Depends(get_db)):
    try:
        item = update_item(db, item_id, data)
    except WardrobeError as exc:
        status = 404 if str(exc) == "Kiyim topilmadi." else 400
        raise HTTPException(status, str(exc)) from exc
    return dump_item(item)


@router.delete("/{item_id}", status_code=204)
def remove_item(item_id: int, db: Session = Depends(get_db)):
    if not delete_item(db, item_id):
        raise HTTPException(404, "Kiyim topilmadi.")

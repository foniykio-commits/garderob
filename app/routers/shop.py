import asyncio
import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from sqlalchemy.orm import Session

from ..config import MAX_IMAGE_BYTES
from ..constants import suggest_name
from ..database import get_db
from ..schemas import ShopKeepIn, ShopRecheckIn
from ..serialize import dump_item
from ..services.colors import analyze_image
from ..services.images import process_bytes
from ..services.shop import NewGarment, advise
from ..services.storage import demote_item, promote_inbox, public_url, read_bytes, save_bytes
from ..services.wardrobe import WardrobeError, create_item, list_items

router = APIRouter(prefix="/api/shop", tags=["shop"])


def _advice_body(temp_id: str, image_url: str, info: dict, advice: dict, category: str, subtype: str) -> dict:
    duplicate = advice["duplicate_item"]
    return {
        "temp_id": temp_id,
        "image_url": image_url,
        "detected": info,
        "suggested_name": suggest_name(info.get("color_name") or "Yangi", subtype, category or "other"),
        "category": category,
        "subtype": subtype,
        "verdict": advice["verdict"],
        "title": advice["title"],
        "summary": advice["summary"],
        "headline_percent": advice["headline_percent"],
        "headline_label": advice["headline_label"],
        "buy_percent": advice["buy_percent"],
        "duplicate": None
        if duplicate is None
        else {"item": dump_item(duplicate), "percent": advice["duplicate_percent"]},
        "pairings": [
            {"item": dump_item(pair["item"]), "percent": pair["percent"], "why": pair["why"]}
            for pair in advice["pairings"]
        ],
    }


def _build(db: Session, temp_id: str, image_url: str, category: str, subtype: str) -> dict:
    try:
        raw = read_bytes("inbox", temp_id)
    except ValueError as exc:
        raise WardrobeError(str(exc)) from exc
    with Image.open(io.BytesIO(raw)) as image:
        info = analyze_image(image)
    advice = advise(
        NewGarment(
            color_hex=info["color_hex"],
            color_name=info["color_name"],
            palette=info["palette"],
            category=category,
            subtype=subtype,
        ),
        list_items(db),
    )
    return _advice_body(temp_id, image_url, info, advice, category, subtype)


@router.post("/check")
async def check(
    file: UploadFile = File(...),
    category: str = Form(""),
    subtype: str = Form(""),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Rasm tanlanmadi.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Rasm 12 MB dan katta.")
    try:
        png, _info = await asyncio.to_thread(process_bytes, raw)
    except Exception as exc:
        raise HTTPException(400, "Rasm o'qilmadi.") from exc
    temp_id = f"{uuid.uuid4().hex}.png"
    stored = await asyncio.to_thread(save_bytes, "inbox", png, temp_id)
    try:
        return _build(db, stored.key, stored.url, category.strip(), subtype.strip())
    except WardrobeError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/recheck")
def recheck(data: ShopRecheckIn, db: Session = Depends(get_db)):
    try:
        url = public_url("inbox", data.temp_id)
        return _build(db, data.temp_id, url, data.category.strip(), data.subtype.strip())
    except (WardrobeError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/keep")
def keep(data: ShopKeepIn, db: Session = Depends(get_db)):
    try:
        stored = promote_inbox(data.temp_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    try:
        raw = read_bytes("items", stored.key)
        with Image.open(io.BytesIO(raw)) as image:
            info = analyze_image(image)
        item = create_item(
            db,
            filename=stored.key,
            info=info,
            category=data.category,
            subtype=data.subtype,
            seasons=data.seasons,
            name=data.name,
            notes=data.notes,
            stored_url=stored.url,
        )
    except WardrobeError as exc:
        demote_item(stored.key)
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        demote_item(stored.key)
        raise HTTPException(400, "Kiyim saqlanmadi.") from exc
    return dump_item(item)

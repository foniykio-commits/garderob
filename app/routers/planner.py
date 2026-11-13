from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import WearIn
from ..serialize import dump_entry
from ..services.wardrobe import WardrobeError, compute_stats, list_items, month_entries, save_wear

router = APIRouter(prefix="/api", tags=["planner"])


def _items_map(db: Session) -> dict:
    return {item.id: item for item in list_items(db)}


@router.get("/calendar")
def calendar(month: str, db: Session = Depends(get_db)):
    try:
        entries = month_entries(db, month)
    except WardrobeError as exc:
        raise HTTPException(400, str(exc)) from exc
    items = _items_map(db)
    return {"month": month, "days": [dump_entry(entry, items) for entry in entries]}


@router.post("/calendar")
def write_day(data: WearIn, db: Session = Depends(get_db)):
    try:
        entry = save_wear(db, data.worn_on, data.item_ids, data.occasion, data.note)
    except WardrobeError as exc:
        raise HTTPException(400, str(exc)) from exc
    if entry is None:
        return {"date": data.worn_on.isoformat(), "item_ids": [], "items": [], "occasion": data.occasion, "note": ""}
    return dump_entry(entry, _items_map(db))


@router.delete("/calendar/{day}", status_code=204)
def clear_day(day: date, db: Session = Depends(get_db)):
    save_wear(db, day, [], "kundalik", "")


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return compute_stats(db)

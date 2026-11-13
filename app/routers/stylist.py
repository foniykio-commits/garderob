import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ChatMessage
from ..schemas import ChatIn
from ..serialize import dump_item, dump_outfit
from ..services.llm import polish_reply
from ..services.stylist import suggest
from ..services.wardrobe import forgotten_items, get_profile, list_items
from ..services.weather import fetch_weather

router = APIRouter(prefix="/api", tags=["stylist"])


def _public(result) -> dict:
    outfits = []
    for outfit in result.outfits:
        data = dump_outfit(outfit)
        data["occasion"] = result.occasion
        outfits.append(data)
    return {
        "reply": result.reply,
        "occasion": result.occasion,
        "weather": result.weather,
        "outfits": outfits,
    }


async def _suggest(db: Session, occasion: str, message: str):
    profile = get_profile(db)
    weather = await asyncio.to_thread(fetch_weather, profile.city)
    items = list_items(db)
    result = suggest(items, weather, profile, occasion=occasion, user_text=message)
    names = [item.name for outfit in result.outfits for item in outfit.items]
    result.reply = await asyncio.to_thread(polish_reply, result.reply, names, profile.name)
    return result


@router.get("/today")
async def today(occasion: str = "kundalik", db: Session = Depends(get_db)):
    result = await _suggest(db, occasion, "")
    body = _public(result)
    body["forgotten"] = [dump_item(item) for item in forgotten_items(db)[:8]]
    body["total"] = len(list_items(db))
    return body


@router.post("/stylist/chat")
async def chat(data: ChatIn, db: Session = Depends(get_db)):
    message = (data.message or "").strip()
    if not message:
        raise HTTPException(400, "Savol yozing.")
    if len(message) > 1000:
        raise HTTPException(400, "Savol juda uzun.")
    result = await _suggest(db, "kundalik", message)
    body = _public(result)
    db.add(ChatMessage(role="user", content=message))
    db.add(ChatMessage(role="assistant", content=body["reply"], payload=body))
    db.commit()
    return body


@router.get("/stylist/history")
def history(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(ChatMessage).order_by(ChatMessage.id.desc()).limit(40)))
    rows.reverse()
    return [
        {
            "id": row.id,
            "role": row.role,
            "content": row.content,
            "payload": row.payload,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.delete("/stylist/history", status_code=204)
def clear_history(db: Session = Depends(get_db)):
    for row in db.scalars(select(ChatMessage)):
        db.delete(row)
    db.commit()

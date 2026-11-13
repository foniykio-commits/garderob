import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import DEFAULT_CITY, FORGOTTEN_DAYS
from . import storage
from ..constants import (
    CATEGORIES,
    CATEGORY_KEYS,
    COLORS,
    OCCASION_KEYS,
    STYLE_KEYS,
    SUBTYPES,
    clean_seasons,
    label_of,
    suggest_name,
)
from ..models import Item, Profile, WearEntry
from ..serialize import dump_item, is_forgotten

_TEMP_ID = re.compile(r"^[a-f0-9]{32}\.png$")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class WardrobeError(ValueError):
    pass


def get_profile(db: Session) -> Profile:
    profile = db.scalars(select(Profile).order_by(Profile.id)).first()
    if profile:
        return profile
    profile = Profile(name="Kio", city=DEFAULT_CITY or "Toshkent", style="smart", preferences="")
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def save_profile(db: Session, data) -> Profile:
    profile = get_profile(db)
    name = (data.name or "").strip()[:80]
    city = (data.city or "").strip()[:80] or "Toshkent"
    style = data.style if data.style in STYLE_KEYS else "smart"
    if data.height_cm is not None and not 80 <= data.height_cm <= 250:
        raise WardrobeError("Bo'y 80 va 250 sm oralig'ida bo'lsin.")
    if data.weight_kg is not None and not 20 <= data.weight_kg <= 400:
        raise WardrobeError("Vazn 20 va 400 kg oralig'ida bo'lsin.")
    if data.age is not None and not 1 <= data.age <= 120:
        raise WardrobeError("Yosh 1 va 120 oralig'ida bo'lsin.")
    profile.name = name or "Kio"
    profile.city = city
    profile.style = style
    profile.height_cm = data.height_cm
    profile.weight_kg = data.weight_kg
    profile.age = data.age
    profile.preferences = (data.preferences or "").strip()[:800]
    db.commit()
    db.refresh(profile)
    return profile


def list_items(db: Session) -> list[Item]:
    return list(db.scalars(select(Item).order_by(Item.created_at.desc(), Item.id.desc())))


def _clean_category(category: str) -> str:
    if category not in CATEGORY_KEYS:
        raise WardrobeError("Kiyim turkumi noto'g'ri.")
    return category


def _clean_subtype(category: str, subtype: str) -> str:
    subtype = (subtype or "").strip()[:40]
    allowed = set(SUBTYPES.get(category, []))
    if subtype and subtype not in allowed:
        return ""
    return subtype


def create_item(
    db: Session,
    *,
    filename: str,
    info: dict,
    category: str,
    subtype: str = "",
    seasons: list[str] | None = None,
    name: str | None = None,
    notes: str = "",
    stored_url: str | None = None,
) -> Item:
    category = _clean_category(category)
    subtype = _clean_subtype(category, subtype)
    color_name = info.get("color_name") or "bej"
    item = Item(
        name=(name or suggest_name(color_name, subtype, category))[:120],
        category=category,
        subtype=subtype,
        color_name=color_name[:40],
        color_hex=info.get("color_hex") or "#d7c4a3",
        palette=list(info.get("palette") or []),
        seasons=clean_seasons(seasons),
        notes=(notes or "")[:1000],
        filename=filename,
        stored_url=stored_url,
        wear_count=0,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item_id: int, data) -> Item:
    item = db.get(Item, item_id)
    if not item:
        raise WardrobeError("Kiyim topilmadi.")
    if data.category is not None:
        item.category = _clean_category(data.category)
        if data.subtype is None and item.subtype not in SUBTYPES.get(item.category, []):
            item.subtype = ""
    if data.subtype is not None:
        item.subtype = _clean_subtype(item.category, data.subtype)
    if data.name is not None:
        cleaned = data.name.strip()
        if not cleaned:
            raise WardrobeError("Nom bo'sh bo'lmasin.")
        item.name = cleaned[:120]
    if data.color_name is not None:
        item.color_name = data.color_name.strip()[:40]
        if data.color_hex is None:
            for name, hex_code in COLORS:
                if name == item.color_name:
                    item.color_hex = hex_code
                    break
    if data.color_hex is not None:
        if not _HEX.match(data.color_hex):
            raise WardrobeError("Rang kodi #RRGGBB ko'rinishida bo'lsin.")
        item.color_hex = data.color_hex.lower()
    if data.seasons is not None:
        item.seasons = clean_seasons(data.seasons)
    if data.notes is not None:
        item.notes = data.notes.strip()[:1000]
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item_id: int) -> bool:
    item = db.get(Item, item_id)
    if not item:
        return False
    entries = list(db.scalars(select(WearEntry)))
    for entry in entries:
        ids = [value for value in (entry.item_ids or []) if value != item.id]
        if ids == list(entry.item_ids or []):
            continue
        if ids:
            entry.item_ids = ids
        else:
            db.delete(entry)
    filename = item.filename
    db.delete(item)
    db.commit()
    storage.delete_image("items", filename)
    return True


def recompute_wear(db: Session, item_ids: set[int]) -> None:
    if not item_ids:
        return
    entries = list(db.scalars(select(WearEntry)))
    for item_id in item_ids:
        item = db.get(Item, item_id)
        if not item:
            continue
        days = [entry.worn_on for entry in entries if item_id in (entry.item_ids or [])]
        item.wear_count = len(days)
        item.last_worn_on = max(days) if days else None
    db.commit()


def save_wear(db: Session, worn_on: date, item_ids: list[int], occasion: str, note: str) -> WearEntry | None:
    if occasion not in OCCASION_KEYS:
        occasion = "kundalik"
    clean_ids: list[int] = []
    for item_id in item_ids:
        if item_id in clean_ids:
            continue
        if db.get(Item, item_id):
            clean_ids.append(item_id)
    entry = db.scalar(select(WearEntry).where(WearEntry.worn_on == worn_on))
    previous = set(entry.item_ids or []) if entry else set()
    if not clean_ids:
        if entry:
            db.delete(entry)
            db.commit()
        recompute_wear(db, previous)
        return None
    if entry is None:
        entry = WearEntry(worn_on=worn_on, item_ids=clean_ids, occasion=occasion, note=(note or "")[:500])
        db.add(entry)
    else:
        entry.item_ids = clean_ids
        entry.occasion = occasion
        entry.note = (note or "")[:500]
    db.commit()
    recompute_wear(db, previous | set(clean_ids))
    return entry


def month_entries(db: Session, month: str) -> list[WearEntry]:
    try:
        year_text, month_text = month.split("-")
        year, mon = int(year_text), int(month_text)
        start = date(year, mon, 1)
        end = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)
    except (ValueError, TypeError):
        raise WardrobeError("Oy YYYY-MM ko'rinishida bo'lsin.") from None
    return list(
        db.scalars(select(WearEntry).where(WearEntry.worn_on >= start, WearEntry.worn_on < end).order_by(WearEntry.worn_on))
    )


def forgotten_items(db: Session) -> list[Item]:
    return [item for item in list_items(db) if is_forgotten(item)]


def compute_stats(db: Session) -> dict:
    items = list_items(db)
    by_category: dict[str, int] = {}
    by_color: dict[str, int] = {}
    for item in items:
        by_category[item.category] = by_category.get(item.category, 0) + 1
        color = item.color_name or "noma'lum"
        by_color[color] = by_color.get(color, 0) + 1
    most = sorted(items, key=lambda item: (item.wear_count or 0, item.id), reverse=True)[:5]
    forgotten = [item for item in items if is_forgotten(item)]
    entries = list(db.scalars(select(WearEntry)))
    return {
        "total": len(items),
        "never_worn": sum(1 for item in items if (item.wear_count or 0) == 0),
        "logged_days": len(entries),
        "forgotten_days": FORGOTTEN_DAYS,
        "by_category": [
            {"key": key, "label": label_of(CATEGORIES, key), "count": count}
            for key, count in sorted(by_category.items(), key=lambda row: row[1], reverse=True)
        ],
        "by_color": [
            {"name": name, "count": count}
            for name, count in sorted(by_color.items(), key=lambda row: row[1], reverse=True)[:8]
        ],
        "most_worn": [dump_item(item) for item in most if (item.wear_count or 0) > 0],
        "forgotten": [dump_item(item) for item in forgotten],
    }


def safe_temp_id(temp_id: str) -> str:
    if not _TEMP_ID.match(temp_id or ""):
        raise WardrobeError("Vaqtinchalik rasm topilmadi.")
    try:
        storage.read_bytes("inbox", temp_id)
    except ValueError as exc:
        raise WardrobeError(str(exc)) from exc
    return temp_id

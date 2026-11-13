from datetime import date

from .config import FORGOTTEN_DAYS, NEW_ITEM_GRACE_DAYS
from .constants import CATEGORIES, OCCASIONS, SEASONS, label_of
from .models import Item


def is_forgotten(item: Item, today: date | None = None) -> bool:
    today = today or date.today()
    created = item.created_at.date() if item.created_at else today
    if (item.wear_count or 0) <= 0 and (today - created).days >= NEW_ITEM_GRACE_DAYS:
        return True
    if item.last_worn_on and (today - item.last_worn_on).days >= FORGOTTEN_DAYS:
        return True
    return False


def dump_item(item: Item) -> dict:
    seasons = list(item.seasons or ["all"])
    folder = "items"
    return {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "category_label": label_of(CATEGORIES, item.category),
        "subtype": item.subtype or "",
        "color_name": item.color_name or "",
        "color_hex": item.color_hex or "#888888",
        "palette": list(item.palette or []),
        "seasons": seasons,
        "season_labels": [label_of(SEASONS, season) for season in seasons],
        "notes": item.notes or "",
        "wear_count": item.wear_count or 0,
        "last_worn_on": item.last_worn_on.isoformat() if item.last_worn_on else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "image_url": item.stored_url or f"/media/{folder}/{item.filename}",
        "forgotten": is_forgotten(item),
    }


def dump_outfit(draft) -> dict:
    return {
        "title": draft.title,
        "reason": draft.reason,
        "score": draft.score,
        "items": [dump_item(item) for item in draft.items],
    }


def dump_profile(profile) -> dict:
    return {
        "id": profile.id,
        "name": profile.name or "",
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "age": profile.age,
        "city": profile.city or "Toshkent",
        "style": profile.style or "smart",
        "preferences": profile.preferences or "",
    }


def dump_entry(entry, items_by_id: dict[int, Item]) -> dict:
    ids = [item_id for item_id in (entry.item_ids or []) if item_id in items_by_id]
    return {
        "date": entry.worn_on.isoformat(),
        "item_ids": ids,
        "items": [dump_item(items_by_id[item_id]) for item_id in ids],
        "occasion": entry.occasion,
        "occasion_label": label_of(OCCASIONS, entry.occasion),
        "note": entry.note or "",
    }

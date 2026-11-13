from dataclasses import dataclass

from .colors import color_similarity, harmony_phrase, pair_harmony

COMPLEMENTS = {
    "top": {"bottom", "shoes", "outerwear", "accessory"},
    "bottom": {"top", "shoes", "outerwear", "accessory"},
    "dress": {"shoes", "outerwear", "accessory"},
    "outerwear": {"top", "bottom", "dress"},
    "shoes": {"top", "bottom", "dress", "outerwear"},
    "accessory": {"top", "bottom", "dress", "outerwear"},
    "other": {"top", "bottom", "dress", "outerwear", "shoes"},
    "": {"top", "bottom", "dress", "outerwear", "shoes", "accessory"},
}


@dataclass
class NewGarment:
    color_hex: str
    color_name: str
    palette: list[str]
    category: str = ""
    subtype: str = ""


def _match_percent(harmony: float) -> int:
    return int(max(52, min(97, round(58 + (harmony / 30) * 38))))


def advise(new: NewGarment, items: list) -> dict:
    if not items:
        return {
            "verdict": "fresh",
            "title": "Solishtirish uchun garderob bo'sh",
            "summary": "Avval o'zingizdagi kiyimlarni qo'shing. Shundan keyin do'kondagi narsa bilan halol taqqoslayman.",
            "headline_percent": 0,
            "headline_label": "Ma'lumot yo'q",
            "buy_percent": 0,
            "duplicate_item": None,
            "duplicate_percent": 0,
            "pairings": [],
        }

    ranked = []
    for item in items:
        color_sim = color_similarity(new.color_hex, getattr(item, "color_hex", "#888888"))
        same_category = bool(new.category) and new.category == getattr(item, "category", "")
        same_subtype = bool(new.subtype) and new.subtype == getattr(item, "subtype", "")
        score = color_sim * 0.64 + (0.22 if same_category else 0) + (0.14 if same_subtype else 0)
        ranked.append((score, color_sim, item))
    ranked.sort(key=lambda row: row[0], reverse=True)
    best_score, best_color, best_item = ranked[0]
    duplicate_percent = int(round(best_score * 100))
    color_percent = int(round(best_color * 100))
    same_category = bool(new.category) and new.category == getattr(best_item, "category", "")

    similar = False
    if new.category and duplicate_percent >= 80 and same_category:
        similar = True
    elif color_percent >= 93 and (not new.category or same_category):
        similar = True

    complements = COMPLEMENTS.get(new.category or "", COMPLEMENTS[""])
    pairings = []
    for _score, _color, item in ranked:
        if getattr(item, "id", None) == getattr(best_item, "id", None) and similar:
            continue
        if getattr(item, "category", "") not in complements:
            continue
        harmony = pair_harmony(new.color_hex, getattr(item, "color_hex", "#888888"))
        percent = _match_percent(harmony)
        pairings.append(
            {
                "item": item,
                "percent": percent,
                "why": (
                    f"Bu kiyim sizdagi «{getattr(item, 'name', 'kiyim')}» bilan {percent}% mos. "
                    f"{harmony_phrase(new.color_hex, getattr(item, 'color_hex', '#888888'))}"
                ),
            }
        )
    pairings.sort(key=lambda row: row["percent"], reverse=True)
    pairings = pairings[:3]
    best_pair = pairings[0]["percent"] if pairings else 0

    if similar:
        title = "Bunday narsa sizda bor" if new.category else "Shu rang sizda bor"
        summary = (
            f"«{getattr(best_item, 'name', 'Kiyim')}» bilan o'xshashlik {max(duplicate_percent, color_percent)}%. "
            "Yangi pul sarflash shart emas — bor narsangizni yangi obrazda ishlating."
        )
        if not new.category:
            summary += " Turini belgilasangiz, xulosa yanada aniqroq bo'ladi."
        headline = max(duplicate_percent, color_percent)
        buy = max(8, 100 - headline)
        verdict = "similar"
        label = "O'xshashlik"
    elif best_pair >= 74:
        title = "Garderobingiz bilan tushadi"
        summary = pairings[0]["why"] + " Olishingiz mumkin."
        headline = best_pair
        buy = best_pair
        verdict = "pairs"
        label = "Moslik"
    else:
        title = "Garderobdan biroz ajralib turadi"
        summary = (
            "Bu rang yoki tur hozirgi kiyimlaringiz bilan zaifroq juftlashadi. "
            "Yangi yo'nalish xohlasangiz oling, aks holda shart emas."
        )
        headline = best_pair or 48
        buy = headline
        verdict = "fresh"
        label = "Moslik"

    return {
        "verdict": verdict,
        "title": title,
        "summary": summary,
        "headline_percent": headline,
        "headline_label": label,
        "buy_percent": buy,
        "duplicate_item": best_item if similar or color_percent >= 70 else None,
        "duplicate_percent": max(duplicate_percent, color_percent) if (similar or color_percent >= 70) else duplicate_percent,
        "pairings": pairings,
    }

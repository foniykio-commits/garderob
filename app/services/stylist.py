import re
from dataclasses import dataclass, field
from datetime import date

from ..constants import OCCASIONS, label_of
from .colors import pair_harmony
from .weather import RAIN_CODES, SNOW_CODES

_OCCASION_WORDS = [
    ("sport", ["sport", "yugur", "trenirovka", "fitnes", "zalga"]),
    ("bazm", ["bazm", "to'y", "toy", "ziyofat", "party", "kechki bazm"]),
    ("uchrashuv", ["uchrashuv", "svidanie", "romantik"]),
    ("ish", ["ishga", "ofis", "yig'ilish", "yigilish", "meeting", "ish"]),
    ("dam", ["dam olish", "sayr", "kafe", "kinoteatr", "do'stlar", "dostlar"]),
]

_OCCASION_BOOST = {
    "ish": {"pidjak": 16, "klassik shim": 14, "ko'ylak": 12, "tufli": 12, "lofer": 8, "ko'ylak-libos": 8},
    "sport": {"krossovka": 18, "xudi": 12, "futbolka": 10, "shortik": 8, "mayka": 8, "sport": 8},
    "bazm": {"ko'ylak-libos": 18, "tufli": 12, "pidjak": 8, "yubka": 8, "zargarlik": 6},
    "uchrashuv": {"ko'ylak-libos": 14, "ko'ylak": 10, "pidjak": 10, "tufli": 10, "bluzka": 8},
    "dam": {"futbolka": 6, "jinsi": 8, "krossovka": 8, "xudi": 6, "lofer": 4},
    "kundalik": {"jinsi": 6, "futbolka": 4, "ko'ylak": 4, "krossovka": 4, "lofer": 5},
}

_STYLE_BOOST = {
    "minimal": {"ko'ylak": 4, "klassik shim": 4, "palto": 3},
    "klassik": {"pidjak": 10, "tufli": 8, "klassik shim": 8, "ko'ylak": 8, "palto": 4},
    "smart": {"ko'ylak": 6, "jinsi": 6, "lofer": 8, "pidjak": 5},
    "sport": {"krossovka": 8, "xudi": 8, "futbolka": 6},
    "romantika": {"ko'ylak-libos": 10, "yubka": 8, "bluzka": 8, "sandalet": 4},
}

def has_word(text: str, word: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text, flags=re.IGNORECASE) is not None


def normalize(text: str) -> str:
    return (text or "").lower().replace("’", "'").replace("‘", "'").replace("`", "'")


def parse_request(text: str) -> dict:
    cleaned = normalize(text)
    occasion = "kundalik"
    for name, words in _OCCASION_WORDS:
        if any(has_word(cleaned, word) for word in words):
            occasion = name
            break
    temp = None
    match = re.search(r"(-?\d{1,2})\s*(?:°|daraja|gradus)", cleaned)
    if match:
        temp = int(match.group(1))
    rain = any(has_word(cleaned, word) for word in ["yomg'ir", "yomgir", "jala"])
    snow = any(has_word(cleaned, word) for word in ["qor", "qorli"])
    return {"occasion": occasion, "temp": temp, "rain": rain, "snow": snow}


def preferred_seasons(temp: float | None, today: date | None = None) -> list[str]:
    if temp is None:
        month = (today or date.today()).month
        if month in (3, 4, 5):
            base = "spring"
        elif month in (6, 7, 8):
            base = "summer"
        elif month in (9, 10, 11):
            base = "autumn"
        else:
            base = "winter"
        return [base, "all"]
    if temp >= 27:
        return ["summer", "all"]
    if temp >= 18:
        return ["spring", "summer", "all"]
    if temp >= 10:
        return ["spring", "autumn", "all"]
    if temp >= 2:
        return ["autumn", "winter", "all"]
    return ["winter", "all"]


def season_match(item, preferred: list[str]) -> bool:
    seasons = list(getattr(item, "seasons", None) or ["all"])
    if "all" in seasons:
        return True
    return any(season in preferred for season in seasons)


def chunk_polarity(chunk: str) -> int:
    if any(marker in chunk for marker in ["yoqtirma", "yoqmaydi", "yoqmay", "yomon", "kerak emas", "kam kiy"]):
        return -1
    if any(marker in chunk for marker in ["yoqadi", "yoqtiraman", "yaxshi", "sevaman", "kerak"]):
        return 1
    return 0


def preference_delta(item, text: str) -> float:
    if not text:
        return 0
    delta = 0
    for chunk in re.split(r"[,.;\n]", normalize(text)):
        polarity = chunk_polarity(chunk)
        if not polarity:
            continue
        color_name = normalize(getattr(item, "color_name", "") or "")
        subtype = normalize(getattr(item, "subtype", "") or "")
        if color_name and color_name in chunk:
            delta += 6 * polarity
        if subtype and subtype in chunk:
            delta += 5 * polarity
    return delta


def is_blocked(item, temp: float | None, rain: bool) -> bool:
    subtype = getattr(item, "subtype", "") or ""
    category = getattr(item, "category", "")
    if temp is not None and temp >= 22 and subtype == "palto":
        return True
    if temp is not None and temp >= 26 and category == "outerwear":
        return True
    if temp is not None and temp >= 18 and subtype == "etik":
        return True
    if (rain or (temp is not None and temp < 14)) and subtype in {"sandalet", "shortik"}:
        return True
    if temp is not None and temp < 8 and subtype == "mayka":
        return True
    return False


@dataclass
class OutfitDraft:
    title: str
    reason: str
    score: int
    items: list = field(default_factory=list)


@dataclass
class StyleResult:
    reply: str
    outfits: list[OutfitDraft]
    occasion: str
    weather: dict


def _occasion_boost(item, occasion: str) -> float:
    return _OCCASION_BOOST.get(occasion, {}).get(getattr(item, "subtype", ""), 0)


def _style_boost(item, style: str) -> float:
    bonus = _STYLE_BOOST.get(style, {}).get(getattr(item, "subtype", ""), 0)
    if style == "minimal":
        from .colors import is_neutral

        if is_neutral(getattr(item, "color_hex", "") or "#888888"):
            bonus += 6
    return bonus


def _group(items, category: str) -> list:
    return [item for item in items if getattr(item, "category", "") == category]


def _main_piece(pieces: list):
    for category in ("dress", "top", "bottom", "outerwear", "shoes"):
        for item in pieces:
            if item and getattr(item, "category", "") == category:
                return item
    return pieces[0]


def _harmony(pieces: list) -> float:
    colors = [getattr(item, "color_hex", None) for item in pieces if item]
    if len(colors) < 2:
        return 18.0
    total = 0.0
    count = 0
    for index, left in enumerate(colors):
        for right in colors[index + 1 :]:
            total += pair_harmony(left, right)
            count += 1
    return total / max(count, 1)


def _pre_rank(item, occasion: str, style: str, preferences: str) -> float:
    score = _occasion_boost(item, occasion) + _style_boost(item, style) + preference_delta(item, preferences)
    wear_count = getattr(item, "wear_count", 0) or 0
    if wear_count == 0:
        score += 3
    else:
        score -= min(wear_count, 6)
    return score


def _best_accessory(pieces: list, accessories: list, occasion: str):
    if not accessories:
        return None
    main = _main_piece(pieces)
    ranked = []
    for item in accessories:
        if occasion == "sport" and getattr(item, "subtype", "") == "zargarlik":
            continue
        ranked.append((pair_harmony(getattr(main, "color_hex", "#888"), getattr(item, "color_hex", "#888")), item))
    if not ranked:
        return None
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    if ranked[0][0] < 16:
        return None
    return ranked[0][1]


def _reason(pieces: list, harmony: float, occasion_score: float, need_outer: bool) -> str:
    bits = []
    if harmony >= 20:
        bits.append("ranglari uyg'un")
    if occasion_score >= 8:
        bits.append("vaziyatga mos turlar")
    if need_outer and any(getattr(item, "category", "") == "outerwear" for item in pieces):
        bits.append("ob-havo uchun tashqi kiyim qo'shilgan")
    if any((getattr(item, "wear_count", 0) or 0) == 0 for item in pieces):
        bits.append("kam kiyilgan narsalar ham kirgan")
    if not bits:
        bits.append("garderobingizdagi eng yaqin juftlik")
    text = ", ".join(bits)
    return text[:1].upper() + text[1:] + "."


def _personal_lines(profile) -> list[str]:
    lines = []
    height = getattr(profile, "height_cm", None)
    weight = getattr(profile, "weight_kg", None)
    age = getattr(profile, "age", None)
    if height and height >= 180:
        lines.append("Bo'yingiz baland — bir rangli obrazlar siluetni yanada tekis ko'rsatadi.")
    elif height and height <= 158:
        lines.append("Yuqori va pastki ranglarni yaqin tutsangiz, obraz yaxlit ko'rinadi.")
    if height and weight and height > 0:
        bmi = weight / ((height / 100) ** 2)
        if bmi >= 30:
            lines.append("Monoxrom rang va tekis mato siluetni yengil qiladi. Bu tibbiy maslahat emas.")
        elif bmi < 18.5:
            lines.append("Qatlam va faktura obrazga hajm qo'shadi. Bu tibbiy maslahat emas.")
    if age and age < 20:
        lines.append("Yosh garderobda ham bitta ozoda poyabzal butun obrazni yig'adi.")
    return lines[:2]


def _narrate(profile, weather: dict, occasion: str, outfits: list[OutfitDraft], rain: bool) -> str:
    if not outfits:
        return (
            "Hozircha to'liq obraz chiqmaydi. Kamida bitta libos, yoki ustki bilan pastki kiyim qo'shing — "
            "shundan keyin aniq kombinatsiya tuzaman."
        )
    name = (getattr(profile, "name", "") or "").strip()
    who = f"{name}, " if name else ""
    temp = weather.get("temp")
    city = weather.get("city") or "Shaharingiz"
    if temp is None:
        opening = f"{who}{city} ob-havosi hozir olinmadi. Mavsum bo'yicha maslahat beraman."
    else:
        rain_bit = ", yomg'ir bor" if rain else ""
        opening = f"{who}{city}da hozir {round(temp)}°C, {weather.get('description') or 'ob-havo'}{rain_bit}."
    label = label_of(OCCASIONS, occasion).lower()
    count = len(outfits)
    best = outfits[0]
    names = ", ".join(getattr(item, "name", "kiyim") for item in best.items)
    extra = " Yana zaxira obrazlarni pastda qoldirdim." if count > 1 else ""
    tips = " ".join(_personal_lines(profile))
    tip_text = f" {tips}" if tips else ""
    return (
        f"{opening} {label.capitalize()} uchun {count} ta obraz yig'dim. "
        f"Eng yaxshisi — {names}. {best.reason}{tip_text}{extra}"
    )


def suggest(items: list, weather: dict | None, profile, occasion: str = "kundalik", user_text: str = "") -> StyleResult:
    parsed = parse_request(user_text)
    if user_text.strip():
        occasion = parsed["occasion"]
    weather = dict(weather or {})
    if parsed["temp"] is not None:
        weather["temp"] = parsed["temp"]
    rain = bool(parsed["rain"] or parsed["snow"])
    if not rain:
        code = weather.get("code")
        try:
            code_int = int(code) if code is not None else None
        except (TypeError, ValueError):
            code_int = None
        rain = (weather.get("precipitation") or 0) >= 0.4 or code_int in RAIN_CODES or code_int in SNOW_CODES
    if parsed["snow"] and weather.get("temp") is None:
        weather["temp"] = 0
    temp = weather.get("temp")
    preferred = preferred_seasons(temp)
    style = getattr(profile, "style", "smart") or "smart"
    preferences = getattr(profile, "preferences", "") or ""
    usable = [item for item in items if not is_blocked(item, temp, rain)]
    pools = {
        category: sorted(
            _group(usable, category),
            key=lambda item: _pre_rank(item, occasion, style, preferences),
            reverse=True,
        )
        for category in ("top", "bottom", "dress", "outerwear", "shoes", "accessory")
    }
    tops = pools["top"][:6]
    bottoms = pools["bottom"][:6]
    dresses = pools["dress"][:5]
    outers = pools["outerwear"][:4]
    shoes = pools["shoes"][:4]
    outer_opts = (outers + [None]) if outers else [None]
    shoe_opts = shoes or [None]
    combos: list[list] = []
    for dress in dresses:
        for shoe in shoe_opts:
            for outer in outer_opts:
                combos.append([piece for piece in (dress, shoe, outer) if piece is not None])
    if tops and bottoms:
        for top in tops:
            for bottom in bottoms:
                for shoe in shoe_opts:
                    for outer in outer_opts:
                        combos.append([piece for piece in (top, bottom, shoe, outer) if piece is not None])
    elif tops:
        for top in tops:
            for shoe in shoe_opts:
                combos.append([piece for piece in (top, shoe) if piece is not None])
    elif bottoms:
        for bottom in bottoms:
            for shoe in shoe_opts:
                combos.append([piece for piece in (bottom, shoe) if piece is not None])

    need_outer = bool(rain or (temp is not None and temp < 17))
    very_cold = temp is not None and temp < 8
    scored: list[tuple[float, list]] = []
    seen = set()
    for pieces in combos:
        key = tuple(sorted(getattr(item, "id", id(item)) for item in pieces))
        if key in seen or not pieces:
            continue
        seen.add(key)
        harmony = _harmony(pieces)
        occasion_score = sum(_occasion_boost(item, occasion) for item in pieces)
        style_score = sum(_style_boost(item, style) for item in pieces)
        pref_score = sum(preference_delta(item, preferences) for item in pieces)
        season_score = sum(8 if season_match(item, preferred) else -12 for item in pieces)
        wear_score = 0
        for item in pieces:
            if (getattr(item, "wear_count", 0) or 0) == 0:
                wear_score += 4
            else:
                wear_score -= min(getattr(item, "wear_count", 0) or 0, 5)
        has_outer = any(getattr(item, "category", "") == "outerwear" for item in pieces)
        outer_score = 0
        if need_outer and has_outer:
            outer_score += 18
        elif very_cold and not has_outer:
            outer_score -= 16
        elif temp is not None and temp >= 26 and has_outer:
            outer_score -= 8
        if any(getattr(item, "category", "") == "shoes" for item in pieces):
            outer_score += 6
        score = 48 + harmony + min(occasion_score, 18) + min(style_score, 12) + pref_score + season_score + wear_score + outer_score
        scored.append((score, pieces))
    scored.sort(key=lambda pair: pair[0], reverse=True)

    picked: list[tuple[float, list]] = []
    used_mains = set()
    for score, pieces in scored:
        accessory = _best_accessory(pieces, pools["accessory"][:6], occasion)
        full = list(pieces)
        if accessory and all(getattr(accessory, "id", None) != getattr(item, "id", None) for item in full):
            full.append(accessory)
            score += 4
        main = _main_piece(full)
        main_id = getattr(main, "id", id(main))
        if main_id in used_mains:
            continue
        used_mains.add(main_id)
        picked.append((score, full))
        if len(picked) == 3:
            break

    drafts = []
    for score, pieces in picked:
        harmony = _harmony(pieces)
        occasion_score = sum(_occasion_boost(item, occasion) for item in pieces)
        main = _main_piece(pieces)
        drafts.append(
            OutfitDraft(
                title=f"{label_of(OCCASIONS, occasion)} · {getattr(main, 'name', 'Obraz')}",
                reason=_reason(pieces, harmony, occasion_score, need_outer),
                score=int(max(42, min(98, round(score)))),
                items=pieces,
            )
        )
    return StyleResult(
        reply=_narrate(profile, weather, occasion, drafts, rain),
        outfits=drafts,
        occasion=occasion,
        weather=weather,
    )

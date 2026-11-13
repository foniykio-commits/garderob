CATEGORIES = [
    ("top", "Ustki"),
    ("bottom", "Pastki"),
    ("dress", "Libos"),
    ("outerwear", "Tashqi kiyim"),
    ("shoes", "Oyoq kiyim"),
    ("accessory", "Aksessuarlar"),
    ("other", "Boshqa"),
]

SUBTYPES = {
    "top": ["ko'ylak", "futbolka", "bluzka", "sviter", "xudi", "polo", "mayka", "boshqa"],
    "bottom": ["jinsi", "klassik shim", "shim", "yubka", "shortik", "boshqa"],
    "dress": ["ko'ylak-libos", "sarafan", "kombinezon", "boshqa"],
    "outerwear": ["palto", "kurtka", "pidjak", "trenc", "kardigan", "yomg'irpo'sh", "boshqa"],
    "shoes": ["krossovka", "tufli", "etik", "sandalet", "lofer", "boshqa"],
    "accessory": ["sumka", "kamar", "sharf", "bosh kiyim", "soat", "ko'zoynak", "zargarlik", "boshqa"],
    "other": ["sport", "uy kiyimi", "boshqa"],
}

SEASONS = [
    ("spring", "Bahor"),
    ("summer", "Yoz"),
    ("autumn", "Kuz"),
    ("winter", "Qish"),
    ("all", "Barcha mavsum"),
]

OCCASIONS = [
    ("kundalik", "Kundalik"),
    ("ish", "Ish"),
    ("uchrashuv", "Uchrashuv"),
    ("bazm", "Bazm"),
    ("sport", "Sport"),
    ("dam", "Dam olish"),
]

STYLES = [
    ("minimal", "Minimal"),
    ("klassik", "Klassik"),
    ("smart", "Smart-casual"),
    ("sport", "Sport"),
    ("romantika", "Romantik"),
]

COLORS = [
    ("qora", "#161616"),
    ("oq", "#f4f4f4"),
    ("kulrang", "#8e8e8e"),
    ("bej", "#d7c4a3"),
    ("krem", "#f3e6cf"),
    ("jigarrang", "#6b4423"),
    ("qizil", "#c0392b"),
    ("bordo", "#6e2430"),
    ("pushti", "#e7a6b5"),
    ("apelsin", "#e07a2f"),
    ("sariq", "#e2c044"),
    ("xantal", "#b9973b"),
    ("yashil", "#2f7d4a"),
    ("zaytun", "#6d7f3a"),
    ("ko'k", "#2f5fbf"),
    ("havo rang", "#7eb6d6"),
    ("to'q ko'k", "#1c2c4a"),
    ("binafsha", "#6c4c93"),
]

CATEGORY_KEYS = {key for key, _ in CATEGORIES}
SEASON_KEYS = {key for key, _ in SEASONS}
OCCASION_KEYS = {key for key, _ in OCCASIONS}
STYLE_KEYS = {key for key, _ in STYLES}


def label_of(pairs: list[tuple[str, str]], key: str) -> str:
    return dict(pairs).get(key, key)


def meta_dict() -> dict:
    return {
        "app": "Garderob",
        "version": "1.0.0",
        "categories": [{"key": key, "label": label} for key, label in CATEGORIES],
        "subtypes": SUBTYPES,
        "seasons": [{"key": key, "label": label} for key, label in SEASONS],
        "occasions": [{"key": key, "label": label} for key, label in OCCASIONS],
        "styles": [{"key": key, "label": label} for key, label in STYLES],
        "colors": [{"name": name, "hex": hex_code} for name, hex_code in COLORS],
        "forgotten_days": 45,
        "limits": {"library": None, "batch": 40},
    }


def clean_seasons(values: list[str] | None) -> list[str]:
    picked = []
    for value in values or []:
        if value in SEASON_KEYS and value not in picked:
            picked.append(value)
    if not picked or "all" in picked:
        return ["all"]
    return picked


def suggest_name(color_name: str, subtype: str, category: str) -> str:
    kind = subtype if subtype and subtype != "boshqa" else label_of(CATEGORIES, category)
    color = (color_name or "Yangi").strip()
    if color:
        color = color[:1].upper() + color[1:]
    return f"{color} {kind}".strip()

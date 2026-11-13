import colorsys

from ..constants import COLORS


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    raw = (value or "").strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        return (136, 136, 136)
    try:
        return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (136, 136, 136)


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def color_similarity(hex_a: str, hex_b: str) -> float:
    return max(0.0, 1 - color_distance(hex_to_rgb(hex_a), hex_to_rgb(hex_b)) / 441.67)


def nearest_name(rgb: tuple[int, int, int]) -> str:
    best_name = "bej"
    best_dist = 10**9
    for name, hex_code in COLORS:
        dist = color_distance(rgb, hex_to_rgb(hex_code))
        if dist < best_dist:
            best_name = name
            best_dist = dist
    return best_name


def hex_for_name(name: str) -> str | None:
    for color_name, hex_code in COLORS:
        if color_name == name:
            return hex_code
    return None


def to_hls(hex_code: str) -> tuple[float, float, float]:
    red, green, blue = hex_to_rgb(hex_code)
    hue, lightness, saturation = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
    return hue, lightness, saturation


def is_neutral(hex_code: str) -> bool:
    _hue, lightness, saturation = to_hls(hex_code)
    return saturation < 0.18 or lightness < 0.10 or lightness > 0.92


def hue_delta(a: float, b: float) -> float:
    diff = abs(a - b)
    return min(diff, 1 - diff)


def pair_harmony(hex_a: str, hex_b: str) -> float:
    if is_neutral(hex_a) or is_neutral(hex_b):
        return 26.0
    hue_a, _, _ = to_hls(hex_a)
    hue_b, _, _ = to_hls(hex_b)
    delta = hue_delta(hue_a, hue_b)
    if delta < 0.08:
        return 23.0
    if delta < 0.15:
        return 18.0
    if delta >= 0.40:
        return 24.0
    if delta < 0.28:
        return 10.0
    return 14.0


def harmony_phrase(hex_a: str, hex_b: str) -> str:
    if is_neutral(hex_a) or is_neutral(hex_b):
        return "Neytral rang — ko'p narsa bilan tushadi."
    hue_a, _, _ = to_hls(hex_a)
    hue_b, _, _ = to_hls(hex_b)
    delta = hue_delta(hue_a, hue_b)
    if delta >= 0.40:
        return "Ranglar bir-birini ochadi."
    if delta < 0.15:
        return "Yaqin ranglar, sokin obraz."
    return "Birga kiyish mumkin."


def analyze_image(image) -> dict:
    rgba = image.convert("RGBA")
    buckets: dict[tuple[int, int, int], int] = {}
    reader = rgba.get_flattened_data if hasattr(rgba, "get_flattened_data") else rgba.getdata
    step = 0
    for red, green, blue, alpha in reader():
        step += 1
        if step % 3:
            continue
        if alpha < 140:
            continue
        key = (red // 16 * 16, green // 16 * 16, blue // 16 * 16)
        buckets[key] = buckets.get(key, 0) + 1
    if not buckets:
        return {"color_hex": "#d7c4a3", "color_name": "bej", "palette": ["#d7c4a3"]}
    ranked = sorted(buckets.items(), key=lambda item: item[1], reverse=True)
    primary = ranked[0][0]
    palette: list[str] = []
    for rgb, _count in ranked:
        if len(palette) >= 4:
            break
        if all(color_distance(rgb, hex_to_rgb(existing)) > 46 for existing in palette):
            palette.append(rgb_to_hex(rgb))
    if not palette:
        palette = [rgb_to_hex(primary)]
    return {
        "color_hex": rgb_to_hex(primary),
        "color_name": nearest_name(primary),
        "palette": palette,
    }

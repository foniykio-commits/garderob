"""Read a person out of one or more photos.

The photo is not stored. A small copy is measured in memory: background
versus subject, skin colour, dark eye spots, and the width of a standing
silhouette at the shoulders and hips.
"""

import io

from PIL import Image, ImageOps

SKINS = (
    (243, 211, 191),
    (231, 184, 146),
    (198, 134, 66),
    (141, 85, 36),
    (92, 51, 23),
    (59, 34, 20),
)
SHOULDER_RATIO = 0.28
HIP_RATIO = 0.23


class AvatarError(Exception):
    pass


def read_avatar(blobs: list[bytes], hint: str = "auto") -> dict:
    parts = []
    for index, blob in enumerate(blobs):
        part = _analyze(blob, hint)
        if part is None:
            continue
        part["index"] = index
        parts.append(part)
    if not parts:
        raise AvatarError("Rasmda odam topilmadi. Yuz yoki butun tana tekis fonda bo'lsin.")
    return _merge(parts)


def _analyze(blob: bytes, hint: str) -> dict | None:
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(blob)))
        image = image.convert("RGB")
    except Exception:
        return None
    image.thumbnail((180, 180))
    width, height = image.size
    pixels = list(image.get_flattened_data())
    background = _border_color(pixels, width, height)
    mask = []
    for y in range(height):
        row = []
        for x in range(width):
            red, green, blue = pixels[y * width + x]
            distance = abs(red - background[0]) + abs(green - background[1]) + abs(blue - background[2])
            row.append(distance > 46)
        mask.append(row)
    rows = []
    filled = []
    for y, row in enumerate(mask):
        xs = [x for x, on in enumerate(row) if on]
        if len(xs) < 3:
            rows.append(0)
            continue
        rows.append(xs[-1] - xs[0] + 1)
        filled.append(y)
    if len(filled) < 16:
        return None
    top, bottom = filled[0], filled[-1]
    span = max(1, bottom - top)
    kind = _kind(rows, top, bottom, span, height, hint)
    skin_points = _skin_points(pixels, mask, width, height, top, span, kind)
    if len(skin_points) < 12:
        return None
    skin = _median_rgb([(point[2], point[3], point[4]) for point in skin_points])
    features, face_box = _face(pixels, width, height, skin_points, skin, kind, top, span)
    hair = _hair(pixels, width, face_box, skin)
    shoulder = hips = height_cm = weight_kg = None
    if kind in {"body", "side"}:
        shoulder, hips, height_cm, weight_kg = _proportions(rows, top, span, kind)
    return {
        "kind": kind,
        "skin": skin,
        "hair": hair,
        "features": features,
        "face_box": face_box,
        "shoulder": shoulder,
        "hips": hips,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
    }


def _border_color(pixels, width, height):
    samples = []
    for x in range(width):
        samples.append(pixels[x])
        samples.append(pixels[(height - 1) * width + x])
    for y in range(height):
        samples.append(pixels[y * width])
        samples.append(pixels[y * width + width - 1])
    return _median_rgb(samples)


def _median_rgb(samples) -> tuple[int, int, int]:
    channels = []
    for index in range(3):
        values = sorted(sample[index] for sample in samples)
        channels.append(values[len(values) // 2])
    return tuple(channels)


def _kind(rows, top, bottom, span, height, hint) -> str:
    widest = max(rows) or 1
    aspect = span / widest
    reaches_floor = bottom > height * 0.72
    if hint == "face":
        return "face"
    if aspect >= 2.15 and reaches_floor:
        if widest / span < 0.12:
            return "side"
        return "body"
    if hint == "body" and aspect >= 1.7 and reaches_floor:
        return "body"
    return "face"


def _is_skin(red, green, blue) -> bool:
    bright = max(red, green, blue)
    dark = min(red, green, blue)
    if bright < 42 or dark > 246:
        return False
    if green > red + 14 or blue > red + 10:
        return False
    if red < green - 10 or red < blue - 6:
        return False
    return bright - dark > 10


def _skin_points(pixels, mask, width, height, top, span, kind):
    limit = top + span * 0.22 if kind in {"body", "side"} else height
    points = []
    for y in range(height):
        if y > limit and kind in {"body", "side"}:
            break
        for x in range(width):
            if not mask[y][x]:
                continue
            color = pixels[y * width + x]
            if _is_skin(*color):
                points.append((x, y, *color))
    return points


def _face(pixels, width, height, skin_points, skin, kind, top, span):
    xs = [point[0] for point in skin_points]
    ys = [point[1] for point in skin_points]
    box = _padded_box(min(xs), min(ys), max(xs), max(ys), width, height, 0.12)
    if kind in {"body", "side"}:
        head_bottom = top + max(8, int(span * 0.16))
        head_points = [point for point in skin_points if point[1] <= head_bottom]
        if len(head_points) >= 8:
            box = _padded_box(
                min(point[0] for point in head_points),
                min(point[1] for point in head_points),
                max(point[0] for point in head_points),
                max(point[1] for point in head_points),
                width,
                height,
                0.18,
            )
        return [], box
    skin_luma = 0.3 * skin[0] + 0.59 * skin[1] + 0.11 * skin[2]
    left = []
    right = []
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    center = (x0 + x1) / 2
    y_start = int(y0 + (y1 - y0) * 0.22)
    y_end = int(y0 + (y1 - y0) * 0.58)
    for y in range(max(0, y_start), min(height, y_end + 1)):
        for x in range(max(0, x0), min(width, x1 + 1)):
            red, green, blue = pixels[y * width + x]
            luma = 0.3 * red + 0.59 * green + 0.11 * blue
            if luma > skin_luma - 38:
                continue
            (left if x <= center else right).append((x, y))
    if len(left) < 4 or len(right) < 4:
        return [], box
    eye_l = (sum(point[0] for point in left) / len(left), sum(point[1] for point in left) / len(left))
    eye_r = (sum(point[0] for point in right) / len(right), sum(point[1] for point in right) / len(right))
    gap = abs(eye_r[0] - eye_l[0])
    face_width = max(xs) - min(xs) + 1
    if gap < face_width * 0.12:
        return [], box
    mid_x = (eye_l[0] + eye_r[0]) / 2
    mid_y = (eye_l[1] + eye_r[1]) / 2
    box_w = gap * 2.8
    box_h = gap * 3.5
    box = _padded_box(mid_x - box_w / 2, mid_y - box_h * 0.42, mid_x + box_w / 2, mid_y + box_h * 0.58, width, height, 0)
    features = [
        {"name": "eye", "x": round(eye_l[0] / width, 4), "y": round(eye_l[1] / height, 4)},
        {"name": "eye", "x": round(eye_r[0] / width, 4), "y": round(eye_r[1] / height, 4)},
    ]
    return features, box


def _padded_box(x0, y0, x1, y1, width, height, pad) -> dict:
    box_w = max(1, x1 - x0)
    box_h = max(1, y1 - y0)
    x0 -= box_w * pad
    x1 += box_w * pad
    y0 -= box_h * pad
    y1 += box_h * pad
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(width - 1, x1)
    y1 = min(height - 1, y1)
    return {
        "x": round(x0 / width, 4),
        "y": round(y0 / height, 4),
        "w": round(max(1, x1 - x0) / width, 4),
        "h": round(max(1, y1 - y0) / height, 4),
    }


def _hair(pixels, width, face_box, skin):
    if not face_box:
        return None
    skin_luma = 0.3 * skin[0] + 0.59 * skin[1] + 0.11 * skin[2]
    x0 = int(face_box["x"] * width)
    y0 = int(face_box["y"] * len(pixels) / width)
    box_w = max(1, int(face_box["w"] * width))
    box_h = max(1, int(face_box["h"] * (len(pixels) / width)))
    band = max(2, int(box_h * 0.2))
    dark = []
    height = len(pixels) // width
    for y in range(max(0, y0), min(height, y0 + band)):
        for x in range(max(0, x0), min(width, x0 + box_w)):
            red, green, blue = pixels[y * width + x]
            luma = 0.3 * red + 0.59 * green + 0.11 * blue
            if luma < skin_luma - 32:
                dark.append((red, green, blue))
    if len(dark) < 10:
        return None
    return _median_rgb(dark)


def _proportions(rows, top, span, kind):
    def at(ratio):
        y = min(len(rows) - 1, top + int(span * ratio))
        return rows[y] or 1

    shoulder = hips = None
    if kind == "body":
        shoulder = _clamp((at(0.18) / span) / SHOULDER_RATIO, 0.82, 1.22)
        hips = _clamp((at(0.52) / span) / HIP_RATIO, 0.82, 1.22)
    torso = (at(0.28) + at(0.48)) / 2
    girth = torso / span
    bmi = _clamp(22.5 * (girth / 0.22) ** 1.15, 17, 34)
    height_cm = _clamp(158 + (span / max(torso, 1) - 3.4) * 16, 150, 200)
    weight = _clamp(bmi * (height_cm / 100) ** 2, 40, 140)
    return (
        None if shoulder is None else round(shoulder, 3),
        None if hips is None else round(hips, 3),
        round(height_cm),
        round(weight),
    )


def _clamp(value, low, high):
    return max(low, min(high, value))


def _hex(color) -> str:
    return "#{:02x}{:02x}{:02x}".format(*color)


def _nearest_skin(color) -> int:
    best_index = 0
    best_distance = None
    for index, swatch in enumerate(SKINS):
        distance = sum((color[channel] - swatch[channel]) ** 2 for channel in range(3))
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_index = index
    return best_index


def _merge(parts: list[dict]) -> dict:
    faces = [part for part in parts if part["kind"] == "face"]
    bodies = [part for part in parts if part["kind"] == "body"]
    sides = [part for part in parts if part["kind"] == "side"]
    skin_source = faces[0] if faces else (bodies[0] if bodies else parts[0])
    proportion = bodies[0] if bodies else (sides[0] if sides else None)
    face_source = faces[0] if faces else (bodies[0] if bodies and bodies[0]["face_box"] else None)
    hair = next((part["hair"] for part in faces if part["hair"]), None)
    return {
        "skin_hex": _hex(skin_source["skin"]),
        "skin_index": _nearest_skin(skin_source["skin"]),
        "hair_hex": None if hair is None else _hex(hair),
        "height_cm": None if proportion is None else proportion["height_cm"],
        "weight_kg": None if proportion is None else proportion["weight_kg"],
        "shoulder": None if proportion is None else proportion["shoulder"],
        "hips": None if proportion is None else proportion["hips"],
        "face_box": None if face_source is None else face_source["face_box"],
        "face_index": None if face_source is None else face_source["index"],
        "features": [] if face_source is None else face_source["features"],
        "reads": [{"index": part["index"], "kind": part["kind"]} for part in parts],
    }

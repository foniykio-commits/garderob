import io
import logging
from collections import deque

from PIL import Image, ImageOps

from .colors import analyze_image

logger = logging.getLogger("garderob")
_REMBG: bool | None = None


def rembg_available() -> bool:
    global _REMBG
    if _REMBG is None:
        try:
            import rembg  # noqa: F401

            _REMBG = True
        except Exception:
            _REMBG = False
    return _REMBG


def resize_max(image: Image.Image, side: int = 900) -> Image.Image:
    image = image.copy()
    image.thumbnail((side, side), Image.Resampling.LANCZOS)
    return image


def _cut_with_rembg(image: Image.Image) -> Image.Image:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    from rembg import remove

    output = remove(buffer.getvalue())
    return Image.open(io.BytesIO(output)).convert("RGBA")


def remove_plain_background(image: Image.Image) -> Image.Image:
    """Bir xil fonni burchaklardan boshlab olib tashlaydi. Kiyim markazini saqlaydi."""
    image = image.convert("RGBA")
    width, height = image.size
    reader = image.get_flattened_data if hasattr(image, "get_flattened_data") else image.getdata
    pixels = list(reader())
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    samples = [pixels[y * width + x][:3] for x, y in corners]
    average = tuple(sum(channel[index] for channel in samples) // 4 for index in range(3))

    def near(color: tuple[int, int, int], limit: int) -> bool:
        return abs(color[0] - average[0]) + abs(color[1] - average[1]) + abs(color[2] - average[2]) <= limit

    if any(not near(sample, 36) for sample in samples):
        return image

    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for x, y in corners:
        visited[y * width + x] = 1
        queue.append((x, y))
    removed = 0
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        red, green, blue, _alpha = pixels[index]
        if not near((red, green, blue), 48):
            continue
        pixels[index] = (red, green, blue, 0)
        removed += 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                neighbor = ny * width + nx
                if not visited[neighbor]:
                    visited[neighbor] = 1
                    queue.append((nx, ny))
    total = width * height
    center = pixels[(height // 2) * width + (width // 2)]
    if removed < total * 0.02 or removed > total * 0.93 or center[3] == 0:
        return image
    cut = Image.new("RGBA", (width, height))
    cut.putdata(pixels)
    return cut


def cutout(image: Image.Image) -> Image.Image:
    if rembg_available():
        try:
            return _cut_with_rembg(image)
        except Exception:
            logger.exception("rembg fonni tozalay olmadi, oddiy usul ishlatiladi")
    return remove_plain_background(image)


def process_bytes(raw: bytes) -> tuple[bytes, dict]:
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
    image = resize_max(image.convert("RGBA"), 900)
    cut = cutout(image)
    info = analyze_image(cut)
    buffer = io.BytesIO()
    cut.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), info

import logging
import os
import time

import httpx

logger = logging.getLogger("garderob")
_CACHE: dict[str, tuple[float, dict]] = {}

_CODES = {
    0: "ochiq",
    1: "asosan ochiq",
    2: "bulutli",
    3: "bulutli",
    45: "tuman",
    48: "tuman",
    51: "yengil yomg'ir",
    53: "yomg'ir",
    55: "kuchli yomg'ir",
    61: "yomg'ir",
    63: "yomg'ir",
    65: "kuchli yomg'ir",
    71: "qor",
    73: "qor",
    75: "kuchli qor",
    80: "jala",
    81: "jala",
    82: "kuchli jala",
    95: "momaqaldiroq",
    96: "momaqaldiroq",
    99: "momaqaldiroq",
}
RAIN_CODES = {51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99}
SNOW_CODES = {71, 73, 75, 77}


def describe_code(code: int | None) -> str:
    if code is None:
        return "ob-havo noaniq"
    return _CODES.get(int(code), "o'zgaruvchan")


def empty_weather(city: str, description: str = "ob-havo olinmadi") -> dict:
    return {
        "city": city or "Toshkent",
        "temp": None,
        "code": None,
        "precipitation": 0,
        "wind": None,
        "description": description,
    }


def fetch_weather(city: str) -> dict:
    city = (city or "Toshkent").strip() or "Toshkent"
    if os.getenv("GARDEBOB_OFFLINE") == "1":
        return {
            "city": city,
            "temp": 18,
            "code": 2,
            "precipitation": 0,
            "wind": 5,
            "description": "bulutli",
        }
    key = city.lower()
    cached = _CACHE.get(key)
    if cached and time.time() - cached[0] < 1800:
        return dict(cached[1])
    try:
        with httpx.Client(timeout=6) as client:
            geo = client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": city, "count": 1, "language": "uz"},
            )
            geo.raise_for_status()
            results = geo.json().get("results") or []
            if not results:
                if key not in {"toshkent", "tashkent"}:
                    return fetch_weather("Toshkent")
                return empty_weather(city)
            loc = results[0]
            forecast = client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": loc["latitude"],
                    "longitude": loc["longitude"],
                    "current": "temperature_2m,weather_code,precipitation,wind_speed_10m",
                    "timezone": "auto",
                },
            )
            forecast.raise_for_status()
            current = forecast.json().get("current") or {}
            data = {
                "city": loc.get("name") or city,
                "temp": current.get("temperature_2m"),
                "code": current.get("weather_code"),
                "precipitation": current.get("precipitation") or 0,
                "wind": current.get("wind_speed_10m"),
                "description": describe_code(current.get("weather_code")),
            }
            _CACHE[key] = (time.time(), data)
            return dict(data)
    except Exception:
        logger.warning("Ob-havo olinmadi", exc_info=True)
        return empty_weather(city)

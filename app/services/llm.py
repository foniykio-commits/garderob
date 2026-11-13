import logging
import os

import httpx

logger = logging.getLogger("garderob")


def polish_reply(reply: str, outfit_names: list[str], profile_name: str) -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        return reply
    base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    names = ", ".join(outfit_names) or "yo'q"
    payload = {
        "model": model,
        "temperature": 0.4,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Sen shaxsiy garderob stilistisan. Faqat o'zbek tilida, 4-6 jumla, iliq va aniq yoz. "
                    "Ro'yxatda yo'q kiyimni o'ylab topma. Tibbiy tashxis qo'yma."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Foydalanuvchi: {profile_name or 'Kio'}\n"
                    f"Mavjud obrazdagi kiyimlar: {names}\n"
                    f"Qoralama:\n{reply}\n\nShu mazmunni saqlab, ravonroq qilib ber."
                ),
            },
        ],
    }
    try:
        with httpx.Client(timeout=12) as client:
            response = client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"].strip()
            return text or reply
    except Exception:
        logger.warning("Ixtiyoriy AI javobi olinmadi, o'rnatilgan matn qoldi", exc_info=True)
        return reply

# Garderob

Shaxsiy garderob va AI stilist. Telefondan ham ochiladi. Obuna va rasm limiti yo'q.

Lokalda `DATABASE_URL` bo'sh bo'lsa SQLite ishlatiladi. Bulutga qo'yilganda PostgreSQL (Neon, Supabase, Render) va Cloudinary ulanadi.

## Lokal ishga tushirish

```powershell
cd garderob
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

Brauzer: http://127.0.0.1:8787

Telefonda Safari yoki Chrome menyusidan **Bosh ekranga qo'shish** ni bosing. Ilova alohida ikonka bilan ochiladi. Buning uchun sayt HTTPS da bo'lishi kerak (Render yoki Railway shuni beradi). `localhost` da ham o'rnatish sinovi ishlaydi.

## Bulutga qo'yish

1. [Neon](https://neon.tech) yoki [Supabase](https://supabase.com) da bepul Postgres yarating. Ulanish satrini oling. `postgres://` ni qo'lda o'zgartirmang.
2. [Cloudinary](https://cloudinary.com) da bepul hisob oching. `CLOUDINARY_URL` ni oling (`cloudinary://kalit:sir@nom`).
3. Shu papkani Render yoki Railway ga ulang.

Render `render.yaml` ni o'qiydi. Railway `Dockerfile` va `railway.toml` dan turadi. Ikkalasida ham muhit o'zgaruvchilari:

| O'zgaruvchi | Vazifasi |
| --- | --- |
| `DATABASE_URL` | Postgres manzili. Bo'sh bo'lsa lokal SQLite |
| `CLOUDINARY_URL` | Rasmlar shu yerda saqlanadi. Bo'sh bo'lsa server diskida qoladi |
| `OPENAI_API_KEY` | Ixtiyoriy. Bo'sh bo'lsa o'rnatilgan stilist ishlaydi |

Start buyrug'i:

```text
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Docker ham shu portni oladi. Tekshiruv manzili: `/api/health` — `database` va `images` maydonlari qaysi rejimda ekanini ko'rsatadi.

Murakkab fon uchun ixtiyoriy: `pip install rembg`. Bulut obrazida bu og'ir, shuning uchun standart o'rnatishga kirmaydi.

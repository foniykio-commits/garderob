import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_dotenv() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()

DATA_DIR = Path(os.environ.get("GARDEBOB_DATA_DIR", ROOT / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
ITEMS_DIR = UPLOAD_DIR / "items"
INBOX_DIR = UPLOAD_DIR / "inbox"
DB_PATH = DATA_DIR / "garderob.db"
SQLITE_URL = "sqlite:///" + DB_PATH.as_posix()


def sqlalchemy_url(url: str) -> str:
    """Render, Railway, Neon va Supabase `postgres://` beradi. SQLAlchemy uchun psycopg drayveriga o'giramiz."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def resolve_database_url() -> str:
    if os.getenv("GARDEBOB_FORCE_SQLITE") == "1":
        return SQLITE_URL
    configured = os.getenv("DATABASE_URL", "").strip()
    if configured:
        return sqlalchemy_url(configured)
    return SQLITE_URL


DATABASE_URL = resolve_database_url()
USING_POSTGRES = DATABASE_URL.startswith("postgresql")

DEFAULT_CITY = os.environ.get("GARDEBOB_CITY", "Toshkent")
MAX_BATCH = 40
MAX_IMAGE_BYTES = 12 * 1024 * 1024
FORGOTTEN_DAYS = 45
NEW_ITEM_GRACE_DAYS = 10

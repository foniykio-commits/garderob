from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL, USING_POSTGRES

_engine_kwargs: dict = {"pool_pre_ping": True}
if not USING_POSTGRES:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def ensure_schema() -> None:
    """Eski lokal bazaga yangi ustun qo'shadi. Yangi Postgres bazasini create_all to'ldiradi."""
    tables = inspect(engine).get_table_names()
    if "items" not in tables:
        return
    columns = {column["name"] for column in inspect(engine).get_columns("items")}
    if "stored_url" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE items ADD COLUMN stored_url VARCHAR(800)"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), default="Kio")
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    city: Mapped[str] = mapped_column(String(80), default="Toshkent")
    style: Mapped[str] = mapped_column(String(40), default="smart")
    preferences: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(32), index=True)
    subtype: Mapped[str] = mapped_column(String(40), default="")
    color_name: Mapped[str] = mapped_column(String(40), default="")
    color_hex: Mapped[str] = mapped_column(String(7), default="#888888")
    palette: Mapped[list] = mapped_column(JSON, default=list)
    seasons: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    filename: Mapped[str] = mapped_column(String(255), unique=True)
    stored_url: Mapped[str | None] = mapped_column(String(800), nullable=True)
    wear_count: Mapped[int] = mapped_column(Integer, default=0)
    last_worn_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WearEntry(Base):
    __tablename__ = "wear_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    worn_on: Mapped[date] = mapped_column(Date, unique=True, index=True)
    item_ids: Mapped[list] = mapped_column(JSON, default=list)
    occasion: Mapped[str] = mapped_column(String(32), default="kundalik")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

from datetime import date

from pydantic import BaseModel, Field


class ProfileIn(BaseModel):
    name: str = ""
    height_cm: float | None = None
    weight_kg: float | None = None
    age: int | None = None
    city: str = "Toshkent"
    style: str = "smart"
    preferences: str = ""


class ItemUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    subtype: str | None = None
    color_name: str | None = None
    color_hex: str | None = None
    seasons: list[str] | None = None
    notes: str | None = None


class WearIn(BaseModel):
    worn_on: date
    item_ids: list[int] = Field(default_factory=list)
    occasion: str = "kundalik"
    note: str = ""


class ChatIn(BaseModel):
    message: str


class ShopRecheckIn(BaseModel):
    temp_id: str
    category: str = ""
    subtype: str = ""


class ShopKeepIn(BaseModel):
    temp_id: str
    name: str | None = None
    category: str
    subtype: str = ""
    seasons: list[str] = Field(default_factory=lambda: ["all"])
    notes: str = ""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ProfileIn
from ..serialize import dump_profile
from ..services.wardrobe import WardrobeError, get_profile, save_profile

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.get("")
def read_profile(db: Session = Depends(get_db)):
    return dump_profile(get_profile(db))


@router.put("")
def write_profile(data: ProfileIn, db: Session = Depends(get_db)):
    try:
        profile = save_profile(db, data)
    except WardrobeError as exc:
        raise HTTPException(400, str(exc)) from exc
    return dump_profile(profile)

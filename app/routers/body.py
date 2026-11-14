from fastapi import APIRouter, HTTPException

from ..services.body import body_metrics

router = APIRouter(prefix="/api", tags=["body"])


@router.get("/body")
def read_body(height_cm: float = 170, weight_kg: float = 70):
    if not 140 <= height_cm <= 220 or not 35 <= weight_kg <= 180:
        raise HTTPException(422, "Bo'y 140–220 sm, vazn 35–180 kg oralig'ida bo'lsin.")
    return body_metrics(height_cm, weight_kg)

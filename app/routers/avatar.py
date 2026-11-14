from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..services.avatar import AvatarError, read_avatar

router = APIRouter(prefix="/api", tags=["avatar"])


@router.post("/avatar")
async def avatar(files: list[UploadFile] = File(...), hint: str = Form("auto")):
    if hint not in {"auto", "face", "body"}:
        raise HTTPException(422, "Rasm turi noto'g'ri.")
    if not files or len(files) > 4:
        raise HTTPException(422, "1 tadan 4 tagacha rasm yuboring.")
    blobs = []
    for upload in files:
        data = await upload.read()
        if len(data) > 8_000_000:
            raise HTTPException(413, "Rasm 8 MB dan katta.")
        blobs.append(data)
    try:
        return read_avatar(blobs, hint)
    except AvatarError as exc:
        raise HTTPException(422, str(exc)) from exc

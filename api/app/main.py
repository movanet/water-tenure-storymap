"""Tenure engine API: field photos and water tenure records.

All routes carry the literal /api prefix because the reverse proxy forwards
/api/* verbatim to this service. OpenAPI docs live at /api/docs. Tenure
vocab/record/stats/export routes live in tenure.py; photo routes are here.

Privacy defaults: stored images are re-encoded without EXIF metadata, public
photo listings omit the uploader's original file name, and photos linked to
an aggregate_only tenure record are published with fuzzed coordinates.
"""

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import captioning, config, db, imaging, seed, tenure, vocab
from .auth import require_token

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    seed.load_seed_if_empty()
    yield


app = FastAPI(
    title="Water Tenure Storymap API",
    description=(
        "Tenure-record and geotagged field-photo backend for a water tenure "
        "storymap. Reads are public; writes require "
        "`Authorization: Bearer <TENURE_API_TOKEN>`."
    ),
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)

app.include_router(tenure.router)

# Public read access (the map fetches /api/*.geojson). Writes are not
# exposed cross-origin; call them server-side or with curl.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _photo_paths(photo: dict):
    image_path = config.PHOTOS_DIR / f"{photo['id']}{photo['ext']}"
    thumb_path = config.THUMBS_DIR / f"{photo['id']}.jpg"
    return image_path, thumb_path


def _public_position(photo: dict, sensitive_ids: set[str]) -> tuple[float, float, bool]:
    """(lat, lon, fuzzed) for public output.

    A photo linked to an aggregate_only record would otherwise reveal the
    record's true location, so it gets the same deterministic jitter.
    """
    if photo.get("tenure_record_id") in sensitive_ids:
        lat, lon = tenure.fuzz_latlon(photo["id"], photo["lat"], photo["lon"])
        return lat, lon, True
    return photo["lat"], photo["lon"], False


def _serialize(photo: dict, sensitive_ids: set[str] | None = None) -> dict:
    """Photo as JSON. With sensitive_ids (public reads) coordinates may be
    fuzzed and the original file name is withheld; without it (authenticated
    write responses) the stored values are echoed."""
    public = sensitive_ids is not None
    if public:
        lat, lon, fuzzed = _public_position(photo, sensitive_ids)
    else:
        lat, lon, fuzzed = photo["lat"], photo["lon"], False
    data = {
        "id": photo["id"],
        "lat": lat,
        "lon": lon,
        "description": photo["description"],
        "taken_at": photo["taken_at"],
        "uploader": photo["uploader"],
        "content_type": photo["content_type"],
        "size_bytes": photo["size_bytes"],
        "created_at": photo["created_at"],
        "updated_at": photo["updated_at"],
        "tenure_record_id": photo.get("tenure_record_id"),
        "fuzzed": fuzzed,
        "image_url": f"/api/photos/{photo['id']}/image",
        "thumb_url": f"/api/photos/{photo['id']}/thumb",
    }
    if not public:
        data["original_name"] = photo["original_name"]
    return data


def _get_or_404(photo_id: str) -> dict:
    photo = db.get_photo(photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return photo


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "photos": db.count_photos(),
        "tenure_records": db.count_tenure_records(),
        "auth_configured": bool(config.API_TOKEN),
        "captioning_configured": captioning.is_configured(),
        "vision_model": config.VISION_MODEL if captioning.is_configured() else None,
        "vocab_version": vocab.VOCAB.get("version"),
    }


@app.post("/api/photos", status_code=201, dependencies=[Depends(require_token)])
async def upload_photo(
    file: UploadFile = File(..., description="Image file (JPEG, PNG, or WEBP)"),
    lat: float | None = Form(default=None, ge=-90, le=90),
    lon: float | None = Form(default=None, ge=-180, le=180),
    description: str | None = Form(default=None, max_length=5000),
    auto_describe: bool = Form(default=False),
    taken_at: str | None = Form(default=None, max_length=64),
    uploader: str | None = Form(default=None, max_length=200),
):
    """Upload a geotagged photo.

    Coordinates: pass `lat` and `lon` explicitly, or omit both and the API
    reads the EXIF GPS tags. If neither is available the upload fails with 422.
    With `auto_describe=true` and no `description`, an AI vision model
    generates a caption before the photo is stored.
    """
    data = await file.read()
    try:
        fmt, ext, content_type = imaging.validate_image(data)
    except imaging.ImageValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    # Resolve coordinates: explicit form fields first, then EXIF GPS.
    if (lat is None) != (lon is None):
        raise HTTPException(
            status_code=422,
            detail="Provide both lat and lon, or neither (EXIF GPS fallback).",
        )
    if lat is None:
        gps = imaging.extract_exif_gps(data)
        if gps is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No coordinates available: lat/lon fields were not provided "
                    "and the image has no readable EXIF GPS data."
                ),
            )
        lat, lon = gps

    if taken_at is None:
        taken_at = imaging.extract_exif_taken_at(data)

    stored = imaging.strip_metadata(data, fmt) if config.STRIP_EXIF else data

    photo_id = uuid.uuid4().hex
    now = _now()
    record = {
        "id": photo_id,
        "original_name": file.filename,
        "content_type": content_type,
        "ext": ext,
        "lat": lat,
        "lon": lon,
        "description": description,
        "taken_at": taken_at,
        "uploader": uploader,
        "size_bytes": len(stored),
        "created_at": now,
        "updated_at": now,
    }

    image_path = config.PHOTOS_DIR / f"{photo_id}{ext}"
    thumb_path = config.THUMBS_DIR / f"{photo_id}.jpg"
    image_path.write_bytes(stored)
    try:
        imaging.make_thumbnail(image_path, thumb_path)
        if auto_describe and not description:
            # Caption before committing the record; on failure nothing is stored.
            caption = await captioning.generate_caption(
                imaging.encode_for_vision(image_path)
            )
            record["description"] = caption
        db.insert_photo(record)
    except captioning.CaptioningError as exc:
        image_path.unlink(missing_ok=True)
        thumb_path.unlink(missing_ok=True)
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception:
        image_path.unlink(missing_ok=True)
        thumb_path.unlink(missing_ok=True)
        raise

    return _serialize(record)


@app.get("/api/photos")
async def list_photos(limit: int = 500, offset: int = 0):
    """List photos (newest first). Public."""
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    sensitive = db.aggregate_only_record_ids()
    return {
        "count": db.count_photos(),
        "photos": [
            _serialize(p, sensitive) for p in db.list_photos(limit=limit, offset=offset)
        ],
    }


@app.get("/api/photos.geojson")
async def photos_geojson():
    """GeoJSON FeatureCollection of all photos, for the map layer. Public."""
    sensitive = db.aggregate_only_record_ids()
    features = []
    for photo in db.list_photos(limit=10000):
        item = _serialize(photo, sensitive)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [item["lon"], item["lat"]]},
                "properties": {
                    key: item[key]
                    for key in (
                        "id", "description", "taken_at", "uploader", "created_at",
                        "tenure_record_id", "fuzzed", "image_url", "thumb_url",
                    )
                },
            }
        )
    return JSONResponse(
        content={"type": "FeatureCollection", "features": features},
        media_type="application/geo+json",
    )


@app.get("/api/photos/{photo_id}/image")
async def get_image(photo_id: str):
    """Serve the stored image file. Public."""
    photo = _get_or_404(photo_id)
    image_path, _ = _photo_paths(photo)
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image file missing on disk.")
    return FileResponse(image_path, media_type=photo["content_type"])


@app.get("/api/photos/{photo_id}/thumb")
async def get_thumb(photo_id: str):
    """Serve the thumbnail (JPEG, max 400 px). Public."""
    photo = _get_or_404(photo_id)
    image_path, thumb_path = _photo_paths(photo)
    if not thumb_path.is_file():
        # Regenerate lazily if the thumb is missing but the original exists.
        if not image_path.is_file():
            raise HTTPException(status_code=404, detail="Image file missing on disk.")
        imaging.make_thumbnail(image_path, thumb_path)
    return FileResponse(thumb_path, media_type="image/jpeg")


class PhotoUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=5000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    taken_at: str | None = Field(default=None, max_length=64)
    uploader: str | None = Field(default=None, max_length=200)
    tenure_record_id: str | None = Field(default=None, max_length=64)


@app.patch("/api/photos/{photo_id}", dependencies=[Depends(require_token)])
async def patch_photo(photo_id: str, update: PhotoUpdate):
    """Update description, coordinates, taken_at, uploader, and/or the
    linked tenure record (`tenure_record_id`; null unlinks)."""
    _get_or_404(photo_id)
    fields = update.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update.")
    record_id = fields.get("tenure_record_id")
    if record_id is not None and db.get_tenure_record(record_id) is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown tenure_record_id {record_id!r}: no such tenure record.",
        )
    fields["updated_at"] = _now()
    db.update_photo(photo_id, fields)
    return _serialize(db.get_photo(photo_id))


@app.get("/api/tenure-records/{record_id}/photos")
async def list_record_photos(record_id: str):
    """List photos linked to a tenure record. Public."""
    if db.get_tenure_record(record_id) is None:
        raise HTTPException(status_code=404, detail="Tenure record not found.")
    sensitive = db.aggregate_only_record_ids()
    photos = db.photos_for_record(record_id)
    return {"count": len(photos), "photos": [_serialize(p, sensitive) for p in photos]}


@app.post("/api/photos/{photo_id}/describe", dependencies=[Depends(require_token)])
async def describe_photo(photo_id: str):
    """(Re)generate the AI caption for an existing photo."""
    photo = _get_or_404(photo_id)
    image_path, _ = _photo_paths(photo)
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image file missing on disk.")
    try:
        caption = await captioning.generate_caption(imaging.encode_for_vision(image_path))
    except captioning.CaptioningError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    db.update_photo(photo_id, {"description": caption, "updated_at": _now()})
    return _serialize(db.get_photo(photo_id))


@app.delete("/api/photos/{photo_id}", status_code=204, dependencies=[Depends(require_token)])
async def delete_photo(photo_id: str):
    """Delete a photo and its files."""
    photo = _get_or_404(photo_id)
    image_path, thumb_path = _photo_paths(photo)
    db.delete_photo(photo_id)
    image_path.unlink(missing_ok=True)
    thumb_path.unlink(missing_ok=True)
    return None

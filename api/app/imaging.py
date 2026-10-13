"""Image validation, EXIF GPS extraction, and thumbnail generation (Pillow)."""

import base64
import io
from pathlib import Path

from PIL import ExifTags, Image, ImageOps

from . import config

# GPS IFD tag ids (EXIF spec)
_GPS_LAT_REF = 1
_GPS_LAT = 2
_GPS_LON_REF = 3
_GPS_LON = 4
# EXIF IFD tag id for DateTimeOriginal
_DATETIME_ORIGINAL = 0x9003


class ImageValidationError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def validate_image(data: bytes) -> tuple[str, str, str]:
    """Validate uploaded bytes; return (format, ext, content_type).

    Raises ImageValidationError on oversize or unsupported/corrupt images.
    """
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise ImageValidationError(
            413,
            f"File too large ({len(data)} bytes). Limit is {config.MAX_UPLOAD_BYTES} bytes.",
        )
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            fmt = img.format
    except Exception:
        raise ImageValidationError(415, "File is not a readable image.")
    if fmt not in config.ALLOWED_FORMATS:
        raise ImageValidationError(
            415,
            f"Unsupported image format {fmt!r}. Allowed: JPEG, PNG, WEBP.",
        )
    ext, content_type = config.ALLOWED_FORMATS[fmt]
    return fmt, ext, content_type


def _dms_to_decimal(values, ref: str | None, negative_refs: tuple[str, ...]) -> float | None:
    try:
        parts = [float(v) for v in values]
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    if not parts:
        return None
    while len(parts) < 3:
        parts.append(0.0)
    degrees = parts[0] + parts[1] / 60.0 + parts[2] / 3600.0
    if ref and str(ref).strip().upper() in negative_refs:
        degrees = -degrees
    return degrees


def extract_exif_gps(data: bytes) -> tuple[float, float] | None:
    """Return (lat, lon) from EXIF GPS tags, or None if absent/unparseable."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            exif = img.getexif()
            gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    except Exception:
        return None
    if not gps:
        return None
    lat = _dms_to_decimal(gps.get(_GPS_LAT), gps.get(_GPS_LAT_REF), ("S",))
    lon = _dms_to_decimal(gps.get(_GPS_LON), gps.get(_GPS_LON_REF), ("W",))
    if lat is None or lon is None:
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    return lat, lon


def extract_exif_taken_at(data: bytes) -> str | None:
    """Return DateTimeOriginal as ISO-ish string ('YYYY-MM-DDTHH:MM:SS') or None."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            exif = img.getexif()
            exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
            raw = exif_ifd.get(_DATETIME_ORIGINAL)
    except Exception:
        return None
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    # EXIF format: "YYYY:MM:DD HH:MM:SS"
    if len(raw) >= 19 and raw[4] == ":" and raw[7] == ":":
        return raw[:10].replace(":", "-") + "T" + raw[11:19]
    return raw or None


def strip_metadata(data: bytes, fmt: str) -> bytes:
    """Re-encode an image without EXIF/XMP metadata (GPS, camera, owner).

    The EXIF orientation is applied to the pixels first so the stripped
    image still displays upright. Returns the original bytes unchanged if
    the image cannot be re-encoded.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            buf = io.BytesIO()
            if fmt == "JPEG":
                img.convert("RGB").save(buf, format="JPEG", quality=92)
            elif fmt == "PNG":
                img.save(buf, format="PNG")
            elif fmt == "WEBP":
                img.save(buf, format="WEBP", quality=92)
            else:
                return data
            return buf.getvalue()
    except Exception:
        return data


def make_thumbnail(src_path: Path, dst_path: Path) -> None:
    """Write a JPEG thumbnail with the longest side at most THUMB_MAX_PX."""
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((config.THUMB_MAX_PX, config.THUMB_MAX_PX))
        img.save(dst_path, format="JPEG", quality=82)


def encode_for_vision(src_path: Path) -> str:
    """Return base64 JPEG (longest side <= VISION_MAX_PX) for the vision model."""
    with Image.open(src_path) as img:
        img = img.convert("RGB")
        img.thumbnail((config.VISION_MAX_PX, config.VISION_MAX_PX))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")

"""Tenure-record endpoints: vocab, CRUD, geojson, stats, and export.

Sensitivity rule: records with sensitivity=aggregate_only are emitted on
public reads with deterministically fuzzed geometry (jitter of roughly 1 km,
seeded by the record id so it is stable across requests) and `fuzzed: true`
in properties. Their true coordinates are never emitted publicly; for
aggregate_only polygons even the shape is withheld and a fuzzed centroid
point is emitted instead. Authenticated write responses (POST/PATCH) echo
the geometry the caller submitted.
"""

import csv
import hashlib
import io
import json
import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from . import config, db, vocab
from .auth import require_token

router = APIRouter()

_CACHE_HEADERS = {"Cache-Control": "public, max-age=3600"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- Geometry ----------------------------------------------------------------

def _valid_position(pos) -> bool:
    return (
        isinstance(pos, (list, tuple))
        and len(pos) >= 2
        and all(
            isinstance(c, (int, float)) and not isinstance(c, bool) for c in pos[:2]
        )
        and -180.0 <= pos[0] <= 180.0
        and -90.0 <= pos[1] <= 90.0
    )


def validate_geometry(geometry) -> tuple[dict | None, float, float, list[str]]:
    """Validate a GeoJSON Point or Polygon.

    Returns (geometry, lat, lon, errors); lat/lon are the point coordinates
    (or the polygon's exterior-ring centroid) used for bbox filtering.
    """
    if not isinstance(geometry, dict):
        return None, 0.0, 0.0, ["geometry must be a GeoJSON Point or Polygon object."]
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Point":
        if not _valid_position(coords):
            return None, 0.0, 0.0, [
                "Point coordinates must be [lon, lat] with lon in -180..180 and lat in -90..90."
            ]
        lon, lat = float(coords[0]), float(coords[1])
        return {"type": "Point", "coordinates": [lon, lat]}, lat, lon, []
    if gtype == "Polygon":
        if (
            not isinstance(coords, list)
            or not coords
            or not all(
                isinstance(ring, list)
                and len(ring) >= 4
                and all(_valid_position(p) for p in ring)
                for ring in coords
            )
        ):
            return None, 0.0, 0.0, [
                "Polygon coordinates must be an array of linear rings, each with "
                "at least 4 [lon, lat] positions."
            ]
        clean = [[[float(p[0]), float(p[1])] for p in ring] for ring in coords]
        exterior = clean[0]
        # Drop the closing duplicate before averaging.
        vertices = exterior[:-1] if exterior[0] == exterior[-1] else exterior
        lon = sum(p[0] for p in vertices) / len(vertices)
        lat = sum(p[1] for p in vertices) / len(vertices)
        return {"type": "Polygon", "coordinates": clean}, lat, lon, []
    return None, 0.0, 0.0, [
        f"Unsupported geometry type {gtype!r}. Allowed: Point, Polygon."
    ]


def fuzz_latlon(seed_id: str, lat: float, lon: float) -> tuple[float, float]:
    """Deterministic jitter of FUZZ_MIN..FUZZ_MAX metres, seeded by an id.

    The same id always yields the same displacement, so a fuzzed position
    is stable across requests and cannot be averaged out by re-querying.
    """
    digest = hashlib.sha256(seed_id.encode("utf-8")).digest()
    u1 = int.from_bytes(digest[:8], "big") / 2**64
    u2 = int.from_bytes(digest[8:16], "big") / 2**64
    radius = max(config.FUZZ_MIN_METERS, config.FUZZ_MAX_METERS * math.sqrt(u1))
    bearing = 2.0 * math.pi * u2
    dlat = radius * math.cos(bearing) / 111_320.0
    dlon = radius * math.sin(bearing) / (
        111_320.0 * max(math.cos(math.radians(lat)), 0.01)
    )
    return round(lat + dlat, 6), round(lon + dlon, 6)


def _public_latlon(row: dict) -> tuple[float, float]:
    """The position a public reader may learn: fuzzed for aggregate_only rows.

    Filters (bbox) use this too, so repeated bbox queries cannot be used to
    narrow down a sensitive record's true location.
    """
    if row["sensitivity"] == "aggregate_only":
        return fuzz_latlon(row["id"], row["lat"], row["lon"])
    return row["lat"], row["lon"]


# --- Serialization -----------------------------------------------------------

def _security_out(value: str | None):
    if value is not None and value.isdigit():
        return int(value)
    return value


def _feature(row: dict, photo_ids: list[str], public: bool = True) -> dict:
    """Serialize a tenure_records row as a GeoJSON Feature.

    With public=True (all read endpoints) aggregate_only records get fuzzed
    geometry; public=False is reserved for authenticated write responses.
    """
    fuzzed = False
    if public and row["sensitivity"] == "aggregate_only":
        lat, lon = fuzz_latlon(row["id"], row["lat"], row["lon"])
        geometry = {"type": "Point", "coordinates": [lon, lat]}
        fuzzed = True
    else:
        geometry = json.loads(row["geometry"])
    seasons = json.loads(row["season_relevance"]) if row["season_relevance"] else None
    properties = {
        "id": row["id"],
        "title": row["title"],
        "tenure_type": row["tenure_type"],
        "use_type": row["use_type"],
        "village": row["village"],
        "legal_security": _security_out(row["legal_security"]),
        "perceived_security": _security_out(row["perceived_security"]),
        "actor_group": row["actor_group"],
        "di_scheme": row["di_scheme"],
        "season_relevance": seasons,
        "confidence": row.get("confidence"),
        "description": row["description"],
        "source": row["source"],
        "narrative_ref": row["narrative_ref"],
        "quote_ref": row["quote_ref"],
        "sensitivity": row["sensitivity"],
        "photos": photo_ids,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "fuzzed": fuzzed,
    }
    return {"type": "Feature", "id": row["id"], "geometry": geometry, "properties": properties}


def build_record_row(
    record_id: str, norm: dict, geometry: dict, lat: float, lon: float, now: str
) -> dict:
    """Database row for a new record from validated, normalized properties."""
    seasons = norm.get("season_relevance")
    return {
        "id": record_id,
        "title": norm["title"],
        "tenure_type": norm["tenure_type"],
        "use_type": norm["use_type"],
        "village": norm["village"],
        "legal_security": norm.get("legal_security"),
        "perceived_security": norm.get("perceived_security"),
        "actor_group": norm.get("actor_group"),
        "di_scheme": norm.get("di_scheme"),
        "season_relevance": json.dumps(seasons) if seasons else None,
        "confidence": norm.get("confidence"),
        "description": norm.get("description"),
        "source": norm.get("source"),
        "narrative_ref": norm.get("narrative_ref"),
        "quote_ref": norm.get("quote_ref"),
        "sensitivity": norm["sensitivity"],
        "geometry": json.dumps(geometry),
        "lat": lat,
        "lon": lon,
        "created_at": now,
        "updated_at": now,
    }


# --- Filtering ---------------------------------------------------------------

def _multi(param: str | None) -> set[str] | None:
    """Parse a comma-separated multi-value query parameter."""
    if param is None:
        return None
    values = {v.strip() for v in param.split(",") if v.strip()}
    return values or None


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float] | None:
    if bbox is None:
        return None
    parts = [p.strip() for p in bbox.split(",")]
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="bbox must be four comma-separated numbers: min_lon,min_lat,max_lon,max_lat.",
        )
    return min_lon, min_lat, max_lon, max_lat


def record_filters(
    tenure_type: str | None = None,
    use_type: str | None = None,
    legal_security: str | None = None,
    perceived_security: str | None = None,
    village: str | None = None,
    di_scheme: str | None = None,
    season: str | None = None,
    confidence: str | None = None,
    bbox: str | None = None,
) -> dict:
    """Shared query parameters of the record, geojson and stats routes."""
    return {
        "tenure_type": tenure_type,
        "use_type": use_type,
        "legal_security": legal_security,
        "perceived_security": perceived_security,
        "village": village,
        "di_scheme": di_scheme,
        "season": season,
        "confidence": confidence,
        "bbox": bbox,
    }


def _filtered_rows(
    tenure_type: str | None = None,
    use_type: str | None = None,
    legal_security: str | None = None,
    perceived_security: str | None = None,
    village: str | None = None,
    di_scheme: str | None = None,
    season: str | None = None,
    confidence: str | None = None,
    bbox: str | None = None,
) -> list[dict]:
    """Apply the shared multi-value filters + bbox to all tenure records."""
    exact = {
        "tenure_type": _multi(tenure_type),
        "use_type": _multi(use_type),
        "legal_security": _multi(legal_security),
        "perceived_security": _multi(perceived_security),
        "di_scheme": _multi(di_scheme),
        "confidence": _multi(confidence),
    }
    villages = _multi(village)
    villages_lower = {v.lower() for v in villages} if villages else None
    seasons = _multi(season)
    box = _parse_bbox(bbox)

    rows = []
    for row in db.list_tenure_records():
        if any(
            wanted and (row[column] or "") not in wanted
            for column, wanted in exact.items()
        ):
            continue
        if villages_lower and row["village"].lower() not in villages_lower:
            continue
        if seasons:
            row_seasons = json.loads(row["season_relevance"]) if row["season_relevance"] else []
            if not seasons.intersection(row_seasons):
                continue
        if box:
            min_lon, min_lat, max_lon, max_lat = box
            lat, lon = _public_latlon(row)
            if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
                continue
        rows.append(row)
    return rows


# --- Vocab endpoints ----------------------------------------------------------

@router.get("/api/vocab/tenure-types")
async def vocab_tenure_types():
    """The tenure vocabulary file in use (VOCAB_PATH), verbatim. Public, cacheable."""
    return FileResponse(
        config.VOCAB_PATH, media_type="application/json", headers=_CACHE_HEADERS
    )


@router.get("/api/vocab/fao-framework")
async def vocab_fao_framework():
    """FAO framework rows derived from the vocabulary, with analyzed/maps_to flags."""
    return JSONResponse(content=vocab.framework_rows(), headers=_CACHE_HEADERS)


# --- CRUD ----------------------------------------------------------------------

class TenureFeatureIn(BaseModel):
    type: str = "Feature"
    geometry: dict
    properties: dict


class TenureRecordPatch(BaseModel):
    geometry: dict | None = None
    properties: dict | None = None


def _get_record_or_404(record_id: str) -> dict:
    record = db.get_tenure_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Tenure record not found.")
    return record


def _check_photo_ids(photo_ids: list[str]) -> list[str]:
    return [
        f"Unknown photo id {pid!r} in photos."
        for pid in photo_ids
        if db.get_photo(pid) is None
    ]


@router.post(
    "/api/tenure-records", status_code=201, dependencies=[Depends(require_token)]
)
async def create_tenure_record(feature: TenureFeatureIn):
    """Create a tenure record from a GeoJSON Feature (Point or Polygon).

    Property values are validated against the tenure vocabulary; unknown
    values fail with 422 and a message listing the allowed values.
    """
    geometry, lat, lon, errors = validate_geometry(feature.geometry)
    norm, prop_errors = vocab.validate_properties(feature.properties)
    errors = errors + prop_errors
    photo_ids = norm.pop("photos", None) or []
    if not errors:
        errors.extend(_check_photo_ids(photo_ids))
    if errors:
        raise HTTPException(status_code=422, detail=errors)

    record_id = uuid.uuid4().hex
    now = _now()
    record = build_record_row(record_id, norm, geometry, lat, lon, now)
    db.insert_tenure_record(record)
    if photo_ids:
        db.set_record_photos(record_id, photo_ids, now)
    return _feature(db.get_tenure_record(record_id), photo_ids, public=False)


@router.get("/api/tenure-records")
async def list_tenure_records(filters: dict = Depends(record_filters)):
    """List tenure records as GeoJSON Features (JSON envelope). Public.

    All filters accept comma-separated multi-values; bbox is
    min_lon,min_lat,max_lon,max_lat. aggregate_only records carry fuzzed
    geometry (see module docstring).
    """
    rows = _filtered_rows(**filters)
    photo_map = db.photo_ids_by_record()
    return {
        "count": len(rows),
        "records": [_feature(r, photo_map.get(r["id"], [])) for r in rows],
    }


@router.get("/api/tenure-records.geojson")
async def tenure_records_geojson(filters: dict = Depends(record_filters)):
    """GeoJSON FeatureCollection of tenure records, for the map layer. Public."""
    rows = _filtered_rows(**filters)
    photo_map = db.photo_ids_by_record()
    return JSONResponse(
        content={
            "type": "FeatureCollection",
            "features": [_feature(r, photo_map.get(r["id"], [])) for r in rows],
        },
        media_type="application/geo+json",
    )


@router.patch(
    "/api/tenure-records/{record_id}", dependencies=[Depends(require_token)]
)
async def patch_tenure_record(record_id: str, update: TenureRecordPatch):
    """Update geometry and/or a subset of properties (vocab-validated)."""
    _get_record_or_404(record_id)
    if update.geometry is None and update.properties is None:
        raise HTTPException(status_code=422, detail="No fields to update.")

    errors: list[str] = []
    fields: dict = {}
    photo_ids: list[str] | None = None

    if update.geometry is not None:
        geometry, lat, lon, errors = validate_geometry(update.geometry)
        if not errors:
            fields.update(geometry=json.dumps(geometry), lat=lat, lon=lon)

    if update.properties is not None:
        norm, prop_errors = vocab.validate_properties(update.properties, partial=True)
        errors = errors + prop_errors
        photo_ids = norm.pop("photos", None)
        if not prop_errors and photo_ids is not None:
            errors.extend(_check_photo_ids(photo_ids))
        if "season_relevance" in norm:
            seasons = norm.pop("season_relevance")
            fields["season_relevance"] = json.dumps(seasons) if seasons else None
        fields.update(norm)

    if errors:
        raise HTTPException(status_code=422, detail=errors)

    now = _now()
    fields["updated_at"] = now
    db.update_tenure_record(record_id, fields)
    if photo_ids is not None:
        db.set_record_photos(record_id, photo_ids, now)
    row = db.get_tenure_record(record_id)
    return _feature(row, db.photo_ids_by_record().get(record_id, []), public=False)


@router.delete(
    "/api/tenure-records/{record_id}",
    status_code=204,
    dependencies=[Depends(require_token)],
)
async def delete_tenure_record(record_id: str):
    """Delete a tenure record; linked photos are kept and unlinked."""
    _get_record_or_404(record_id)
    db.delete_tenure_record(record_id)
    return None


# --- Stats and export -----------------------------------------------------------

@router.get("/api/stats/typology")
async def stats_typology(filters: dict = Depends(record_filters)):
    """Typology counts honoring the same filters as the record routes. Public."""
    rows = _filtered_rows(**filters)

    def tally(key: str) -> dict:
        counts: dict = {}
        for row in rows:
            value = row[key]
            if key in ("legal_security", "perceived_security"):
                value = "unspecified" if value is None else str(_security_out(value))
            elif value is None:
                value = "unspecified"
            counts[value] = counts.get(value, 0) + 1
        return dict(sorted(counts.items()))

    return {
        "by_tenure_type": tally("tenure_type"),
        "by_use_type": tally("use_type"),
        "by_legal_security": tally("legal_security"),
        "by_perceived_security": tally("perceived_security"),
        "by_village": tally("village"),
        "by_di_scheme": tally("di_scheme"),
        "by_confidence": tally("confidence"),
        "total": len(rows),
    }


_CSV_COLUMNS = (
    "id", "title", "tenure_type", "use_type", "village", "legal_security",
    "perceived_security", "actor_group", "di_scheme", "season_relevance",
    "confidence", "description", "source", "narrative_ref", "quote_ref",
    "sensitivity", "lat", "lon", "created_at", "updated_at",
)


@router.get("/api/export")
async def export_records(format: str):
    """Export public-sensitivity records as GeoJSON or CSV. Public."""
    if format not in ("geojson", "csv"):
        raise HTTPException(
            status_code=422, detail="format must be 'geojson' or 'csv'."
        )
    rows = [r for r in db.list_tenure_records() if r["sensitivity"] == "public"]
    photo_map = db.photo_ids_by_record()

    if format == "geojson":
        return JSONResponse(
            content={
                "type": "FeatureCollection",
                "metadata": {
                    "attribution": config.DATA_ATTRIBUTION,
                    "description": config.EXPORT_DESCRIPTION,
                    "generated_at": _now(),
                },
                "features": [_feature(r, photo_map.get(r["id"], [])) for r in rows],
            },
            media_type="application/geo+json",
            headers={"Content-Disposition": 'attachment; filename="tenure-records.geojson"'},
        )

    buffer = io.StringIO()
    buffer.write(f"# {config.DATA_ATTRIBUTION} - public tenure records, generated {_now()}\n")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(_CSV_COLUMNS)
    for row in rows:
        seasons = json.loads(row["season_relevance"]) if row["season_relevance"] else []
        values = []
        for column in _CSV_COLUMNS:
            if column == "season_relevance":
                values.append("|".join(seasons))
            elif column in ("legal_security", "perceived_security"):
                values.append(_security_out(row[column]))
            else:
                values.append(row[column])
        writer.writerow(values)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tenure-records.csv"'},
    )

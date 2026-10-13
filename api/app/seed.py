"""Idempotent seed loading for tenure records.

Two sources, both loaded at most once and only while the tenure_records
table is empty (so later edits and deletions are never overwritten):

- SEED_FILE=/path/records.geojson: your own FeatureCollection, for example
  the output of tools/import_catalogue.py. Takes precedence.
- SEED_SAMPLE=true: the bundled synthetic sample
  (app/data/sample_tenure_records.geojson), set in a fictional basin.

Each feature needs a stable `id`; features that fail geometry or vocabulary
validation are skipped and reported in the log, not loaded half-valid.
"""

import json
import logging
from pathlib import Path

from . import config, db, vocab
from .tenure import build_record_row, validate_geometry

logger = logging.getLogger(__name__)

SEED_TIMESTAMP = "2026-01-01T00:00:00Z"


def seed_path() -> Path | None:
    """The FeatureCollection to seed from, or None when seeding is off."""
    if config.SEED_FILE:
        return Path(config.SEED_FILE)
    if config.SEED_SAMPLE:
        return config.SAMPLE_RECORDS_PATH
    return None


def load_features(path: Path) -> tuple[int, list[str]]:
    """Insert valid features from a FeatureCollection. Returns (added, problems)."""
    collection = json.loads(path.read_text(encoding="utf-8"))
    loaded = 0
    problems: list[str] = []
    for index, feature in enumerate(collection.get("features", [])):
        record_id = feature.get("id") or (feature.get("properties") or {}).get("id")
        if not record_id:
            problems.append(f"feature {index}: missing id")
            continue
        if db.get_tenure_record(str(record_id)) is not None:
            problems.append(f"{record_id}: duplicate id, skipped")
            continue
        geometry, lat, lon, geom_errors = validate_geometry(feature.get("geometry"))
        norm, prop_errors = vocab.validate_properties(feature.get("properties") or {})
        if geom_errors or prop_errors:
            problems.append(f"{record_id}: {'; '.join(geom_errors + prop_errors)}")
            continue
        norm.pop("photos", None)
        db.insert_tenure_record(
            build_record_row(str(record_id), norm, geometry, lat, lon, SEED_TIMESTAMP)
        )
        loaded += 1
    return loaded, problems


def load_seed_if_empty() -> int:
    """Seed the records table when it is empty and seeding is configured."""
    path = seed_path()
    if path is None or db.count_tenure_records() > 0:
        return 0
    if not path.is_file():
        logger.warning("Seed file %s not found; nothing seeded.", path)
        return 0
    loaded, problems = load_features(path)
    for problem in problems:
        logger.warning("Seed: %s", problem)
    logger.info("Seeded %d tenure records from %s", loaded, path)
    return loaded

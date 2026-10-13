"""Configuration from environment variables. No secrets are ever hardcoded here.

Every setting has a safe default so the API starts with no configuration at
all: reads work, writes are refused (no token), captioning is off (no key),
and nothing is seeded unless SEED_SAMPLE or SEED_FILE is set.
"""

import os
from pathlib import Path


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


# --- Storage (volume-mounted at /data in the container) ----------------------
DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
PHOTOS_DIR = DATA_DIR / "photos"
THUMBS_DIR = DATA_DIR / "thumbs"
DB_PATH = Path(os.environ.get("DB_PATH", str(DATA_DIR / "tenure.db")))

# --- Auth: bearer token required for all write operations. Reads are public.
API_TOKEN = os.environ.get("TENURE_API_TOKEN", "")

# --- Optional AI captioning through any OpenAI-compatible chat endpoint ------
# Captioning is OFF unless VISION_API_KEY is set. For a local server that
# needs no key (e.g. Ollama, vLLM), set VISION_API_KEY to any placeholder.
VISION_API_KEY = os.environ.get("VISION_API_KEY", "")
VISION_API_URL = os.environ.get(
    "VISION_API_URL", "https://api.openai.com/v1/chat/completions"
)
VISION_MODEL = os.environ.get("VISION_MODEL", "gpt-4o-mini")
VISION_PROMPT = os.environ.get(
    "VISION_PROMPT",
    "This photo was taken during fieldwork on water use and water infrastructure "
    "(for example irrigation canals, gates, wells, pumps, pipes, rivers, fields, "
    "community water systems). Write a factual English caption of 1-2 sentences "
    "describing only what is visible in the image. Do not identify people. "
    "No speculation, no preamble, no quotation marks - return the caption text only.",
)

# --- Upload validation and image processing ---------------------------------
MAX_UPLOAD_BYTES = int(_env_float("MAX_UPLOAD_MB", 15) * 1024 * 1024)
ALLOWED_FORMATS = {
    "JPEG": (".jpg", "image/jpeg"),
    "PNG": (".png", "image/png"),
    "WEBP": (".webp", "image/webp"),
}
THUMB_MAX_PX = 400
VISION_MAX_PX = 1024
# Re-encode stored images without EXIF/XMP metadata (GPS, camera serial,
# owner name). Coordinates are read before stripping. Default on.
STRIP_EXIF = _env_bool("STRIP_EXIF", True)

# --- Vocabulary and seed data -------------------------------------------------
APP_DATA_DIR = Path(__file__).resolve().parent / "data"
VOCAB_PATH = Path(os.environ.get("VOCAB_PATH", str(APP_DATA_DIR / "tenure_vocab.json")))
SAMPLE_RECORDS_PATH = APP_DATA_DIR / "sample_tenure_records.geojson"
# SEED_FILE: a GeoJSON FeatureCollection (for example the output of
# tools/import_catalogue.py) loaded once when the records table is empty.
# SEED_SAMPLE=true loads the bundled synthetic sample instead.
SEED_FILE = os.environ.get("SEED_FILE", "")
SEED_SAMPLE = _env_bool("SEED_SAMPLE", False)

# --- Public-facing metadata -----------------------------------------------------
DATA_ATTRIBUTION = os.environ.get("DATA_ATTRIBUTION", "Water Tenure Storymap deployment")
EXPORT_DESCRIPTION = os.environ.get(
    "EXPORT_DESCRIPTION", "Public-sensitivity water tenure records."
)
CORS_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()
]

# --- Sensitivity fuzzing: deterministic jitter applied on public reads to
# aggregate_only records (and photos linked to them), seeded by the id so the
# displaced position is stable across requests and restarts.
FUZZ_MIN_METERS = _env_float("FUZZ_MIN_METERS", 250.0)
FUZZ_MAX_METERS = _env_float("FUZZ_MAX_METERS", 1000.0)

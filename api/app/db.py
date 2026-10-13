"""SQLite storage for photo metadata and tenure records."""

import sqlite3

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS photos (
    id               TEXT PRIMARY KEY,
    original_name    TEXT,
    content_type     TEXT NOT NULL,
    ext              TEXT NOT NULL,
    lat              REAL NOT NULL,
    lon              REAL NOT NULL,
    description      TEXT,
    taken_at         TEXT,
    uploader         TEXT,
    size_bytes       INTEGER NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    tenure_record_id TEXT
);

CREATE TABLE IF NOT EXISTS tenure_records (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    tenure_type        TEXT NOT NULL,
    use_type           TEXT NOT NULL,
    village            TEXT NOT NULL,
    legal_security     TEXT,
    perceived_security TEXT,
    actor_group        TEXT,
    di_scheme          TEXT,
    season_relevance   TEXT,
    confidence         TEXT,
    description        TEXT,
    source             TEXT,
    narrative_ref      TEXT,
    quote_ref          TEXT,
    sensitivity        TEXT NOT NULL DEFAULT 'public',
    geometry           TEXT NOT NULL,
    lat                REAL NOT NULL,
    lon                REAL NOT NULL,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);
"""

# Columns added after the first schema version: (table, column, DDL type).
# init_db() adds any that are missing, so older databases upgrade in place.
_MIGRATIONS = (
    ("photos", "tenure_record_id", "TEXT"),
    ("tenure_records", "confidence", "TEXT"),
)


def init_db() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    config.THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        for table, column, ddl_type in _MIGRATIONS:
            cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
            if column not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
        conn.commit()
    finally:
        conn.close()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    conn = get_conn()
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def _fetch_one(sql: str, params: tuple = ()) -> dict | None:
    conn = get_conn()
    try:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _execute(sql: str, params=()) -> None:
    conn = get_conn()
    try:
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()


def _count(table: str) -> int:
    conn = get_conn()
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


# --- Photos ------------------------------------------------------------------

def insert_photo(record: dict) -> None:
    _execute(
        """INSERT INTO photos
           (id, original_name, content_type, ext, lat, lon, description,
            taken_at, uploader, size_bytes, created_at, updated_at)
           VALUES (:id, :original_name, :content_type, :ext, :lat, :lon,
                   :description, :taken_at, :uploader, :size_bytes,
                   :created_at, :updated_at)""",
        record,
    )


def get_photo(photo_id: str) -> dict | None:
    return _fetch_one("SELECT * FROM photos WHERE id = ?", (photo_id,))


def list_photos(limit: int = 500, offset: int = 0) -> list[dict]:
    return _fetch_all(
        "SELECT * FROM photos ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )


def count_photos() -> int:
    return _count("photos")


def update_photo(photo_id: str, fields: dict) -> None:
    if not fields:
        return
    assignments = ", ".join(f"{k} = :{k}" for k in fields)
    _execute(f"UPDATE photos SET {assignments} WHERE id = :id", dict(fields, id=photo_id))


def delete_photo(photo_id: str) -> None:
    _execute("DELETE FROM photos WHERE id = ?", (photo_id,))


def photos_for_record(record_id: str) -> list[dict]:
    return _fetch_all(
        "SELECT * FROM photos WHERE tenure_record_id = ? ORDER BY created_at DESC",
        (record_id,),
    )


# --- Tenure records ------------------------------------------------------------

TENURE_COLUMNS = (
    "id", "title", "tenure_type", "use_type", "village", "legal_security",
    "perceived_security", "actor_group", "di_scheme", "season_relevance",
    "confidence", "description", "source", "narrative_ref", "quote_ref",
    "sensitivity", "geometry", "lat", "lon", "created_at", "updated_at",
)


def insert_tenure_record(record: dict) -> None:
    columns = ", ".join(TENURE_COLUMNS)
    placeholders = ", ".join(f":{c}" for c in TENURE_COLUMNS)
    _execute(f"INSERT INTO tenure_records ({columns}) VALUES ({placeholders})", record)


def get_tenure_record(record_id: str) -> dict | None:
    return _fetch_one("SELECT * FROM tenure_records WHERE id = ?", (record_id,))


def list_tenure_records() -> list[dict]:
    return _fetch_all("SELECT * FROM tenure_records ORDER BY created_at DESC, id")


def count_tenure_records() -> int:
    return _count("tenure_records")


def update_tenure_record(record_id: str, fields: dict) -> None:
    if not fields:
        return
    assignments = ", ".join(f"{k} = :{k}" for k in fields)
    _execute(
        f"UPDATE tenure_records SET {assignments} WHERE id = :id",
        dict(fields, id=record_id),
    )


def delete_tenure_record(record_id: str) -> None:
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE photos SET tenure_record_id = NULL WHERE tenure_record_id = ?",
            (record_id,),
        )
        conn.execute("DELETE FROM tenure_records WHERE id = ?", (record_id,))
        conn.commit()
    finally:
        conn.close()


def aggregate_only_record_ids() -> set[str]:
    """Ids of records whose true location must not be published."""
    rows = _fetch_all(
        "SELECT id FROM tenure_records WHERE sensitivity = 'aggregate_only'"
    )
    return {r["id"] for r in rows}


def photo_ids_by_record() -> dict[str, list[str]]:
    """Map tenure_record_id -> [photo ids], for batch serialization."""
    rows = _fetch_all(
        "SELECT id, tenure_record_id FROM photos "
        "WHERE tenure_record_id IS NOT NULL ORDER BY created_at DESC"
    )
    result: dict[str, list[str]] = {}
    for row in rows:
        result.setdefault(row["tenure_record_id"], []).append(row["id"])
    return result


def set_record_photos(record_id: str, photo_ids: list[str], now: str) -> None:
    """Make photo_ids the exact set of photos linked to record_id."""
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE photos SET tenure_record_id = NULL, updated_at = ? "
            "WHERE tenure_record_id = ?",
            (now, record_id),
        )
        for photo_id in photo_ids:
            conn.execute(
                "UPDATE photos SET tenure_record_id = ?, updated_at = ? WHERE id = ?",
                (record_id, now, photo_id),
            )
        conn.commit()
    finally:
        conn.close()

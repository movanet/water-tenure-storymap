"""Vocabulary loading and tenure-record property validation.

`tenure_vocab.json` is the single source of truth for the tenure types (the
FAO water tenure typology plus any local additions) and the controlled lists
(use types, actor groups, irrigation schemes, seasons, confidence levels,
security scale, sensitivity levels). It ships with the application and can be
replaced per deployment with the VOCAB_PATH environment variable. It is loaded
once at import time; restart the API after editing it.
"""

import json

from . import config

VOCAB = json.loads(config.VOCAB_PATH.read_text(encoding="utf-8"))


def _ids(items) -> list[str]:
    """Controlled lists may be plain strings or objects with an `id`."""
    return [item["id"] if isinstance(item, dict) else str(item) for item in items]


TENURE_TYPES = {t["id"]: t for t in VOCAB["tenure_types"]}
USE_TYPE_IDS = _ids(VOCAB["use_types"])
ACTOR_GROUPS = _ids(VOCAB.get("actor_groups", []))
DI_SCHEMES = _ids(VOCAB.get("di_schemes", []))
SEASONS = _ids(VOCAB.get("seasons", []))
CONFIDENCE_LEVELS = _ids(VOCAB.get("confidence_levels", []))
SENSITIVITY_LEVELS = _ids(VOCAB.get("sensitivity_levels", ["public", "aggregate_only"]))

LEGAL_SECURITY_VALUES = ("1", "2", "3", "4", "NA")
PERCEIVED_SECURITY_VALUES = ("1", "2", "3", "4", "NR", "NA")

REQUIRED_KEYS = ("tenure_type", "use_type", "village", "title")
OPTIONAL_KEYS = (
    "legal_security", "perceived_security", "actor_group", "di_scheme",
    "season_relevance", "confidence", "description", "source", "narrative_ref",
    "quote_ref", "sensitivity", "photos",
)
# Server-managed keys, silently ignored when present in input.
SERVER_KEYS = ("id", "created_at", "updated_at", "fuzzed")

_TEXT_KEYS = ("description", "source", "narrative_ref", "quote_ref")


def framework_rows() -> dict:
    """The FAO framework view of the vocabulary, for /api/vocab/fao-framework.

    One row per tenure type, keyed by its FAO guide key where it has one,
    with the `analyzed` flag of the current deployment and `maps_to` (the
    vocabulary id records use).
    """
    rows = []
    for t in VOCAB["tenure_types"]:
        rows.append(
            {
                "id": t.get("fao_key") or t["id"],
                "name": t.get("fao_name") or t.get("label", t["id"]),
                "family": t.get("family"),
                "category": t.get("category"),
                "description": t.get("definition"),
                "analyzed": bool(t.get("analyzed")),
                "maps_to": t["id"],
            }
        )
    return {
        "version": VOCAB.get("version"),
        "title": "FAO water tenure framework",
        "source": VOCAB.get("source"),
        "rows": rows,
    }


def _normalize_security(value, allowed: tuple, field: str):
    """Return (normalized string, error). Accepts ints 1-4 or the NA/NR codes."""
    text = str(value).strip()
    if text in allowed:
        return text, None
    return None, f"Invalid {field} {value!r}. Allowed: {', '.join(allowed)}."


def _default_security(tenure_type: dict, key: str, allowed: tuple) -> str | None:
    """Vocab default for a security field, only when it is itself a valid value.

    A vocab entry may carry a prose rating (e.g. "2 at the head end / 4 at
    the tail end") that is not a valid stored value; such a rating defaults
    to None on records and the prose stays in the vocab for display.
    """
    default = str(tenure_type.get(key, "")).strip()
    return default if default in allowed else None


def validate_properties(props, partial: bool = False) -> tuple[dict, list[str]]:
    """Validate and normalize record properties against the vocabulary.

    Returns (normalized, errors). With partial=False (POST) the required keys
    must be present and vocab defaults are applied; with partial=True (PATCH)
    only the provided keys are validated, and optional keys given as null are
    normalized to None (clearing the field).
    """
    if not isinstance(props, dict):
        return {}, ["properties must be a JSON object."]

    errors: list[str] = []
    norm: dict = {}

    known = REQUIRED_KEYS + OPTIONAL_KEYS + SERVER_KEYS
    unknown = sorted(k for k in props if k not in known)
    if unknown:
        errors.append(
            f"Unknown properties: {', '.join(unknown)}. "
            f"Known properties: {', '.join(REQUIRED_KEYS + OPTIONAL_KEYS)}."
        )

    def provided(key: str) -> bool:
        return key in props and props[key] is not None

    def null_clears(key: str) -> bool:
        """In partial mode an explicit null clears an optional field."""
        if partial and key in props and props[key] is None:
            norm[key] = None
            return True
        return False

    # --- Required keys ------------------------------------------------------
    if provided("tenure_type"):
        value = props["tenure_type"]
        if value in TENURE_TYPES:
            norm["tenure_type"] = value
        else:
            errors.append(
                f"Unknown tenure_type {value!r}. Allowed: {', '.join(TENURE_TYPES)}."
            )
    elif not partial:
        errors.append(f"tenure_type is required. Allowed: {', '.join(TENURE_TYPES)}.")
    elif "tenure_type" in props:
        errors.append("tenure_type cannot be null.")

    if provided("use_type"):
        value = props["use_type"]
        if value in USE_TYPE_IDS:
            norm["use_type"] = value
        else:
            errors.append(
                f"Unknown use_type {value!r}. Allowed: {', '.join(USE_TYPE_IDS)}."
            )
    elif not partial:
        errors.append(f"use_type is required. Allowed: {', '.join(USE_TYPE_IDS)}.")
    elif "use_type" in props:
        errors.append("use_type cannot be null.")

    for key in ("village", "title"):
        if provided(key):
            value = props[key]
            if isinstance(value, str) and value.strip():
                norm[key] = value.strip()
            else:
                errors.append(f"{key} must be a non-empty string.")
        elif not partial:
            errors.append(f"{key} is required (non-empty string).")
        elif key in props:
            errors.append(f"{key} cannot be null.")

    tenure_type = TENURE_TYPES.get(norm.get("tenure_type", ""), {})

    # --- Security scores ------------------------------------------------------
    if provided("legal_security"):
        value, error = _normalize_security(
            props["legal_security"], LEGAL_SECURITY_VALUES, "legal_security"
        )
        if error:
            errors.append(error)
        else:
            norm["legal_security"] = value
    elif not null_clears("legal_security") and not partial:
        norm["legal_security"] = _default_security(
            tenure_type, "legal_security", LEGAL_SECURITY_VALUES
        )

    if provided("perceived_security"):
        value, error = _normalize_security(
            props["perceived_security"], PERCEIVED_SECURITY_VALUES, "perceived_security"
        )
        if error:
            errors.append(error)
        else:
            norm["perceived_security"] = value
    elif not null_clears("perceived_security") and not partial:
        norm["perceived_security"] = _default_security(
            tenure_type, "perceived_security", PERCEIVED_SECURITY_VALUES
        )

    # --- Optional vocab-checked keys -----------------------------------------
    if provided("actor_group"):
        value = props["actor_group"]
        if value in ACTOR_GROUPS:
            norm["actor_group"] = value
        else:
            errors.append(
                f"Unknown actor_group {value!r}. Allowed: {', '.join(ACTOR_GROUPS)}."
            )
    else:
        null_clears("actor_group")

    if provided("di_scheme"):
        value = props["di_scheme"]
        if value in DI_SCHEMES:
            norm["di_scheme"] = value
        else:
            errors.append(
                f"Unknown di_scheme {value!r}. Allowed: {', '.join(DI_SCHEMES)}."
            )
    else:
        null_clears("di_scheme")

    if provided("season_relevance"):
        value = props["season_relevance"]
        if not isinstance(value, list):
            errors.append(
                f"season_relevance must be an array of seasons ({', '.join(SEASONS)})."
            )
        else:
            bad = [s for s in value if s not in SEASONS]
            if bad:
                errors.append(
                    f"Unknown seasons in season_relevance: {', '.join(map(repr, bad))}. "
                    f"Allowed: {', '.join(SEASONS)}."
                )
            else:
                # Dedupe, keep canonical vocab order.
                norm["season_relevance"] = [s for s in SEASONS if s in value]
    else:
        null_clears("season_relevance")

    if provided("confidence"):
        value = props["confidence"]
        if value in CONFIDENCE_LEVELS:
            norm["confidence"] = value
        else:
            errors.append(
                f"Unknown confidence {value!r}. Allowed: {', '.join(CONFIDENCE_LEVELS)}."
            )
    else:
        null_clears("confidence")

    if provided("sensitivity"):
        value = props["sensitivity"]
        if value in SENSITIVITY_LEVELS:
            norm["sensitivity"] = value
        else:
            errors.append(
                f"Unknown sensitivity {value!r}. Allowed: {', '.join(SENSITIVITY_LEVELS)}."
            )
    elif not partial:
        norm["sensitivity"] = tenure_type.get("sensitivity_default", "public")
    elif "sensitivity" in props:
        errors.append("sensitivity cannot be null.")

    # --- Free-text keys -------------------------------------------------------
    for key in _TEXT_KEYS:
        if provided(key):
            value = props[key]
            if isinstance(value, str):
                norm[key] = value.strip() or None
            else:
                errors.append(f"{key} must be a string.")
        else:
            null_clears(key)

    # --- Photo links (existence is checked by the route, which owns db access)
    if provided("photos"):
        value = props["photos"]
        if isinstance(value, list) and all(isinstance(p, str) for p in value):
            norm["photos"] = value
        else:
            errors.append("photos must be an array of photo id strings.")
    else:
        null_clears("photos")

    return norm, errors

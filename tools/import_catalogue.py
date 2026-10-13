#!/usr/bin/env python3
"""Convert a water tenure catalogue (arrangements.csv + sources.csv) into tenure records.

The catalogue format is the one produced by the water-tenure-analysis skill
(https://github.com/movanet/water-tenure-skills): one row per arrangement in
arrangements.csv, one row per source in sources.csv. This tool maps each
arrangement onto a tenure record of this storymap and either

  --out records.geojson   writes a FeatureCollection the API seeder can load
                          (set SEED_FILE to it; it loads into an empty database), or
  --post https://site     POSTs each record to /api/tenure-records with the bearer
                          token read from an environment variable (never the CLI).

Records are validated with the API's own vocabulary code before anything is
written or sent. Rows that cannot be placed on the map (no coordinates, and no
--centroids entry for their village) are reported and skipped; coordinates are
never guessed. Verbatim quotes, respondent codes, GEDSI notes and free-text
security accounts are never exported. See docs/CONTENT.md for the field map.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VOCAB = ROOT / "api" / "app" / "data" / "tenure_vocab.json"

# user_attributes values (catalogue vocabulary) that imply an actor group.
ACTOR_FROM_ATTRIBUTE = (
    ("public-entity", "agency"),
    ("private-company", "company"),
    ("collective-registered", "water_user_association"),
    ("collective-unregistered", "community"),
    ("indigenous-or-customary-community", "community"),
    ("smallholder", "farmer"),
    ("large-landholder", "farmer"),
    ("tenant-or-lessee", "farmer"),
    ("sharecropper", "farmer"),
)
YEAR_ROUND = {"year-round", "year round", "all year", "all seasons"}


@dataclass
class Report:
    rows: int = 0
    converted: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def text(self) -> str:
        lines = [
            f"Rows read: {self.rows}",
            f"Records converted: {len(self.converted)}",
            f"Rows skipped: {len(self.skipped)}",
        ]
        lines += [f"  SKIP {s}" for s in self.skipped]
        lines += [f"  WARN {w}" for w in self.warnings]
        return "\n".join(lines)


def load_vocab_module(vocab_path: Path):
    """Import the API's vocabulary validator bound to `vocab_path`."""
    os.environ["VOCAB_PATH"] = str(vocab_path)
    sys.path.insert(0, str(ROOT / "api"))
    from app import vocab  # noqa: PLC0415  (import after VOCAB_PATH is set)

    return vocab


def split_multi(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").replace(",", ";").split(";") if v.strip()]


def parse_coordinates(value: str | None) -> tuple[float, float] | None:
    """'lat,lon' (WGS84) -> (lat, lon), or None when empty or out of range."""
    text = (value or "").strip()
    if not text:
        return None
    parts = text.replace(";", ",").replace(" ", ",").split(",")
    numbers = [p for p in parts if p]
    if len(numbers) != 2:
        raise ValueError(f"coordinates {text!r} are not 'lat,lon'")
    lat, lon = float(numbers[0]), float(numbers[1])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError(f"coordinates {text!r} are out of range")
    return lat, lon


def village_from_admin(location_admin: str | None) -> str:
    """'Province > Regency > District > Village > block' -> 'Village'."""
    levels = [
        lvl.replace("(unverified)", "").strip()
        for lvl in (location_admin or "").split(">")
    ]
    levels = [lvl for lvl in levels if lvl]
    if not levels:
        return "Unknown"
    return levels[3] if len(levels) >= 4 else levels[-1]


def parse_mapping(text: str | None) -> dict[str, str]:
    """'MT1=wet,MT2=dry1' -> {'mt1': 'wet', 'mt2': 'dry1'} (case-insensitive keys)."""
    result = {}
    for pair in (text or "").split(","):
        if "=" in pair:
            key, value = pair.split("=", 1)
            result[key.strip().lower()] = value.strip()
    return result


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(handle)]


class Converter:
    def __init__(self, vocab_module, sources: dict[str, dict], args: argparse.Namespace):
        self.v = vocab_module
        self.sources = sources
        self.args = args
        vocab = vocab_module.VOCAB
        self.type_by_key: dict[str, str] = {}
        for t in vocab["tenure_types"]:
            self.type_by_key[t["id"].lower()] = t["id"]
            if t.get("fao_key"):
                self.type_by_key[t["fao_key"].lower()] = t["id"]
        self.use_ids = {u.lower(): u for u in vocab_module.USE_TYPE_IDS}
        self.schemes = {s.lower(): s for s in vocab_module.DI_SCHEMES}
        self.seasons: dict[str, str] = {}
        for s in vocab.get("seasons", []):
            sid = s["id"] if isinstance(s, dict) else s
            self.seasons[sid.lower()] = sid
            if isinstance(s, dict) and s.get("label"):
                self.seasons[s["label"].lower()] = sid
        self.season_map = parse_mapping(args.season_map)
        self.scheme_map = parse_mapping(args.scheme_map)
        self.centroids = {}
        if args.centroids:
            for row in load_csv(Path(args.centroids)):
                self.centroids[row["name"].lower()] = (float(row["lat"]), float(row["lon"]))

    # --- field mappers ---------------------------------------------------------
    def use_type(self, row: dict, rid: str, report: Report) -> tuple[str, list[str]]:
        codes = split_multi(row.get("water_use"))
        mapped = []
        for code in codes:
            if code.lower() in self.use_ids:
                mapped.append(self.use_ids[code.lower()])
            else:
                report.warnings.append(f"{rid}: use code {code!r} not in vocabulary, recorded as 'I'")
                mapped.append(self.use_ids.get("i", "I"))
        if not mapped:
            report.warnings.append(f"{rid}: no water_use, recorded as 'I'")
            mapped = [self.use_ids.get("i", "I")]
        return mapped[0], mapped

    def actor_group(self, row: dict) -> str | None:
        explicit = row.get("actor_group")
        if explicit:
            return explicit
        attributes = {a.lower() for a in split_multi(row.get("user_attributes"))}
        for attribute, group in ACTOR_FROM_ATTRIBUTE:
            if attribute in attributes:
                return group
        return None

    def di_scheme(self, row: dict) -> str | None:
        levels = [lvl.strip() for lvl in (row.get("location_hydro") or "").split(">")]
        for level in levels:
            name = self.scheme_map.get(level.lower(), level)
            if name.lower() in self.schemes and name.lower() != "none":
                return self.schemes[name.lower()]
        return None

    def _season_id(self, text: str) -> str | None:
        key = self.season_map.get(text.lower(), text).lower()
        return self.seasons.get(key)

    def season_relevance(self, row: dict) -> list[str]:
        """Vocabulary season ids named in period_season.

        Each ';'- or ','-separated token is matched whole first, then word by
        word with parenthetical remarks removed, so free text such as
        "MT3 (dry season)" or "start of MT1" still yields MT3 / MT1 (mapped
        through --season-map). "year-round" anywhere means every season.
        """
        tokens = split_multi(row.get("period_season"))
        cleaned = [re.sub(r"\([^)]*\)", " ", t).strip() for t in tokens]
        if any(t.lower() in YEAR_ROUND or t.lower().startswith("year-round") for t in cleaned):
            return list(dict.fromkeys(self.seasons.values()))
        found = []
        for token in cleaned:
            sid = self._season_id(token)
            if sid is None:
                for word in re.split(r"[\s/]+", token):
                    sid = self._season_id(word.strip(".:")) if word else None
                    if sid:
                        break
            if sid and sid not in found:
                found.append(sid)
        order = list(dict.fromkeys(self.seasons.values()))
        return sorted(found, key=order.index)

    def citation(self, row: dict) -> str:
        ids = split_multi(row.get("source_ids"))
        locators = [loc.strip() for loc in (row.get("locators") or "").split(";")]
        parts = []
        for i, sid in enumerate(ids):
            src = self.sources.get(sid, {})
            label = src.get("source_type", "")
            if self.args.with_source_titles and src.get("title"):
                label = f"{label}: {src['title']}, {src.get('date', '')}".strip(", ")
            text = f"{sid} ({label})" if label else sid
            if i < len(locators) and locators[i]:
                text += f" {locators[i]}"
            parts.append(text)
        return "; ".join(parts)

    def sensitivity(self, row: dict, tenure_type: str, confidence: str | None) -> str:
        explicit = row.get("sensitivity")
        if explicit in self.v.SENSITIVITY_LEVELS:
            return explicit
        if self.args.all_aggregate or confidence == "uncorroborated":
            return "aggregate_only"
        for sid in split_multi(row.get("source_ids")):
            src = self.sources.get(sid, {})
            if src.get("verifiability") == "restricted" or src.get("anonymised") == "no":
                return "aggregate_only"
        return self.v.TENURE_TYPES[tenure_type].get("sensitivity_default", "public")

    # --- row -> feature -----------------------------------------------------------
    def convert(self, row: dict, report: Report) -> dict | None:
        aid = row.get("arrangement_id") or f"row{report.rows}"
        rid = f"{self.args.id_prefix}{aid}"
        tenure_key = (row.get("tenure_type") or "").lower()
        tenure_type = self.type_by_key.get(tenure_key)
        if not tenure_type:
            report.skipped.append(f"{aid}: unknown tenure_type {row.get('tenure_type')!r}")
            return None

        village = village_from_admin(row.get("location_admin"))
        notes = []
        try:
            coords = parse_coordinates(row.get("coordinates"))
        except ValueError as exc:
            report.skipped.append(f"{aid}: {exc}")
            return None
        if coords is None and village.lower() in self.centroids:
            coords = self.centroids[village.lower()]
            notes.append(f"Location approximated at the {village} centroid.")
        if coords is None:
            report.skipped.append(f"{aid}: no coordinates (and no --centroids entry for {village!r})")
            return None

        use_type, all_uses = self.use_type(row, aid, report)
        confidence = row.get("confidence") or None
        if confidence and confidence not in self.v.CONFIDENCE_LEVELS:
            report.warnings.append(f"{aid}: confidence {confidence!r} not in vocabulary, dropped")
            confidence = None
        if len(all_uses) > 1:
            notes.append(f"Water uses: {', '.join(all_uses)}.")
        secondary = split_multi(row.get("secondary_tenure_types"))
        if secondary:
            notes.append(f"Secondary tenure types: {', '.join(secondary)}.")

        local = split_multi(row.get("local_name"))
        name = local[0] if local else (row.get("water_source") or row.get("users") or "arrangement")
        props = {
            "title": f"{aid}: {name}"[:200],
            "tenure_type": tenure_type,
            "use_type": use_type,
            "village": village,
            "actor_group": self.actor_group(row),
            "di_scheme": self.di_scheme(row),
            "season_relevance": self.season_relevance(row) or None,
            "confidence": confidence,
            "description": " ".join([row.get("arrangement", "")] + notes).strip() or None,
            "source": self.citation(row) or None,
            "narrative_ref": row.get("narrative_ref") or None,
            "sensitivity": self.sensitivity(row, tenure_type, confidence),
        }
        props = {k: v for k, v in props.items() if v is not None}
        norm, errors = self.v.validate_properties(props)
        if errors:
            report.skipped.append(f"{aid}: {'; '.join(errors)}")
            return None
        report.converted.append(rid)
        lat, lon = coords
        return {
            "type": "Feature",
            "id": rid,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        }


def post_features(features: list[dict], base_url: str, token: str, report: Report) -> int:
    """POST features to the API, skipping titles already present in the same village."""
    base = base_url.rstrip("/")
    with urllib.request.urlopen(f"{base}/api/tenure-records", timeout=60) as resp:
        existing = {
            (r["properties"]["title"], r["properties"]["village"])
            for r in json.load(resp)["records"]
        }
    created = 0
    for feature in features:
        props = feature["properties"]
        if (props["title"], props["village"]) in existing:
            report.warnings.append(f"{feature['id']}: already on the server, not posted again")
            continue
        body = json.dumps({"type": "Feature", "geometry": feature["geometry"],
                           "properties": props}).encode("utf-8")
        request = urllib.request.Request(
            f"{base}/api/tenure-records", data=body, method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=60):
                created += 1
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            report.warnings.append(f"{feature['id']}: POST failed with HTTP {exc.code}: {detail}")
    return created


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--arrangements", required=True, help="path to arrangements.csv")
    parser.add_argument("--sources", required=True, help="path to sources.csv")
    parser.add_argument("--vocab", default=str(DEFAULT_VOCAB), help="tenure_vocab.json to validate against")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--out", help="write a GeoJSON FeatureCollection here")
    target.add_argument("--post", metavar="BASE_URL", help="POST records to BASE_URL/api/tenure-records")
    parser.add_argument("--token-env", default="TENURE_API_TOKEN",
                        help="environment variable holding the bearer token (with --post)")
    parser.add_argument("--centroids", help="CSV with name,lat,lon to place rows that lack coordinates")
    parser.add_argument("--season-map", help="map catalogue seasons to vocab ids, e.g. 'MT1=wet,MT2=dry1'")
    parser.add_argument("--scheme-map", help="map scheme names in location_hydro to vocab di_schemes")
    parser.add_argument("--all-aggregate", action="store_true", help="mark every record aggregate_only")
    parser.add_argument("--with-source-titles", action="store_true",
                        help="include source titles and dates in citations (check they are publishable)")
    parser.add_argument("--id-prefix", default="cat-", help="prefix for record ids (default 'cat-')")
    return parser.parse_args(argv)


def run(args: argparse.Namespace) -> tuple[list[dict], Report]:
    vocab_module = load_vocab_module(Path(args.vocab))
    sources = {s["source_id"]: s for s in load_csv(Path(args.sources)) if s.get("source_id")}
    converter = Converter(vocab_module, sources, args)
    report = Report()
    features = []
    for row in load_csv(Path(args.arrangements)):
        report.rows += 1
        feature = converter.convert(row, report)
        if feature:
            features.append(feature)
    return features, report


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    features, report = run(args)
    if args.out:
        out = {
            "type": "FeatureCollection",
            "metadata": {"generator": "tools/import_catalogue.py",
                         "arrangements": str(Path(args.arrangements).name)},
            "features": features,
        }
        Path(args.out).write_text(
            json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
        )
        print(f"Wrote {len(features)} records to {args.out}")
    else:
        token = os.environ.get(args.token_env, "")
        if not token:
            print(f"Environment variable {args.token_env} is not set.", file=sys.stderr)
            return 2
        created = post_features(features, args.post, token, report)
        print(f"Created {created} records on {args.post}")
    print(report.text())
    return 0


if __name__ == "__main__":
    sys.exit(main())

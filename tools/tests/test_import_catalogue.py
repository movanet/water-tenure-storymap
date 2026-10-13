"""Tests for tools/import_catalogue.py against the synthetic catalogue fixture.

Run from the repository root:  python -m pytest tools/tests
(needs the API requirements installed: the importer and the seeder check use
the API's own validation code).
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tools" / "fixtures" / "sample_catalogue"

# The seeder check below imports app.config, which reads DATA_DIR at import.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="tenure-import-test-")
sys.path.insert(0, str(ROOT / "tools"))

import import_catalogue  # noqa: E402


def _run(*extra: str):
    args = import_catalogue.parse_args([
        "--arrangements", str(FIXTURE / "arrangements.csv"),
        "--sources", str(FIXTURE / "sources.csv"),
        "--out", "unused.geojson",
        "--season-map", "MT1=wet,MT2=dry1,MT3=dry2",
        *extra,
    ])
    features, report = import_catalogue.run(args)
    return {f["id"]: f for f in features}, report


def test_converts_and_reports_skips():
    features, report = _run()
    assert report.rows == 7
    assert sorted(features) == ["cat-A001", "cat-A002", "cat-A003", "cat-A005", "cat-A006"]
    skipped = "\n".join(report.skipped)
    assert "A004: no coordinates" in skipped
    assert "A007: unknown tenure_type 'water-lottery'" in skipped
    assert any("C1" in w for w in report.warnings)


def test_field_mapping():
    features, _ = _run()
    a1 = features["cat-A001"]
    assert a1["geometry"] == {"type": "Point", "coordinates": [-0.04, 0.034]}
    p1 = a1["properties"]
    assert p1["tenure_type"] == "land_based_formal"  # FAO key traditional-formal-right
    assert p1["use_type"] == "B2"
    assert p1["village"] == "Ardena"
    assert p1["di_scheme"] == "Sample Main Canal Scheme"
    assert p1["season_relevance"] == ["wet", "dry1"]
    assert p1["confidence"] == "triangulated"
    assert p1["actor_group"] == "farmer"
    assert p1["sensitivity"] == "public"
    assert p1["source"] == (
        "SAMPLE-INT-01 (interview) l.12; SAMPLE-ADM-02 (admin-record) p.3; "
        "SAMPLE-FGD-02 (fgd) p.2"
    )
    assert features["cat-A005"]["properties"]["tenure_type"] == "unclassified"
    a6 = features["cat-A006"]["properties"]
    assert a6["use_type"] == "I" and a6["actor_group"] == "company"


def test_sensitivity_rules():
    features, _ = _run()
    a2 = features["cat-A002"]["properties"]
    assert a2["sensitivity"] == "aggregate_only"  # informal: vocab default
    assert a2["season_relevance"] == ["dry1", "dry2"]  # via --season-map
    assert "Water uses: B3, A3." in a2["description"]
    assert features["cat-A003"]["properties"]["sensitivity"] == "aggregate_only"  # restricted source
    assert features["cat-A006"]["properties"]["sensitivity"] == "aggregate_only"  # uncorroborated
    everything, _ = _run("--all-aggregate")
    assert {f["properties"]["sensitivity"] for f in everything.values()} == {"aggregate_only"}


def test_never_exports_quotes_or_respondent_codes():
    features, _ = _run("--with-source-titles")
    text = json.dumps(features)
    assert "SYNTHETIC-QUOTE-MUST-NOT-BE-EXPORTED" not in text
    assert "FA-07" not in text  # respondent code from sources.csv
    assert "women absent" not in text  # gedsi_notes
    assert "Synthetic interview transcript 01" in text  # titles only on request


def test_centroids_place_rows_without_coordinates():
    features, report = _run("--centroids", str(FIXTURE / "centroids.csv"))
    a4 = features["cat-A004"]
    assert a4["geometry"]["coordinates"] == [0.075, 0.075]
    assert "centroid" in a4["properties"]["description"]
    assert not any("A004" in s for s in report.skipped)


def test_cli_output_loads_into_the_api_seeder(tmp_path):
    out = tmp_path / "records.geojson"
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "import_catalogue.py"),
         "--arrangements", str(FIXTURE / "arrangements.csv"),
         "--sources", str(FIXTURE / "sources.csv"), "--out", str(out)],
        capture_output=True, text=True, check=True,
    )
    assert "Records converted: 5" in result.stdout
    from app import db, seed  # API package, put on sys.path by the importer

    db.init_db()
    loaded, problems = seed.load_features(out)
    assert (loaded, problems) == (5, [])


def test_free_text_seasons_are_matched():
    args = import_catalogue.parse_args([
        "--arrangements", str(FIXTURE / "arrangements.csv"),
        "--sources", str(FIXTURE / "sources.csv"),
        "--out", "unused.geojson",
        "--season-map", "MT1=wet,MT2=dry1,MT3=dry2",
    ])
    vocab = import_catalogue.load_vocab_module(import_catalogue.DEFAULT_VOCAB)
    converter = import_catalogue.Converter(vocab, {}, args)

    def seasons(text):
        return converter.season_relevance({"period_season": text})

    assert seasons("MT3 (dry season)") == ["dry2"]
    assert seasons("start of MT1") == ["wet"]
    assert seasons("MT2;MT3, since the 2000s (INT-01 l.44)") == ["dry1", "dry2"]
    assert seasons("year-round; heavy use in the dry season") == ["wet", "dry1", "dry2"]
    assert seasons("Dry2; wet") == ["wet", "dry2"]  # vocab ids, case-insensitive, vocab order
    assert seasons("after the harvest") == []

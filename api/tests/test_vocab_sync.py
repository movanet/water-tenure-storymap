"""The web app bundles a copy of the API vocabulary for labels and colours.

If you change api/app/data/tenure_vocab.json, copy it to
web/src/data/tenure_vocab.json as well (and rebuild the web app); this test
fails while the two differ.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_web_vocab_copy_matches_api():
    api = json.loads((ROOT / "api" / "app" / "data" / "tenure_vocab.json").read_text(encoding="utf-8"))
    web = json.loads((ROOT / "web" / "src" / "data" / "tenure_vocab.json").read_text(encoding="utf-8"))
    assert web == api, "web/src/data/tenure_vocab.json differs from the API vocabulary; copy it over"


def test_sample_records_use_vocab_ids_and_narrative_anchors_exist():
    """Every narrative_ref in the sample records points at a real story section."""
    records = json.loads(
        (ROOT / "api" / "app" / "data" / "sample_tenure_records.geojson").read_text(encoding="utf-8")
    )
    anchors = set()
    for path in (ROOT / "web" / "content" / "stories").glob("*.json"):
        story = json.loads(path.read_text(encoding="utf-8"))
        for chapter in story["chapters"]:
            anchors.add(f"{story['id']}#{chapter['id']}")
            for section in chapter["sections"]:
                anchors.add(f"{story['id']}#{section['id']}")
    refs = {
        f["properties"]["narrative_ref"]
        for f in records["features"]
        if f["properties"].get("narrative_ref")
    }
    assert refs, "the sample should exercise narrative_ref"
    assert refs <= anchors, f"narrative_ref without a story section: {sorted(refs - anchors)}"

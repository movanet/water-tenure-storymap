"""End-to-end tests of the tenure engine API against the synthetic sample."""

import io
import json

from PIL import ExifTags, Image
from PIL.TiffImagePlugin import IFDRational

from conftest import AUTH

SAMPLE_RECORDS = 17


def _features(client, query: str = "") -> dict:
    res = client.get(f"/api/tenure-records.geojson{query}")
    assert res.status_code == 200
    return {f["id"]: f for f in res.json()["features"]}


def _jpeg_with_gps(lat_dms=(0, 1, 30), lat_ref="N", lon_dms=(0, 2, 15), lon_ref="E") -> bytes:
    img = Image.new("RGB", (64, 48), (40, 120, 200))
    exif = Image.Exif()
    exif[ExifTags.IFD.GPSInfo] = {
        1: lat_ref, 2: tuple(IFDRational(v) for v in lat_dms),
        3: lon_ref, 4: tuple(IFDRational(v) for v in lon_dms),
    }
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    return buf.getvalue()


def test_health_reports_seeded_sample(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["tenure_records"] == SAMPLE_RECORDS
    assert body["auth_configured"] is True
    assert body["captioning_configured"] is False


def test_vocab_endpoints(client):
    vocab = client.get("/api/vocab/tenure-types").json()
    ids = {t["id"] for t in vocab["tenure_types"]}
    assert {"informal", "customary", "unclassified"} <= ids
    framework = client.get("/api/vocab/fao-framework").json()
    row = next(r for r in framework["rows"] if r["maps_to"] == "land_based_formal")
    assert row["id"] == "traditional-formal-right"


def test_aggregate_only_records_are_fuzzed(client):
    features = _features(client)
    assert len(features) == SAMPLE_RECORDS
    pumping = features["sample-010"]  # informal -> aggregate_only by vocab default
    assert pumping["properties"]["sensitivity"] == "aggregate_only"
    assert pumping["properties"]["fuzzed"] is True
    assert pumping["geometry"]["coordinates"] != [0.095, -0.049]
    wetland = features["sample-015"]  # aggregate_only polygon -> fuzzed point
    assert wetland["geometry"]["type"] == "Point"
    public = features["sample-001"]
    assert public["properties"]["fuzzed"] is False
    assert public["geometry"]["coordinates"] == [-0.04, 0.034]
    # Deterministic: a second read returns the same displaced point.
    assert _features(client)["sample-010"]["geometry"] == pumping["geometry"]


def test_filters_and_stats(client):
    informal = _features(client, "?tenure_type=informal,de_minimis")
    assert {f["properties"]["tenure_type"] for f in informal.values()} == {"informal", "de_minimis"}
    dry2 = _features(client, "?season=dry2&confidence=contested")
    assert list(dry2) == ["sample-010"]
    stats = client.get("/api/stats/typology?village=corvel").json()
    assert stats["total"] == 3
    assert stats["by_tenure_type"]["unrecognised"] == 1


def test_export_excludes_aggregate_only(client):
    csv_text = client.get("/api/export?format=csv").text
    assert "sample-001" in csv_text
    assert "sample-010" not in csv_text and "sample-015" not in csv_text
    geo = client.get("/api/export?format=geojson").json()
    assert all(f["properties"]["sensitivity"] == "public" for f in geo["features"])
    assert client.get("/api/export?format=xml").status_code == 422


def test_write_requires_token(client):
    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [0.01, 0.01]},
        "properties": {"title": "Test", "tenure_type": "customary", "use_type": "A3",
                       "village": "Belmora"},
    }
    assert client.post("/api/tenure-records", json=feature).status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.post("/api/tenure-records", json=feature, headers=bad).status_code == 403


def test_record_crud(client):
    feature = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [0.01, 0.02]},
        "properties": {
            "title": "Test arrangement", "tenure_type": "customary", "use_type": "A3",
            "village": "Belmora", "season_relevance": ["dry2", "wet"],
            "confidence": "single-source",
        },
    }
    res = client.post("/api/tenure-records", json=feature, headers=AUTH)
    assert res.status_code == 201, res.text
    created = res.json()
    rid = created["id"]
    assert created["properties"]["season_relevance"] == ["wet", "dry2"]  # vocab order
    assert created["properties"]["legal_security"] == 3  # vocab default for customary

    bad = dict(feature, properties=dict(feature["properties"], use_type="irrigation"))
    res = client.post("/api/tenure-records", json=bad, headers=AUTH)
    assert res.status_code == 422 and "Allowed" in json.dumps(res.json())

    res = client.patch(f"/api/tenure-records/{rid}", headers=AUTH,
                       json={"properties": {"sensitivity": "aggregate_only", "confidence": None}})
    assert res.status_code == 200
    assert res.json()["properties"]["confidence"] is None
    assert _features(client)[rid]["properties"]["fuzzed"] is True

    assert client.delete(f"/api/tenure-records/{rid}", headers=AUTH).status_code == 204
    assert client.delete(f"/api/tenure-records/{rid}", headers=AUTH).status_code == 404


def test_photo_upload_exif_gps_and_privacy(client):
    files = {"file": ("field.jpg", _jpeg_with_gps(), "image/jpeg")}
    res = client.post("/api/photos", files=files, data={"uploader": "team-a"}, headers=AUTH)
    assert res.status_code == 201, res.text
    photo = res.json()
    assert abs(photo["lat"] - 0.025) < 1e-6 and abs(photo["lon"] - 0.0375) < 1e-6

    stored = client.get(photo["image_url"]).content
    with Image.open(io.BytesIO(stored)) as img:
        assert not img.getexif().get_ifd(ExifTags.IFD.GPSInfo)  # metadata stripped
    assert client.get(photo["thumb_url"]).status_code == 200

    listing = client.get("/api/photos").json()["photos"][0]
    assert "original_name" not in listing

    # Linking the photo to an aggregate_only record fuzzes its public position.
    res = client.patch(f"/api/photos/{photo['id']}", headers=AUTH,
                       json={"tenure_record_id": "sample-010"})
    assert res.status_code == 200
    geo = client.get("/api/photos.geojson").json()["features"][0]
    assert geo["properties"]["fuzzed"] is True
    assert geo["geometry"]["coordinates"] != [photo["lon"], photo["lat"]]
    linked = client.get("/api/tenure-records/sample-010/photos").json()
    assert linked["count"] == 1


def test_photo_upload_without_coordinates_or_caption_key(client):
    img = Image.new("RGB", (20, 20), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    files = {"file": ("plain.png", buf.getvalue(), "image/png")}
    assert client.post("/api/photos", files=files, headers=AUTH).status_code == 422
    files = {"file": ("plain.png", buf.getvalue(), "image/png")}
    res = client.post("/api/photos", files=files, headers=AUTH,
                      data={"lat": "0.01", "lon": "0.01", "auto_describe": "true"})
    assert res.status_code == 503  # captioning off without VISION_API_KEY
    files = {"file": ("notes.txt", b"not an image", "text/plain")}
    res = client.post("/api/photos", files=files, headers=AUTH, data={"lat": "0", "lon": "0"})
    assert res.status_code == 415


def test_bbox_filter_cannot_locate_aggregate_only_records(client):
    """bbox queries match the published (fuzzed) position, never the true one."""
    pumping = _features(client)["sample-010"]
    fuzzed_lon, fuzzed_lat = pumping["geometry"]["coordinates"]
    true_lon, true_lat = 0.095, -0.049
    tiny = 0.0005
    around_true = f"?bbox={true_lon - tiny},{true_lat - tiny},{true_lon + tiny},{true_lat + tiny}"
    assert "sample-010" not in _features(client, around_true)
    around_fuzzed = (
        f"?bbox={fuzzed_lon - tiny},{fuzzed_lat - tiny},{fuzzed_lon + tiny},{fuzzed_lat + tiny}"
    )
    assert "sample-010" in _features(client, around_fuzzed)

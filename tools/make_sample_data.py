#!/usr/bin/env python3
"""Generate the synthetic sample: map layers, tenure records and placeholder art.

Everything this script writes is SYNTHETIC EXAMPLE DATA, NOT REAL DATA. The
"Sample River Basin" is fictional and deliberately placed in the open ocean
around Null Island (0 deg N, 0 deg E) so it cannot be mistaken for a real
place. Output is deterministic: running the script twice gives identical files.

Usage (from the repository root):
    python tools/make_sample_data.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYER_DIR = ROOT / "web" / "public" / "data" / "sample"
MEDIA_DIR = ROOT / "web" / "public" / "media" / "sample"
RECORDS_PATH = ROOT / "api" / "app" / "data" / "sample_tenure_records.geojson"

SYNTHETIC = "Synthetic example, not real data."
NL = "\n"  # write LF on every platform so regenerated files are byte-identical


# --- Geometry helpers ------------------------------------------------------------

def _r(value: float) -> float:
    return round(value, 6)


def blob(cx: float, cy: float, radius: float, wobble: list[tuple[int, float, float]],
         n: int = 48, squash: float = 1.0) -> list[list[float]]:
    """Closed ring around (cx, cy) with a deterministic wavy outline."""
    ring = []
    for i in range(n):
        t = 2 * math.pi * i / n
        r = radius * (1 + sum(a * math.sin(k * t + p) for k, a, p in wobble))
        ring.append([_r(cx + r * math.cos(t)), _r(cy + squash * r * math.sin(t))])
    ring.append(ring[0])
    return ring


def meander(points: list[tuple[float, float]], amp: float, waves: int,
            steps: int = 12) -> list[list[float]]:
    """Polyline through `points` with a gentle sinusoidal meander."""
    line = []
    total = len(points) - 1
    for seg in range(total):
        (x0, y0), (x1, y1) = points[seg], points[seg + 1]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        for i in range(steps):
            t = i / steps
            g = (seg + t) / total
            off = amp * math.sin(2 * math.pi * waves * g)
            line.append([_r(x0 + dx * t + nx * off), _r(y0 + dy * t + ny * off)])
    line.append([_r(points[-1][0]), _r(points[-1][1])])
    return line


def feature(geometry: dict, properties: dict, fid: str | None = None) -> dict:
    out = {"type": "Feature", "geometry": geometry, "properties": properties}
    if fid:
        out["id"] = fid
    return out


def collection(features: list[dict], name: str) -> dict:
    return {
        "type": "FeatureCollection",
        "name": name,
        "metadata": {"note": SYNTHETIC + " Fictional Sample River Basin near Null Island."},
        "features": features,
    }


# --- The fictional basin -------------------------------------------------------------

VILLAGES = {
    # name: (centre lon, centre lat, radius, position in the scheme)
    "Ardena": (-0.035, 0.030, 0.016, "head end"),
    "Belmora": (0.030, 0.012, 0.018, "middle reach"),
    "Corvel": (0.080, -0.035, 0.017, "tail end"),
    "Dunhal": (0.075, 0.075, 0.014, "upland, not served by the canal"),
}

STRUCTURES = [
    ("Sample Weir", "weir", -0.052, 0.058, "Diversion weir on the Sample River feeding the main canal."),
    ("Main intake gate", "gate", -0.046, 0.054, "Gate controlling flow into the main canal."),
    ("Secondary gate S1", "gate", 0.004, 0.034, "Gate at the head of secondary canal S1."),
    ("Secondary gate S2", "gate", 0.052, 0.004, "Gate at the head of secondary canal S2."),
    ("Tail-end drain outlet", "outlet", 0.098, -0.052, "Where the main canal ends in a drain."),
    ("Ridge Spring", "spring", 0.090, 0.088, "Spring feeding the Ridge Spring channel."),
    ("Village storage tank", "tank", -0.030, 0.036, "Storage tank of the Ardena piped supply."),
    ("Town water intake", "intake", -0.010, -0.020, "Utility intake on the Sample River."),
]


def build_layers() -> dict[str, dict]:
    watershed = feature(
        {"type": "Polygon", "coordinates": [blob(0.012, 0.012, 0.118,
                                                 [(2, 0.08, 0.4), (3, 0.05, 1.3), (5, 0.03, 2.1)])]},
        {"name": "Sample River Basin", "area_note": SYNTHETIC},
    )
    river = meander([(-0.090, 0.105), (-0.052, 0.058), (-0.010, -0.018),
                     (0.040, -0.060), (0.110, -0.095)], amp=0.006, waves=5)
    brook = meander([(0.105, 0.095), (0.070, 0.050), (0.030, 0.010), (-0.005, -0.012)],
                    amp=0.004, waves=4)
    rivers = [
        feature({"type": "LineString", "coordinates": river},
                {"name": "Sample River", "kind": "river"}),
        feature({"type": "LineString", "coordinates": brook},
                {"name": "Ridge Brook", "kind": "tributary"}),
    ]
    main_canal = meander([(-0.046, 0.054), (0.004, 0.034), (0.052, 0.004),
                          (0.080, -0.030), (0.098, -0.052)], amp=0.002, waves=3)
    canals = [
        feature({"type": "LineString", "coordinates": main_canal},
                {"name": "Main canal", "level": "primary"}),
        feature({"type": "LineString", "coordinates": meander(
            [(0.004, 0.034), (0.012, 0.010), (0.020, -0.012)], amp=0.001, waves=2)},
            {"name": "Secondary canal S1", "level": "secondary"}),
        feature({"type": "LineString", "coordinates": meander(
            [(0.052, 0.004), (0.060, -0.020), (0.064, -0.048)], amp=0.001, waves=2)},
            {"name": "Secondary canal S2", "level": "secondary"}),
        feature({"type": "LineString", "coordinates": meander(
            [(0.090, 0.088), (0.082, 0.080), (0.070, 0.070)], amp=0.0008, waves=2)},
            {"name": "Ridge Spring channel", "level": "community"}),
    ]
    command_area = feature(
        {"type": "Polygon", "coordinates": [blob(0.035, -0.005, 0.055,
                                                 [(2, 0.12, 0.9), (3, 0.06, 0.2)], squash=0.75)]},
        {"name": "Sample Main Canal Scheme command area", "scheme": "Sample Main Canal Scheme"},
    )
    villages = [
        feature({"type": "Polygon", "coordinates": [blob(lon, lat, r,
                                                         [(3, 0.10, i * 0.7), (5, 0.05, i)])]},
                {"name": name, "position": pos, "note": SYNTHETIC})
        for i, (name, (lon, lat, r, pos)) in enumerate(VILLAGES.items())
    ]
    structures = [
        feature({"type": "Point", "coordinates": [lon, lat]},
                {"name": name, "type": kind, "description": desc})
        for name, kind, lon, lat, desc in STRUCTURES
    ]
    return {
        "watershed": collection([watershed], "watershed"),
        "rivers": collection(rivers, "rivers"),
        "canals": collection(canals, "canals"),
        "irrigation-area": collection([command_area], "irrigation-area"),
        "villages": collection(villages, "villages"),
        "structures": collection(structures, "structures"),
    }


# --- Synthetic tenure records ------------------------------------------------------------

def point(lon: float, lat: float) -> dict:
    return {"type": "Point", "coordinates": [_r(lon), _r(lat)]}


def build_records() -> dict:
    scheme, spring = "Sample Main Canal Scheme", "Ridge Spring Scheme"
    rows = [
        ("sample-001", point(-0.040, 0.034), "Head-end scheme irrigation in Ardena",
         "land_based_formal", "B2", "Ardena", "farmer", scheme, ["wet", "dry1"], "triangulated",
         "Farmers with land in the head-end blocks receive canal water under the scheme's "
         "seasonal allocation plan and report reliable supply in both main seasons.",
         "SAMPLE-FGD-01 p.2; SAMPLE-INT-03 l.40; SAMPLE-ADM-01 row 12", "sample-basin#scheme", {}),
        ("sample-002", {"type": "Polygon", "coordinates": [blob(0.082, -0.038, 0.007,
                                                                [(3, 0.1, 0.3)], n=16)]},
         "Tail-end scheme irrigation in Corvel", "land_based_formal", "B2", "Corvel", "farmer",
         scheme, ["wet"], "corroborated",
         "Tail-end farmers hold the same land-based entitlement as head-end farmers but say "
         "water rarely reaches their blocks after the wet season.",
         "SAMPLE-FGD-02 p.4; SAMPLE-INT-07 l.15", "sample-basin#scheme",
         {"perceived_security": 4}),
        ("sample-003", point(-0.050, 0.057), "Basin agency operation of Sample Weir",
         "agency_control", "B2", "Ardena", "agency", scheme, ["wet", "dry1", "dry2"],
         "triangulated",
         "The basin agency operates the weir and the main intake gate and sets the opening "
         "schedule each season.",
         "SAMPLE-ADM-02 p.1; SAMPLE-INT-01 l.8; SAMPLE-OBS-01", "sample-basin#weir", {}),
        ("sample-004", point(-0.010, -0.019), "Town water utility intake on the Sample River",
         "agency_control", "A1", "Belmora", "water_utility", "none", ["wet", "dry1", "dry2"],
         "corroborated",
         "A town utility abstracts raw water below the weir for its piped network outside the "
         "basin.", "SAMPLE-ADM-03 p.2; SAMPLE-INT-02 l.31", None, {}),
        ("sample-005", point(0.050, 0.000), "Water user association rotation on canal S2",
         "commonhold", "B2", "Belmora", "water_user_association", scheme, ["dry1"],
         "corroborated",
         "A registered water user association divides the S2 share among its members by a "
         "weekly rotation agreed at a seasonal meeting.",
         "SAMPLE-FGD-03 p.1; SAMPLE-INT-05 l.22", None, {}),
        ("sample-006", point(0.026, 0.016), "Household dug wells in Belmora", "de_minimis", "A3",
         "Belmora", "community", "none", ["wet", "dry1", "dry2"], "single-source",
         "Most households draw drinking and washing water from shallow dug wells without any "
         "permit or registration.", "SAMPLE-OBS-02", None, {}),
        ("sample-007", point(0.072, 0.072), "Garden watering from Ridge Brook in Dunhal",
         "de_minimis", "B4", "Dunhal", "farmer", "none", ["dry1", "dry2"], "single-source",
         "Households carry or hose small quantities from the brook to vegetable gardens.",
         "SAMPLE-INT-08 l.5", None, {}),
        ("sample-008", point(0.089, 0.087), "Ridge Spring under customary stewardship",
         "customary", "A3", "Dunhal", "community", spring, ["wet", "dry1", "dry2"],
         "triangulated",
         "A customary steward opens the spring for household use each morning and closes it "
         "during an annual cleaning ceremony.",
         "SAMPLE-FGD-04 p.2; SAMPLE-INT-09 l.12; SAMPLE-OBS-03", "sample-basin#spring", {}),
        ("sample-009", point(0.080, 0.079), "Customary rotation on the Ridge Spring channel",
         "customary", "B3", "Dunhal", "farmer", spring, ["dry1", "dry2"], "corroborated",
         "Upland farmers take turns on the spring channel in an order set by the steward.",
         "SAMPLE-FGD-04 p.3; SAMPLE-INT-10 l.4", "village-notes#dunhal-rotation", {}),
        ("sample-010", point(0.095, -0.049), "Diesel pumping from the main canal tail",
         "informal", "B3", "Corvel", "farmer", scheme, ["dry1", "dry2"], "contested",
         "Tail-end farmers rent diesel pumps to lift water from the canal tail into their "
         "fields; users report no permit, and the agency says it does not act on the pumps.",
         "SAMPLE-INT-07 l.33; SAMPLE-INT-01 l.52", "sample-basin#pumps", {}),
        ("sample-011", point(0.036, 0.006), "Night-time canal-bank breach for irrigation",
         "informal", "B3", "Belmora", "farmer", scheme, ["dry2"], "uncorroborated",
         "One respondent reports that some farmers open a breach in the canal bank at night "
         "during the second dry season.", "SAMPLE-INT-06 l.71", None, {}),
        ("sample-012", point(-0.030, 0.036), "Village piped supply with an expired permit",
         "assumed", "A2", "Ardena", "village_government", "none", ["wet", "dry1", "dry2"],
         "single-source",
         "The village government runs a piped supply from the river; the abstraction permit "
         "shown to the team had expired, and all parties treat the use as lawful.",
         "SAMPLE-ADM-04 p.1", None, {}),
        ("sample-013", point(0.070, 0.066), "Unregistered pump group in Dunhal", "impossible",
         "B3", "Dunhal", "farmer", "none", ["dry1"], "corroborated",
         "A farmer pump group shares a pump on the brook but is not registered, so it cannot "
         "hold a permit in its own name.", "SAMPLE-FGD-05 p.2; SAMPLE-INT-08 l.19",
         "village-notes#dunhal-pumps", {"perceived_security": 3}),
        ("sample-014", point(-0.040, 0.050), "Reservoir fishing below Sample Weir",
         "unrecognised", "G1", "Ardena", "community", "none", ["wet", "dry1", "dry2"],
         "corroborated",
         "Residents fish in the pool below the weir; no water or fisheries rule addresses the "
         "practice.", "SAMPLE-OBS-01; SAMPLE-INT-03 l.88", None, {}),
        ("sample-015", {"type": "Polygon", "coordinates": [blob(0.100, -0.060, 0.008,
                                                                [(2, 0.15, 0.5)], n=16)]},
         "Reed harvesting in the Corvel wetland", "unrecognised", "G2", "Corvel", "community",
         "none", ["dry1", "dry2"], "single-source",
         "Households cut reeds in the wetland below the drain outlet for roofing and sale.",
         "SAMPLE-INT-11 l.9", "village-notes#corvel-wetland", {}),
        ("sample-016", point(-0.044, 0.046), "Planned minimum flow below Sample Weir",
         "reserves_minimum_flow", "E1", "Ardena", "agency", "none", ["dry1", "dry2"],
         "single-source",
         "A draft basin plan proposes a minimum release below the weir in the dry seasons; "
         "it is not yet in force.", "SAMPLE-ADM-05 p.14", None, {}),
        ("sample-017", point(0.020, 0.020), "Brick works abstraction permit in Belmora",
         "modern_permit", "C", "Belmora", "company", "none", ["wet", "dry1", "dry2"],
         "single-source",
         "A brick works holds a long-term abstraction permit for a borehole.",
         "SAMPLE-ADM-06 p.1", None, {}),
    ]
    features = []
    for (rid, geom, title, ttype, use, village, actor, di, seasons, conf, desc, src,
         narrative, extra) in rows:
        props = {
            "title": title,
            "tenure_type": ttype,
            "use_type": use,
            "village": village,
            "actor_group": actor,
            "di_scheme": di,
            "season_relevance": seasons,
            "confidence": conf,
            "description": f"{SYNTHETIC} {desc}",
            "source": f"{src} (synthetic source codes)",
        }
        if narrative:
            props["narrative_ref"] = narrative
        props.update(extra)
        features.append(feature(geom, props, rid))
    return collection(features, "sample_tenure_records")


# --- Placeholder illustrations (SVG) ---------------------------------------------------

SVG_HEAD = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" width="1200" height="750" '
    'role="img" aria-label="{label}">'
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="{sky}"/><stop offset="1" stop-color="#ffffff"/>'
    '</linearGradient></defs>'
    '<rect width="1200" height="750" fill="url(#sky)"/>'
    '<path d="M0 420 C 200 330 380 360 560 400 S 920 330 1200 380 L1200 750 L0 750 Z" fill="#cfe8d5"/>'
    '<path d="M0 500 C 260 450 520 520 760 480 S 1060 470 1200 500 L1200 750 L0 750 Z" fill="#b5dbbf"/>'
)

SCENES = {
    "weir": '<path d="M0 560 C 300 540 600 600 1200 560 L1200 640 C 600 680 300 620 0 640 Z" fill="#6fc2e4"/>'
            '<rect x="440" y="520" width="320" height="70" fill="#8a96a3"/>'
            '<rect x="460" y="470" width="24" height="120" fill="#5b6672"/>'
            '<rect x="716" y="470" width="24" height="120" fill="#5b6672"/>'
            '<path d="M440 590 L760 590 L800 640 L400 640 Z" fill="#bfe3f4"/>',
    "canal": '<path d="M560 750 L640 750 L760 470 L700 470 Z" fill="#6fc2e4"/>'
             '<path d="M520 750 L560 750 L700 470 L680 470 Z" fill="#a3a99f"/>'
             '<path d="M640 750 L680 750 L780 470 L760 470 Z" fill="#a3a99f"/>'
             '<rect x="690" y="440" width="90" height="34" fill="#5b6672"/>',
    "pump": '<path d="M0 600 C 400 580 800 640 1200 600 L1200 660 C 800 700 400 640 0 660 Z" fill="#6fc2e4"/>'
            '<rect x="520" y="470" width="150" height="90" rx="10" fill="#e78558"/>'
            '<circle cx="560" cy="575" r="20" fill="#333"/><circle cx="640" cy="575" r="20" fill="#333"/>'
            '<path d="M520 520 C 420 520 420 600 380 630" stroke="#2b2b2b" stroke-width="14" fill="none"/>'
            '<path d="M670 500 C 820 480 900 520 1000 470" stroke="#2b2b2b" stroke-width="14" fill="none"/>',
    "spring": '<ellipse cx="600" cy="600" rx="230" ry="60" fill="#6fc2e4"/>'
              '<circle cx="420" cy="560" r="55" fill="#9aa3a8"/><circle cx="500" cy="530" r="45" fill="#b0b8bc"/>'
              '<circle cx="770" cy="550" r="60" fill="#9aa3a8"/>'
              '<path d="M600 470 C 590 520 610 540 600 590" stroke="#bfe3f4" stroke-width="16" fill="none"/>',
    "wetland": '<rect x="0" y="560" width="1200" height="190" fill="#8fd0e6"/>'
               + "".join(f'<path d="M{x} 640 L{x + 10} {500 + (x * 37) % 80}" stroke="#4f7d3a" '
                         f'stroke-width="6"/>' for x in range(80, 1150, 45)),
    "well": '<ellipse cx="600" cy="600" rx="120" ry="34" fill="#5b6672"/>'
            '<rect x="480" y="520" width="240" height="80" fill="#a3a99f"/>'
            '<ellipse cx="600" cy="520" rx="120" ry="34" fill="#2e8fbf"/>'
            '<rect x="500" y="380" width="16" height="150" fill="#6b4f2e"/>'
            '<rect x="684" y="380" width="16" height="150" fill="#6b4f2e"/>'
            '<rect x="500" y="380" width="200" height="14" fill="#6b4f2e"/>',
    "fields": "".join(f'<path d="M{x} 750 L{x + 140} 750 L{x + 230} 480 L{x + 160} 480 Z" '
                      f'fill="{c}" stroke="#ffffff" stroke-width="4"/>'
                      for x, c in zip(range(-100, 1200, 160), ["#a7d08c", "#8cc37a", "#bcdc9c"] * 9)),
    "map": '<rect x="330" y="420" width="540" height="300" rx="8" fill="#fdf7e3" stroke="#c9b98a" stroke-width="6"/>'
           '<path d="M360 650 C 480 560 600 640 840 450" stroke="#6fc2e4" stroke-width="12" fill="none"/>'
           '<circle cx="480" cy="560" r="14" fill="#e78558"/><circle cx="650" cy="600" r="14" fill="#8e5bc0"/>'
           '<circle cx="760" cy="500" r="14" fill="#15a06e"/>',
}


def scene_svg(kind: str, title: str, sky: str = "#dff3fb") -> str:
    label = f"{title} (placeholder illustration, synthetic example)"
    return (
        SVG_HEAD.format(label=label, sky=sky)
        + SCENES[kind]
        + '<rect x="30" y="30" width="700" height="96" rx="12" fill="#ffffff" fill-opacity="0.85"/>'
        + f'<text x="56" y="76" font-family="Arial, sans-serif" font-size="34" fill="#1f2937">{title}</text>'
        + '<text x="56" y="110" font-family="Arial, sans-serif" font-size="22" fill="#6b7280">'
          'Placeholder illustration - synthetic example, not real data</text>'
        + "</svg>\n"
    )


LOGO_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 64" width="300" height="64" '
    'role="img" aria-label="Your organization logo (placeholder)">'
    '<path d="M32 6 C 22 22 12 32 12 42 a20 20 0 0 0 40 0 C 52 32 42 22 32 6 Z" fill="#0d9ed3"/>'
    '<path d="M24 44 a8 8 0 0 0 8 8" stroke="#ffffff" stroke-width="4" fill="none"/>'
    '<text x="64" y="30" font-family="Arial, sans-serif" font-size="18" font-weight="bold" '
    'fill="#1f2937">YOUR ORGANIZATION</text>'
    '<text x="64" y="50" font-family="Arial, sans-serif" font-size="13" fill="#6b7280">'
    'placeholder logo</text></svg>\n'
)

MEDIA = {
    "hero-basin.svg": ("fields", "Sample River Basin", "#d4eefa"),
    "hero-weir.svg": ("weir", "Sample Weir", "#e3f4fb"),
    "weir.svg": ("weir", "Diversion weir", "#dff3fb"),
    "canal.svg": ("canal", "Main canal and secondary gate", "#e8f6fc"),
    "pump.svg": ("pump", "Rented diesel pump at the canal tail", "#f7efe6"),
    "spring.svg": ("spring", "Ridge Spring", "#e6f3ef"),
    "wetland.svg": ("wetland", "Corvel wetland", "#e4f2f7"),
    "well.svg": ("well", "Household dug well", "#eef6fb"),
    "fields.svg": ("fields", "Head-end rice fields", "#e1f2fb"),
    "mapping.svg": ("map", "Participatory mapping (illustration)", "#f4f1e6"),
}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + NL, encoding="utf-8", newline=NL)


def main() -> None:
    for name, data in build_layers().items():
        write_json(LAYER_DIR / f"{name}.geojson", data)
    write_json(RECORDS_PATH, build_records())
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    for filename, (kind, title, sky) in MEDIA.items():
        (MEDIA_DIR / filename).write_text(scene_svg(kind, title, sky), encoding="utf-8", newline=NL)
    (MEDIA_DIR / "logo.svg").write_text(LOGO_SVG, encoding="utf-8", newline=NL)
    print(f"Wrote layers to {LAYER_DIR.relative_to(ROOT)}, records to "
          f"{RECORDS_PATH.relative_to(ROOT)}, media to {MEDIA_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

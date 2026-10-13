# Writing your content

Everything a deployer changes lives in a few files. Edit them, then rebuild the web app (`docker compose up -d --build web`, or `npm run build` in `web/`). A mistake in a story or layer file stops the build with a message naming the file, so a broken file never reaches the live site.

| File | What it controls |
|---|---|
| `web/content/site.json` | Site name, logo, colours, navigation, banner, home page, map view and basemaps, footer, API location, every user-facing label |
| `web/content/layers.json` | Map layers: your GeoJSON and raster tiles, plus the API-backed tenure records and field photos |
| `web/content/stories/*.json` | Stories (one file per story) |
| `web/content/gallery.json` | Pictures on the gallery page and the home page strip |
| `web/content/about.md` | The About page |
| `web/public/` | Files served as-is: your GeoJSON (for example `web/public/data/`), pictures (`web/public/media/`), static tiles |
| `api/app/data/tenure_vocab.json` | The tenure vocabulary: types, use codes, actor groups, schemes, seasons, confidence levels, ratings |

The shipped content is a **synthetic example, not real data**. Replace all of it, including the `banner` line in `site.json` that says so, and delete `web/public/data/sample/` and `web/public/media/sample/` once nothing points at them.

## site.json

| Key | Meaning |
|---|---|
| `lang` | HTML language code, for example `en` or `id` |
| `name` | Full site name (browser title) |
| `shortName` | Text next to the logo in the top bar |
| `description` | Page description for search engines and link previews |
| `banner` | Optional notice under the top bar; remove the key to hide it |
| `logo` | `src` (path under `web/public/`), `alt`, `width`, `height` (intrinsic size in pixels) |
| `colors` | `brand` (top bar, buttons, links), `accent` (secondary buttons, headings in the footer), `footer` (footer block) as CSS colours |
| `nav` | Top bar links: `label`, `href`, optional `"icon": "home"` |
| `home.hero` | Carousel pictures: `src`, `alt` |
| `home.mapHeading`, `home.introHeading` | Headings above the map and the introduction |
| `home.intro` | Introduction text in the Markdown subset described under [Stories](#stories) |
| `home.introLink`, `home.galleryLink` | `label` and `href` of the links under the introduction and the picture strip |
| `home.galleryCount` | Number of gallery pictures shown on the home page |
| `map.initialView` | `longitude`, `latitude`, `zoom` of the home map |
| `map.defaultBasemap`, `map.basemaps` | See [Basemaps](#basemaps) |
| `api.enabled` | `false` for a site without the tenure engine (no API calls are made) |
| `api.baseUrl` | Empty when the API is reachable at `/api` on the same domain (the normal case); otherwise its origin, for example `https://api.example.org` (that API must allow your site in `CORS_ORIGINS`) |
| `stories.breadcrumb`, `stories.heading` | Texts on the story list |
| `gallery.heading`, `gallery.pageSize` | Gallery heading and pictures per page |
| `typology.heading`, `typology.intro` | Typology page heading and introduction |
| `footer` | `orgName`, `lines` (address lines), `email`, `phone`, `links` (`label`, `url`), `copyright`; empty or missing keys are not shown |
| `labels` | Every button, heading and message of the interface. Translate the values to localize the site; `{count}`, `{visible}` and `{total}` are placeholders. Keys you leave out fall back to English. |

## Basemaps

`map.basemaps` lists the background maps offered by the basemap button; `map.defaultBasemap` is the `id` shown first. Each entry has `id`, `name`, `url` and `attribution`. The `url` is either an XYZ tile template containing `{z}`, `{x}` and `{y}` (for example `https://tile.openstreetmap.org/{z}/{x}/{y}.png`) or the URL of a MapLibre style document (`style.json`).

The shipped basemaps are public services with their own terms of use. The OpenStreetMap tile servers, for example, are run by volunteers and their tile usage policy (https://operations.osmfoundation.org/policies/tiles/) does not allow heavy use; Esri, CARTO, OpenTopoMap and OpenFreeMap have terms of their own. For a site with real traffic, use a commercial provider or host your own tiles, and keep the attribution text the provider requires.

## layers.json

`layers` is an array; the first entry is drawn at the bottom. Every layer has `id` (unique, letters, digits and hyphens), `name` (shown in the layer control), `type` and optionally `visible` (default `true`), `opacity` (0 to 1, default 1), `minzoom`, `maxzoom`, `attribution` and `legend` (a list of `color` and `label`).

### GeoJSON layers

```json
{
  "id": "canals",
  "name": "Canals",
  "type": "geojson",
  "data": "/data/my-basin/canals.geojson",
  "style": {
    "kind": "line",
    "color": "#10b981",
    "lineWidth": 2,
    "dash": [2, 1],
    "colorBy": {
      "field": "level",
      "values": { "primary": "#047857", "secondary": "#10b981" }
    }
  },
  "popup": {
    "title": "name",
    "fields": [{ "key": "level", "label": "Level" }]
  }
}
```

- `data`: a path under `web/public/` (for example `/data/...`) or a full URL. Coordinates must be WGS84 longitude, latitude (EPSG:4326), as GeoJSON requires. Convert other projections first, for example `ogr2ogr -t_srs EPSG:4326 out.geojson in.shp`.
- `style.kind`: `fill` (polygons, drawn with an outline), `line` or `circle` (points). Options: `color`, `fillOpacity` (fill only, default 0.2), `lineWidth`, `dash`, `radius` (circle only).
- `style.colorBy`: colour features by the value of one property; values not listed use `color`. Without an explicit `legend`, the legend is built from these values.
- `popup`: clicking a feature opens a popup titled with the `title` property and listing the `fields` that have a value. Omit `popup` for a layer that should not be clickable.

Keep files small (a few MB at most): they are downloaded whole by every visitor. Simplify geometry (for example `mapshaper in.geojson -simplify 10% -o out.geojson`) and drop unused properties. Never publish layers that locate people or sensitive sites (see [DATA-PROTECTION.md](DATA-PROTECTION.md)).

### Raster tile layers

```json
{
  "id": "land-cover",
  "name": "Land cover 2025",
  "type": "raster",
  "tiles": ["/tiles/land-cover/{z}/{x}/{y}.png"],
  "tileSize": 256,
  "scheme": "xyz",
  "minzoom": 8,
  "maxzoom": 15,
  "opacity": 0.7,
  "visible": false,
  "attribution": "Land cover: your source",
  "legend": [
    { "color": "#1a9641", "label": "Forest" },
    { "color": "#fdae61", "label": "Rice fields" }
  ]
}
```

`scheme` is `xyz` (the usual web-map tiling, y counted from the top) or `tms` (y counted from the bottom).

### Serving your own raster tiles

- **Static XYZ folder.** Cut a GeoTIFF into tiles with GDAL, for example `gdal2tiles.py --xyz -z 8-15 -w none landcover.tif web/public/tiles/land-cover`, and point `tiles` at `/tiles/land-cover/{z}/{x}/{y}.png`. Files under `web/public/` are built into the web image, which is fine for a few thousand tiles; for larger sets serve the folder from the reverse proxy (for example a Caddy `handle /tiles/* { root * /srv/tiles; file_server }` block) or from object storage, and use the full URL.
- **Tile server.** Run a tile server next to the stack (for example TiTiler for cloud-optimized GeoTIFFs, or TileServer GL for MBTiles) and use its XYZ URL. Route it through the reverse proxy so it is served over HTTPS.
- **A public tile service.** Any XYZ or TMS endpoint you are allowed to use, with its attribution.

### API-backed layers

```json
{ "id": "tenure-records", "name": "Tenure records", "type": "tenure-records", "visible": true, "style": { "color": "#0d9ed3" } },
{ "id": "field-photos", "name": "Field photos", "type": "field-photos", "visible": true, "style": { "color": "#eab308" } }
```

These show the records and photos of the tenure engine. Keep at most one of each; remove an entry to hide that layer. Tenure records are coloured by the vocabulary (see below), not by `style.color`, which only sets the swatch in the layer control.

## Stories

Each file `web/content/stories/<id>.json` is one story; `<id>` must equal the file name and may use lower-case letters, digits and hyphens. A story has chapters (the pills under the narrative) and each chapter has sections (the entries that open and close).

```json
{
  "id": "my-basin",
  "order": 1,
  "title": "Who holds the water in My Basin?",
  "subtitle": "One line under the title",
  "author": "Field team",
  "date": "2026",
  "thumbnail": "/media/my-basin/cover.jpg",
  "notice": "Optional note shown above the sections",
  "mapView": { "longitude": 108.2, "latitude": -6.9, "zoom": 10 },
  "chapters": [
    {
      "id": "canal",
      "title": "The canal",
      "description": "One line under the chapter title.",
      "mapView": { "longitude": 108.21, "latitude": -6.88, "zoom": 12 },
      "layers": ["watershed", "canals", "tenure-records"],
      "sections": [
        {
          "id": "pumps",
          "title": "Renting pumps at the canal tail",
          "body": "First paragraph with **bold** and *italic* text.\n\nSecond paragraph with a [link](https://example.org).",
          "mapView": { "longitude": 108.25, "latitude": -6.92, "zoom": 14 },
          "images": [{ "src": "/media/my-basin/pump.jpg", "caption": "Caption and credit" }]
        }
      ]
    }
  ]
}
```

- `order` sorts the story list (then the title).
- `mapView` on the story, a chapter or a section sets the map camera; opening a section flies to the section's camera, else the chapter's.
- `layers` (optional, per chapter) lists the layer ids visible while that chapter is open. If any chapter of a story has `layers`, chapters without it show the default visibility from `layers.json`.
- Section ids must be unique within a story. The page URL `/story/<story-id>#<section-id>` opens that section (and `#<chapter-id>` opens a chapter). A tenure record whose `narrative_ref` is `my-basin#pumps` gets a "Read in story" link to exactly that place.
- `body` uses a small Markdown subset: blank lines separate paragraphs; `# `, `## ` and `### ` headings; lines starting with `- ` or `1. ` form lists; `**bold**`, `*italic*`, `` `code` ``, and `[text](url)` links (http, https, mailto, or paths starting with `/` or `#`). HTML is not rendered.
- Pictures: put them under `web/public/media/` and reference them with a path starting `/media/`. JPEG, PNG, WebP and SVG work. Write captions that do not identify private persons (see [DATA-PROTECTION.md](DATA-PROTECTION.md)).

## Gallery

`web/content/gallery.json` holds `items`, each with `src` and `caption`. The first `home.galleryCount` items also appear on the home page.

## About page

`web/content/about.md` is rendered with the same Markdown subset as story sections. Say who runs the site, what the data is and is not, how it was collected, how locations are protected, and whom to contact.

## The tenure vocabulary

`api/app/data/tenure_vocab.json` is the single source of truth for the values a record may take. The API validates every write against it, and the web app uses a copy of it for labels and colours.

- `tenure_types`: one entry per type, with `id` (what records store), `fao_key` and `fao_name` (the FAO typology row it corresponds to), `family`, `category`, `label`, `definition`, `color` (map marker colour), `analyzed` (shown first in the filter and active on the typology page), type-level `legal_security` and `perceived_security` (1 to 4, `NA` or `NR`; used when a record has no rating of its own), `examples`, and optionally `sensitivity_default` (`aggregate_only` for types whose records should be generalized by default).
- `use_types`: the water use codes (A1 to I, plus `mixed`).
- `actor_groups`, `di_schemes` (irrigation schemes in your area; keep `none`), `seasons`, `confidence_levels`, `security_scale`, `sensitivity_levels`.

The shipped `analyzed` flags and ratings are synthetic sample values. Replace them with your assessment's results, or set the ratings to `NA`. Edit the schemes and seasons for your area.

After editing, copy the file to the web app and rebuild both services:

```bash
cp api/app/data/tenure_vocab.json web/src/data/tenure_vocab.json
docker compose up -d --build
```

`python -m pytest api/tests` fails while the two copies differ. You can also keep the vocabulary outside the image: mount it into the API container and set `VOCAB_PATH` to its path (add the variable to the `environment` block of `docker-compose.yml`); the web copy must still match. Renaming an id does not change the records that use it: they keep the old value and show as an unknown (gray) type until you update them through the API.

## Importing a catalogue

`tools/import_catalogue.py` turns a water tenure catalogue into tenure records. The catalogue format is the one of the water-tenure-analysis skill in https://github.com/movanet/water-tenure-skills: `arrangements.csv` (one row per arrangement) and `sources.csv` (one row per source). The importer needs Python 3.12+ and the API requirements (`pip install -r api/requirements.txt`), because it validates records with the API's own code.

```bash
# Write a GeoJSON file for seeding an empty database (SEED_FILE)
python tools/import_catalogue.py \
  --arrangements catalogue/arrangements.csv --sources catalogue/sources.csv \
  --season-map "MT1=wet,MT2=dry1,MT3=dry2" \
  --out records.geojson

# Or post the records to a running API (token read from an environment variable)
export TENURE_API_TOKEN=...
python tools/import_catalogue.py \
  --arrangements catalogue/arrangements.csv --sources catalogue/sources.csv \
  --post https://tenure.example.org
```

Options:

| Option | Meaning |
|---|---|
| `--arrangements`, `--sources` | The two catalogue files (required) |
| `--out FILE` | Write a GeoJSON FeatureCollection (one of `--out` and `--post` is required) |
| `--post BASE_URL` | POST each record to `BASE_URL/api/tenure-records`; records whose title and village already exist on the server are not posted again |
| `--token-env NAME` | Environment variable holding the bearer token (default `TENURE_API_TOKEN`); the token is never accepted on the command line |
| `--vocab FILE` | Vocabulary to validate against (default `api/app/data/tenure_vocab.json`) |
| `--centroids FILE` | CSV with `name,lat,lon`: rows without coordinates are placed at the centroid of their village, and the description says so |
| `--season-map` | Map catalogue season names to vocabulary seasons, for example `MT1=wet,MT2=dry1` |
| `--scheme-map` | Map scheme names found in `location_hydro` to vocabulary `di_schemes`, for example `Wening scheme=Sample Main Canal Scheme` |
| `--all-aggregate` | Mark every record `aggregate_only` |
| `--with-source-titles` | Add source titles and dates to the citation line (check that they are publishable first) |
| `--id-prefix` | Prefix of record ids (default `cat-`) |

The importer prints how many rows it read, converted and skipped, with a reason for every skip and warning.

### Field map

| Catalogue column | Record property |
|---|---|
| `arrangement_id` | `id` = prefix + arrangement id; also the start of `title` |
| `local_name` (first entry), else `water_source`, else `users` | rest of `title` (`"A001: <name>"`, at most 200 characters) |
| `tenure_type` | `tenure_type`, matched case-insensitively to a vocabulary `id` or `fao_key` (for example `agency-control` becomes `agency_control`); unknown types are skipped |
| `water_use` | `use_type` = the first code; further codes are listed in the description; codes not in the vocabulary become `I` with a warning |
| `location_admin` (`Province > Regency > District > Village > ...`) | `village` = the fourth level, or the last level when there are fewer; `(unverified)` is removed |
| `coordinates` (`lat,lon`, WGS84) | Point geometry; without coordinates the row is placed at its `--centroids` entry or skipped |
| `location_hydro` | `di_scheme` = the first level matching a vocabulary scheme (after `--scheme-map`) |
| `period_season` | `season_relevance`: season codes found in the text (after `--season-map`); "year-round" means every season |
| `confidence` | `confidence`, if it is a vocabulary confidence level (else dropped with a warning) |
| `user_attributes` (or an explicit `actor_group` column) | `actor_group`: `public-entity` to agency, `private-company` to company, `collective-registered` to water user association, `collective-unregistered` and `indigenous-or-customary-community` to community, `smallholder`, `large-landholder`, `tenant-or-lessee` and `sharecropper` to farmer |
| `arrangement`, `secondary_tenure_types` | `description` (the arrangement text, plus notes on extra water uses, secondary types and centroid placement) |
| `source_ids` + `locators` + `sources.csv` | `source`, for example `S01 (admin-record) p.12; INT-V1-01 (interview) l.15` |
| `narrative_ref` (optional column) | `narrative_ref`, for example `my-basin#pumps` |
| `sensitivity` (optional column) | `sensitivity`, see below |

Never exported: `quote_original`, `quote_translation`, `respondent_code` and every other column of `sources.csv` except the source type (and, with `--with-source-titles`, title and date), `gedsi_notes`, `perceived_security` (free text), `conflicts`, `contradictions`, `legal_flag`, `classification_basis`, `gaps_next_steps` and `notes`. Legal and perceived security ratings are not taken from the catalogue; records inherit the type-level ratings of the vocabulary, which you can override per record through the API.

Sensitivity, first rule that applies:

1. an explicit `sensitivity` column (`public` or `aggregate_only`);
2. `--all-aggregate`;
3. `confidence` is `uncorroborated` (allegations and hearsay);
4. any cited source has `verifiability` `restricted` or `anonymised` `no`;
5. the type's `sensitivity_default` in the vocabulary (`informal` and `unrecognised` are `aggregate_only` in the shipped vocabulary), else `public`.

The `arrangement` text is copied as written. Read it before publishing: it must not name private persons or contain anything you would not show the people described (see [DATA-PROTECTION.md](DATA-PROTECTION.md)).

### Seeding from a file

To load the GeoJSON into a fresh deployment instead of posting it: copy it to `seed/records.geojson` in the repository, uncomment the `./seed:/seed:ro` volume in `docker-compose.yml`, set `SEED_SAMPLE=false` and `SEED_FILE=/seed/records.geojson` in `.env`, and start with an empty database. Seeding happens only while the records table is empty, and invalid features are skipped with a log message (`docker compose logs api`).

## Regenerating the synthetic sample

`python tools/make_sample_data.py` rewrites the sample layers, the sample records and the placeholder illustrations deterministically. It is only needed when you change the sample itself.

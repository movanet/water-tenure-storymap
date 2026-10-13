# Tenure engine API

The API stores water tenure records and geotagged field photos and serves them to the storymap. All routes start with `/api`. Interactive documentation is served by the API itself at `/api/docs` (machine-readable at `/api/openapi.json`).

Examples below use `BASE=https://tenure.example.org` (behind the reverse proxy) or `BASE=http://127.0.0.1:8000` (directly on the server), and a token in the environment:

```bash
export BASE=http://127.0.0.1:8000
export TENURE_API_TOKEN=...   # the value from .env; never paste it into shared logs
```

## Authentication

Reads are public. Every write (POST, PATCH, DELETE) needs the header `Authorization: Bearer <TENURE_API_TOKEN>`.

| Response | Meaning |
|---|---|
| 401 | Header missing |
| 403 | Wrong token |
| 503 | The server has no `TENURE_API_TOKEN` configured, so writes are disabled |

Cross-origin requests from browsers are allowed for GET only (origins from `CORS_ORIGINS`). Call write endpoints from a script or server, not from a public web page.

## Health

```bash
curl -s $BASE/api/health
```

```json
{"status": "ok", "photos": 0, "tenure_records": 17, "auth_configured": true,
 "captioning_configured": false, "vision_model": null, "vocab_version": "3.0-sample"}
```

## Vocabulary

| Route | Returns |
|---|---|
| `GET /api/vocab/tenure-types` | The vocabulary file in use (`tenure_types`, `use_types`, `actor_groups`, `di_schemes`, `seasons`, `confidence_levels`, `security_scale`, `sensitivity_levels`) |
| `GET /api/vocab/fao-framework` | One row per tenure type, keyed by its FAO typology key, with `analyzed` and `maps_to` (the vocabulary id records use) |

```bash
curl -s $BASE/api/vocab/tenure-types | python -m json.tool | head -40
```

## Tenure records

A record is a GeoJSON Feature with a Point or Polygon geometry (WGS84 longitude, latitude) and these properties:

| Property | Required | Values |
|---|---|---|
| `title` | yes | Non-empty text |
| `tenure_type` | yes | A vocabulary tenure type id, for example `customary` |
| `use_type` | yes | A vocabulary use code, for example `B3` |
| `village` | yes | Non-empty text (village or other locality name) |
| `legal_security` | no | `1` to `4` or `NA`; default: the type-level rating when it is a valid value |
| `perceived_security` | no | `1` to `4`, `NR` or `NA`; default as above |
| `actor_group` | no | A vocabulary actor group |
| `di_scheme` | no | A vocabulary irrigation scheme (or `none`) |
| `season_relevance` | no | Array of vocabulary seasons, stored in vocabulary order |
| `confidence` | no | A vocabulary confidence level, for example `triangulated` |
| `description` | no | Text |
| `source` | no | Citation line with source codes and locators |
| `narrative_ref` | no | `"<story-id>#<section-id>"`: the storymap shows a "Read in story" link |
| `quote_ref` | no | A reference code for a quote kept in your private records; never the quote itself |
| `sensitivity` | no | `public` or `aggregate_only`; default: the type's `sensitivity_default`, else `public` |
| `photos` | no | Array of photo ids to link to the record (replaces the current links) |

Unknown properties and values outside the vocabulary are rejected with HTTP 422 and a message listing the allowed values. The server adds `id`, `created_at`, `updated_at`, `fuzzed` and `photos` on output.

### Read

| Route | Returns |
|---|---|
| `GET /api/tenure-records` | `{"count": n, "records": [Feature, ...]}` |
| `GET /api/tenure-records.geojson` | A FeatureCollection (what the map loads) |
| `GET /api/stats/typology` | Counts by tenure type, use type, legal and perceived security, village, scheme and confidence, plus `total` |
| `GET /api/tenure-records/{id}/photos` | `{"count": n, "photos": [...]}` |

The three list routes take the same optional filters. Each accepts comma-separated values (any value matches):

| Parameter | Filters on |
|---|---|
| `tenure_type`, `use_type`, `legal_security`, `perceived_security`, `di_scheme`, `confidence` | Exact values |
| `village` | Village name, case-insensitive |
| `season` | Records relevant in any of the given seasons |
| `bbox` | `min_lon,min_lat,max_lon,max_lat`, applied to the published position |

```bash
curl -s "$BASE/api/tenure-records.geojson?tenure_type=informal,customary&season=dry1"
curl -s "$BASE/api/stats/typology?village=Corvel"
```

### Create

```bash
curl -s -X POST $BASE/api/tenure-records \
  -H "Authorization: Bearer $TENURE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [0.026, 0.016]},
    "properties": {
      "title": "Household dug wells",
      "tenure_type": "de_minimis",
      "use_type": "A3",
      "village": "Belmora",
      "season_relevance": ["wet", "dry1", "dry2"],
      "confidence": "single-source",
      "source": "OBS-02 para 3"
    }
  }'
```

Returns HTTP 201 and the stored Feature (with its true geometry, since the caller is authenticated).

### Update and delete

```bash
# Change some properties (others stay as they are; null clears an optional property)
curl -s -X PATCH $BASE/api/tenure-records/RECORD_ID \
  -H "Authorization: Bearer $TENURE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"properties": {"sensitivity": "aggregate_only", "confidence": null}}'

# Delete (linked photos are kept and unlinked)
curl -s -X DELETE $BASE/api/tenure-records/RECORD_ID -H "Authorization: Bearer $TENURE_API_TOKEN"
```

To remove the synthetic sample from a running deployment, delete the records whose ids start with `sample-`:

```bash
for id in $(curl -s $BASE/api/tenure-records | python -c \
  "import json,sys; print(' '.join(r['id'] for r in json.load(sys.stdin)['records'] if r['id'].startswith('sample-')))"); do
  curl -s -o /dev/null -w "$id %{http_code}\n" -X DELETE $BASE/api/tenure-records/$id \
    -H "Authorization: Bearer $TENURE_API_TOKEN"
done
```

### Export

`GET /api/export?format=geojson` or `format=csv` downloads the records marked `public`, with the attribution from `DATA_ATTRIBUTION`. Records marked `aggregate_only` are left out of both formats.

```bash
curl -s -o tenure-records.csv "$BASE/api/export?format=csv"
```

## Sensitivity rules

Records with `sensitivity: aggregate_only` are published, but never at their true location:

- every public read (list, GeoJSON, and the photos linked to the record) returns a position displaced by `FUZZ_MIN_METERS` to `FUZZ_MAX_METERS` (default 250 to 1000 m) and `fuzzed: true`;
- the displacement is derived from the record id, so it is the same on every request and cannot be averaged away by asking repeatedly;
- polygons are replaced by a displaced point, so the shape is not published;
- the `bbox` filter uses the displaced position, so bounding-box queries cannot narrow down the true one;
- the CSV and GeoJSON exports leave the record out.

The title, description, village and other properties of an `aggregate_only` record are public. A record that must not be public at all does not belong in a public deployment. See [DATA-PROTECTION.md](DATA-PROTECTION.md).

## Field photos

### Upload

```bash
# Coordinates from the photo's EXIF GPS tags
curl -s -X POST $BASE/api/photos -H "Authorization: Bearer $TENURE_API_TOKEN" \
  -F "file=@weir.jpg;type=image/jpeg" -F "description=Gate of the main intake"

# Explicit coordinates (WGS84), link to a record later with PATCH
curl -s -X POST $BASE/api/photos -H "Authorization: Bearer $TENURE_API_TOKEN" \
  -F "file=@pump.jpg" -F "lat=-0.049" -F "lon=0.095"
```

Form fields: `file` (JPEG, PNG or WebP, at most `MAX_UPLOAD_MB`), optional `lat` and `lon` (both or neither), `description`, `taken_at` (default: EXIF date), `uploader`, and `auto_describe=true` to generate a caption with the configured vision model. Without coordinates and without readable EXIF GPS the upload fails with HTTP 422. With `STRIP_EXIF=true` (the default) the stored image is re-encoded without metadata after the coordinates are read.

| Response | Meaning |
|---|---|
| 201 | Stored; the response includes `image_url` and `thumb_url` |
| 413 | File too large |
| 415 | Not a JPEG, PNG or WebP image |
| 422 | No coordinates, or only one of `lat` and `lon` |
| 503 | `auto_describe=true` but no `VISION_API_KEY` is configured |
| 502 | The vision model call failed; nothing is stored |

### Read, update, delete

| Route | Notes |
|---|---|
| `GET /api/photos?limit=500&offset=0` | Newest first; the original file name is not published |
| `GET /api/photos.geojson` | Points for the map; photos linked to an `aggregate_only` record are displaced |
| `GET /api/photos/{id}/image`, `GET /api/photos/{id}/thumb` | The image and a JPEG thumbnail (longest side 400 px) |
| `PATCH /api/photos/{id}` | JSON with any of `description`, `lat`, `lon`, `taken_at`, `uploader`, `tenure_record_id` (null unlinks) |
| `POST /api/photos/{id}/describe` | Regenerate the AI caption |
| `DELETE /api/photos/{id}` | Delete the photo and its files |

```bash
curl -s -X PATCH $BASE/api/photos/PHOTO_ID -H "Authorization: Bearer $TENURE_API_TOKEN" \
  -H "Content-Type: application/json" -d '{"tenure_record_id": "RECORD_ID"}'
```

### AI captions

Captioning works with any OpenAI-compatible chat-completions endpoint that accepts images: set `VISION_API_KEY`, and optionally `VISION_API_URL`, `VISION_MODEL` and `VISION_PROMPT`. For a local model server that needs no key (for example Ollama or vLLM), set `VISION_API_KEY` to any placeholder and `VISION_API_URL` to the server's `/v1/chat/completions` URL. A downscaled copy of the photo (longest side 1024 px) is sent to that endpoint, so use a provider whose data handling you accept for your photos. Captioning is off by default.

## Configuration reference

All settings are environment variables (see `.env.example`).

| Variable | Default | Meaning |
|---|---|---|
| `TENURE_API_TOKEN` | empty | Bearer token for writes; empty disables writes |
| `DATA_DIR` | `/data` | Database, photos and thumbnails |
| `DB_PATH` | `$DATA_DIR/tenure.db` | SQLite database file |
| `SEED_SAMPLE` | `false` | Load the synthetic sample into an empty database |
| `SEED_FILE` | empty | Load this GeoJSON FeatureCollection into an empty database (takes precedence) |
| `VOCAB_PATH` | bundled `tenure_vocab.json` | Vocabulary file |
| `CORS_ORIGINS` | `*` | Comma-separated origins allowed to read cross-origin |
| `DATA_ATTRIBUTION`, `EXPORT_DESCRIPTION` | generic text | Written into exports |
| `FUZZ_MIN_METERS`, `FUZZ_MAX_METERS` | `250`, `1000` | Displacement range for `aggregate_only` records |
| `MAX_UPLOAD_MB` | `15` | Upload size limit |
| `STRIP_EXIF` | `true` | Remove photo metadata before storing |
| `VISION_API_KEY`, `VISION_API_URL`, `VISION_MODEL`, `VISION_PROMPT` | off | AI captions |

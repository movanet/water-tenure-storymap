# Data protection: publishing tenure data without causing harm

A water tenure map shows who uses water and on what terms. Some of those arrangements are informal, contested or outside the law, and the people who depend on them can be sanctioned, evicted, charged, pressured or shamed if a map points at them. Publishing should never leave the people who shared information worse off. This page sets out the rules this software supports and the decisions it leaves to you.

The software helps; it does not decide for you. The person who publishes a deployment is responsible for what it shows.

## Before anything is published

- **Consent.** Publish only what the people who provided the information agreed to see published, at the level of detail they agreed to. Record the consent terms per source in your catalogue (`sources.csv`: `anonymised`, `verifiability`, `reliability_notes`) so the importer can apply them. When the consent terms are unclear, treat the material as `aggregate_only` or leave it out.
- **Purpose.** Publish what the public needs to understand the tenure situation. Detailed evidence stays in the assessment team's private records.
- **Review.** Have someone who knows the area and the people read the site before it goes live, and again after each content change, asking: could anything here be used against someone?

## Rules for records

1. **No names of private persons.** Not in titles, descriptions, sources, story text or picture captions. Describe groups ("tail-end farmers of Corvel") and roles ("the customary steward"). Public officials acting in their official capacity and organizations may be named when that is necessary and fair.
2. **No quotes from respondents.** The public record carries a source code and locator (for example `INT-07 l.33`), never the quote. `quote_ref` is for a reference code into your private records. The catalogue importer never exports `quote_original`, `quote_translation`, respondent codes or GEDSI notes.
3. **No respondent codes that can be linked back to a person.** Use codes that mean nothing outside the team.
4. **Neutral wording.** Describe practices; do not label people. If a source calls a practice illegal, attribute that view to the source ("the agency considers the pumps unauthorized") rather than stating it as fact. Whether something is lawful is a legal question for a separate legal assessment, not for the map.
5. **Allegations are not findings.** Records graded `uncorroborated` (single accounts of wrongdoing, hearsay) are made `aggregate_only` by the importer. Consider leaving them out of the public map altogether.
6. **Mark sensitive records `aggregate_only`.** At least: informal, impossible, unrecognised and assumed tenure where users could be exposed; sacred, ritual or burial sites; anything involving a conflict, a complaint or an allegation; anything from a source with restricted consent. The shipped vocabulary already defaults `informal` and `unrecognised` records to `aggregate_only`; set `sensitivity_default` on other types in your vocabulary as your context requires.

## What `aggregate_only` does, and what it does not

It **does**:

- publish the record at a position displaced by 250 to 1000 metres (configurable with `FUZZ_MIN_METERS` and `FUZZ_MAX_METERS`), the same displacement on every request so repeated requests cannot average it out;
- replace polygons by a displaced point, so the shape is not published;
- apply the displacement to the `bbox` filter, so bounding-box queries cannot be used to find the true position;
- displace photos linked to the record in the same way;
- leave the record out of the CSV and GeoJSON exports;
- tell readers, in the popup, that the location was generalized.

It **does not**:

- hide the record's title, description, village, type, use, season or source line. Write them so that, together with the displaced point, they do not identify a household, a plot or a person;
- protect against someone who already knows the area well. In a small hamlet, "the only pump owner at the canal tail" is identifying wherever the point sits;
- remove the true coordinates from the server. The database keeps them, and anyone with server access or a backup can read them. Protect the server, the `.env` file and the backups accordingly.

If a record must not be public in any form, do not load it into a public deployment. Keep it in the private catalogue.

## Photos

- Get permission from people who appear in a photo, and prefer photos of infrastructure and landscapes. Do not publish photos in which people can be recognized without their informed consent; never publish photos of children without their guardians' consent.
- Keep `STRIP_EXIF=true` (the default). The API reads the GPS position and the capture date first, then stores the image without metadata such as GPS tags, camera serial numbers and owner names. The capture date is kept in the photo's `taken_at` field, which is public; clear it with a PATCH if the date itself is sensitive.
- The `uploader` field is public. Put a team code in it, not a person's name. The original file name is stored but not published.
- A photo's position is public unless it is linked to an `aggregate_only` record. Do not upload photos taken at a sensitive site without linking them to the sensitive record, or upload them with deliberately coarse coordinates.
- AI captions send a downscaled copy of the photo to the vision model provider you configure. Use a provider whose data handling you accept, or a local model server, or leave captioning off (the default). Review every generated caption before relying on it; the default prompt asks the model not to identify people, which is not a guarantee.

## Map layers, stories and the gallery

- Do not publish layers that locate individual households, plots, wells or people (for example a household survey point layer). Aggregate them to villages or grid cells first.
- Village boundaries and irrigation structures can be sensitive in some places (for example during a land dispute). Check before publishing.
- Story text, captions and the About page follow the same rules as records.

## Accounts, tokens and backups

- The write token gives full control over records and photos. Generate a long random token, keep it in `.env` only (never in git, chat messages or screenshots), and change it when someone leaves the team: edit `.env`, then `docker compose up -d`.
- Keep the API and the web app bound to `127.0.0.1` behind a TLS reverse proxy (the default).
- Backups contain the true coordinates and the original photos. Encrypt them or store them where only the team can read them, and delete old ones you no longer need.

## Corrections and removal

Publish a contact address on the About page and act on requests from people who are described on the site. To take a record down at once, delete it (or set it to `aggregate_only`) through the API; the public site reflects the change immediately. Remember that copies may already exist elsewhere (exports, caches, archives), which is another reason to publish carefully in the first place.

## Further reading

- FAO (2016). *Exploring the concept of water tenure*. Land and Water Discussion Paper 10. Rome: FAO.
- FAO (2024). *Water tenure perspectives*. Rome: FAO.
- The data-protection checks of the water-tenure-analysis skill: https://github.com/movanet/water-tenure-skills

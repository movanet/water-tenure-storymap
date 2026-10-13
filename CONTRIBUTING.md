# Contributing

Thank you for helping improve Water Tenure Storymap. Issues and pull requests are welcome.

## Before you start

- For anything larger than a small fix, open an issue first to agree on the approach.
- Never include real field data in issues, pull requests, tests or examples: no interview or focus group material, no names of private persons, no photos from fieldwork, no coordinates of real households or sensitive sites. Use or extend the synthetic Sample River Basin (`tools/make_sample_data.py`) instead.
- Never commit secrets (`.env`, tokens, API keys). `.env` is ignored by git; keep it that way.

## Development setup

See "Quick start without Docker" in the README. Then:

```bash
python -m pytest api/tests tools/tests
cd web && npm run lint && npm run build
```

All of these must pass before a pull request is merged.

## Conventions

- Keep the site data-driven: anything a deployer might want to change belongs in `web/content/` (with an English default in code), not in a component.
- New user-facing text goes through `t()` labels (`web/src/lib/site.ts` and `web/content/site.json`).
- If you change `api/app/data/tenure_vocab.json`, copy it to `web/src/data/tenure_vocab.json`.
- Keep the importer's command-line interface and the `/api/tenure-records` routes backward compatible; the companion skills in https://github.com/movanet/water-tenure-skills call them.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `chore:`).
- Documentation is plain, precise English, without emoji.

By contributing you agree that your contribution is released under the MIT License of this repository.

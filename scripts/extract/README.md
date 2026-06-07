# powerlay-extract

EVE Frontier static data extractor. See `docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md` for design.

## Install (one-time)

```bash
cd scripts/extract
python3.12 -m venv .venv
.venv/bin/pip install -e .[dev]
```

Add `scripts/extract/.venv/bin/` to PATH for the shell session, or activate with `source .venv/bin/activate`.

## Run

From the repo root:

```bash
pnpm extract:discover --build stillness
pnpm update-static-data --build stillness
```

See `package.json` for the full set of commands.

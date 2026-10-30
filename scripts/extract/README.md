# powerlay-extract

EVE Frontier static data extractor. See `docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md` for design.

## Install (one-time)

**macOS / Linux:**
```bash
cd scripts/extract
python3.12 -m venv .venv
.venv/bin/pip install -e .[dev]
```

Activate with `source .venv/bin/activate`, or add `scripts/extract/.venv/bin/` to PATH for the shell session.

**Windows (PowerShell):**
```powershell
cd scripts/extract
winget install Python.Python.3.12
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -e .[dev]
```

Activate with `.\.venv\Scripts\Activate.ps1`, or add `scripts\extract\.venv\Scripts\` to PATH for the shell session.

## Run

From the repo root:

```bash
pnpm extract:discover --build stillness
pnpm update-static-data --build stillness

pnpm run strip-data
```

See `package.json` for the full set of commands.

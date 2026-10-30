# Refreshing static data before a release

Before every release, refresh `data/raw/` from the local EVE Frontier install.

## Prereqs (one-time)

- Python 3.12 on PATH.
- Install the extractor:

  ```bash
  cd scripts/extract
  python3.12 -m venv .venv
  .venv/bin/pip install -e .[dev]
  ```

## Routine flow

From the repo root:

```bash
pnpm update-static-data --build stillness
```

The orchestrator:

1. Resolves the client install at `~/Library/Application Support/EVE Frontier/SharedCache/<build>/eve.app/Contents/Resources/build/` (macOS; ResFiles from `SharedCache/ResFiles`, falling back to the legacy `~/Library/Application Support/Frontier/SharedCache/ResFiles`) or `C:\CCP\EVE Frontier\<build>\stillness\` (Windows).
2. Extracts every registered target into `data/extracted/<build>-<server>-<ts>/raw/`.
3. Validates the run; writes `validation-report.json`.
4. Prompts before moving the previous `data/raw/` to `data/raw.bak.<ts>/` and promoting the new files in.

After promote, run `pnpm strip-data` to produce `data/stripped/` for the app build.

## Targets currently extracted

| Target | Resource | Output |
|---|---|---|
| types | res:/staticdata/types.fsdbinary | raw/types.json |
| groups | res:/staticdata/groups.fsdbinary | raw/groups.json |
| industry_blueprints | res:/staticdata/industry_blueprints.fsdbinary | raw/industry_blueprints.json |
| industry_facilities | res:/staticdata/industry_facilities.fsdbinary | raw/industry_facilities.json |
| solarsystems | res:/staticdata/systems.static + systems.schema; if absent (Oct 2026+ clients) — `Map/SolarSystems` labels from localization_fsd_main.pickle (names only, no topology) | raw/solarsystems.json |
| spacecomponents | res:/staticdata/spacecomponentsbytype.fsdbinary | raw/spacecomponentsbytype.json |
| icons | res:/staticdata/iconids.fsdbinary + per-icon files | raw/icons/*.png |
| ecosystem | res:/staticdata/ecosystem.fsdbinary | raw/ecosystem.json |
| systemstate | res:/staticdata/systemstate.fsdbinary | raw/systemstate.json |

## Client data changes (Oct 2026 update)

- **Python 3.12 still required.** CCP loaders in `bin64/` are built against CPython 3.12. If Homebrew drops `python@3.12`, reinstall it and recreate `scripts/extract/.venv`.
- **Ores** moved from `* Ores` groups (5012–5020, now empty) to `* Regoliths` groups (5144–5148). `strip-data` matches both name patterns.
- **Structure recipes** moved from `assemblyConstruction` (now empty) to `smartDeployable.constructionCost` on the structure type itself. `strip-data` reads both, new format wins.
- **Solar systems:** `systems.static` is gone; the client streams the map from the server. Only names are available (via localization labels). ~97k labels are unnamed placeholders (text == ID) and are dropped.

## When something fails

| Symptom | What to do |
|---|---|
| `No EVE Frontier client found` | Pass `--client-path /path/to/Resources/build` explicitly, or check that the launcher has finished downloading the build. |
| Validation `fail` with broken joins | Open `data/extracted/<run>/validation-report.json`. The likely cause is a patch that renamed/dropped typeIDs. Compare against the previous `manifest.json` (rolling backup in `data/raw.bak.<prev-ts>/`). |
| Loader crash on Windows | The CCP loader needs `libpython3.12.dylib` (macOS) / `python312.dll` (Windows) discoverable. The pipeline sets `DYLD_LIBRARY_PATH` automatically on macOS. On Windows, ensure Python 3.12's `libs/` is on PATH. |
| You need to verify what's in the client without extracting | `pnpm extract:discover --build stillness --out /tmp/d.json`, then read it. |

## Running individual stages

```bash
pnpm extract:discover --build stillness --out /tmp/d.json
pnpm extract:run --build stillness --target types --target groups
pnpm extract:validate data/extracted/<run-dir>
pnpm extract:promote data/extracted/<run-dir>
```

## How loader access works

On macOS, the CCP loader `.so` modules in client's `bin64/` are linked against a `@rpath/libpython3.12.dylib` that no longer resolves (build-server-only rpath). The pipeline:

1. Sets `DYLD_LIBRARY_PATH` to the host Python's `LIBDIR` via `extract.loader.ensure_dyld_env_or_reexec()` (re-execs once if missing).
2. Copies each requested loader to a temp dir before importing — without a `bin64`-shaped neighbor, dyld falls back to `DYLD_LIBRARY_PATH` and reuses our process's libpython.

The solarsystems target reads `systems.static` + `systems.schema` via `fsd.schemas.binaryLoader` from `code.ccp` (pure Python, no native loader needed).

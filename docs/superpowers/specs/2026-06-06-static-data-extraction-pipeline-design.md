# Static Data Extraction Pipeline — Design

**Date:** 2026-06-06
**Author:** brainstormed with Claude (Opus 4.7)

## 1. Goal

Reliably refresh the raw static game data in `data/raw/` before each release, by extracting it directly from a locally installed EVE Frontier client. The pipeline replaces the current "obtain raw files separately" workflow described in `data/raw/README.md`. Downstream scripts (`scripts/strip-data.js`, `scripts/types-name-id.js`) continue to consume `data/raw/` unchanged.

Non-goals:
- Live server/runtime data (markets, ownership, spawns) — out of scope.
- Continuous/automatic extraction — manual pre-release run is sufficient.
- Coverage beyond the files `strip-data.js` and `types-name-id.js` currently read. Architecture is extensible; broader coverage is a later iteration.

## 2. Constraints and decisions

| Decision | Choice | Reason |
|---|---|---|
| Runtime | Python 3.12 | Handbook §4; CCP `.pyd`/`.so` loaders are bound to 3.12 ABI. |
| Platforms | macOS + Windows (where game is installed) | User runs on both; client install detected at runtime. |
| Scope | Currently-needed files + extensible registry | Match `strip-data.js` input set: `types`, `groups`, `industry_blueprints`, `industry_facilities`, `solarsystems`, `spacecomponentsbytype`, plus icons directory. |
| Discovery | Full handbook §7 pipeline (discover → extract → validate → promote) | User chose explicit ceremony; release-blocking validity matters. |
| Output strategy | Timestamped run directory + manual promote | Handbook §3, §7.7: never overwrite a previous run until the new one is validated. |
| Build separation | Mandatory `--build {stillness,utopia}` | Two client environments per `packages/move/Published.toml`; static data may diverge. |
| macOS extract | Best-effort; if loaders unavailable, fall back to Windows | Pragmatic — handbook is Windows-first but we explore macOS feasibility. |
| Validate | Separate module gating promote | Re-runnable without re-extract; release safety net. |
| Manifest | Minimal manifest written per run | Enables "which client build produced this data" diagnosis after a regression. |
| Probe | Folded into `discover.py --probe <res-path>` | YAGNI a separate CLI; same functionality, fewer entry points. |

## 3. Architecture

### 3.1 File layout

```
scripts/extract/
  __init__.py
  paths.py                # ClientRoot resolution (Windows + macOS)
  resindex.py             # parser for resfileindex.txt
  loader.py               # lazy wrappers around .pyd / .so loaders
  manifest.py             # ExtractManifest dataclass + IO
  targets/
    __init__.py           # REGISTRY: { name -> module }
    types.py
    groups.py
    industry_blueprints.py
    industry_facilities.py
    solarsystems.py
    spacecomponents.py
    icons.py
  discover.py             # CLI: discover + optional --probe
  extract.py              # CLI: extract --target/--all -> run-dir
  validate.py             # CLI: run-dir -> validation-report.json
  promote.py              # CLI: run-dir -> data/raw/
  update_static_data.py   # orchestrator
  tests/
    fixtures/             # synthetic mini-client trees for unit tests
    ...
```

### 3.2 CLI surface

Exposed through `pnpm` scripts in root `package.json`:

```
pnpm extract:discover --build stillness [--json] [--probe <res-path>]
pnpm extract:run --build stillness [--target <name> | --all]
pnpm extract:validate <run-dir>
pnpm extract:promote <run-dir>
pnpm update-static-data --build stillness [--yes]
```

`update-static-data` is the happy-path command. Individual stages remain available for debugging.

`<name>` in `--target <name>` is any key present in `targets/__init__.REGISTRY` (initial values: `types`, `groups`, `industry_blueprints`, `industry_facilities`, `solarsystems`, `spacecomponents`, `icons`).

### 3.3 Component contracts

**`paths.ClientRoot`** — dataclass:
```python
@dataclass(frozen=True)
class ClientRoot:
    build: Literal["stillness", "utopia"]
    server: str               # e.g. "stillness.servers.evefrontier.com"
    root: Path                # platform-specific install root
    stillness_dir: Path       # the "stillness" subdir (regardless of build name)
    resfiles_dir: Path        # ResFiles location
    bin_dir: Path | None      # bin64 / equivalent if present
    platform: Literal["darwin", "win32"]
```

`paths.resolve(build, override=None) -> ClientRoot` raises `ClientNotFound` with platform-specific guidance if nothing usable found.

**`resindex.parse(path) -> dict[str, IndexEntry]`** — IndexEntry = `(hash_path, file_hash, offset, size)`.

**`loader.get(name) -> LoaderModule | None`** — lazy import, returns `None` if `.pyd`/`.so` missing on current platform. Caches positive imports.

**`targets/<name>.py`** — each module exports:
```python
NAME: str
REQUIRED_RESOURCES: list[str]       # logical res:/... paths
OPTIONAL_RESOURCES: list[str]
OUTPUT_FILENAME: str                # e.g. "types.json"
DEPENDS_ON: list[str] = []          # other target names that must run first

def is_available(client: ClientRoot) -> AvailabilityResult: ...
def extract(client: ClientRoot, run_dir: Path) -> ExtractResult: ...
def validate(client: ClientRoot, run_dir: Path) -> list[ValidationIssue]: ...
```

`targets/__init__.REGISTRY: dict[str, ModuleType]` enumerates them. Adding a new target = new module + one line in registry. Extract runs targets in topological order over `DEPENDS_ON`.

**`manifest.ExtractManifest`**:
```json
{
  "build": "stillness",
  "server": "stillness.servers.evefrontier.com",
  "clientRoot": "/Users/.../SharedCache/stillness/eve.app/Contents/Resources/build/...",
  "extractedAt": "2026-06-06T16:42:11Z",
  "pythonVersion": "3.12.4",
  "platform": "darwin",
  "scriptVersion": "git:5dcd3af",
  "targets": {
    "types": {"sourceHash": "...", "sourcePath": "res:/staticdata/types.fsdbinary", "rowCount": 47812, "status": "ok"},
    "icons": {"status": "skipped", "reason": "icons dir missing"}
  }
}
```

### 3.4 Run directory shape

```
data/extracted/<build>-<server-version>-<YYYYMMDD-HHMMSS>/
  discovery-report.json
  raw/
    types.json
    groups.json
    industry_blueprints.json
    industry_facilities.json
    solarsystems.json
    spacecomponentsbytype.json
    icons/                       # directory if extracted
  manifest.json
  validation-report.json         # written by validate.py
  extract.log
```

`server-version` is best-effort: parsed from client metadata if available, otherwise `unknown`.

### 3.5 Promote behavior

`promote.py <run-dir>`:
1. Refuses if `validation-report.json` is missing or status ≠ `pass`.
2. If `data/raw/` exists, renames it to `data/raw.bak.<YYYYMMDD-HHMMSS>/`. If a backup with that name already exists, suffixes `.<n>`.
3. Old backups beyond the latest one are deleted (rolling single backup).
4. Copies `<run-dir>/raw/*` into `data/raw/`.
5. Writes `data/raw/.source.json` = `{runDir, manifest, promotedAt}`.

## 4. Data flow

```
[macOS / Windows installed client]
       │ (read-only)
       ▼
discover.py     → discovery-report.json
       │
       ▼
extract.py      → data/extracted/<build>-<server>-<ts>/
       │            raw/*.json
       │            manifest.json
       │
       ▼
validate.py     → validation-report.json   (pass / fail / warnings)
       │ pass only
       ▼
promote.py      → data/raw/                          ← consumed by strip-data.js
                  data/raw.bak.<prev-ts>/            (rolling single backup)
                  data/raw/.source.json
       │
       ▼
pnpm strip-data → data/stripped/* → app build
```

Invariant: `data/raw/` always reflects exactly one validated run of one build. Provenance lives in `.source.json`.

## 5. Targets

Each target's required resource and loader are **hypotheses** until `discover.py` confirms them on the current client. If a path or loader name changes between patches, only the corresponding target module is edited.

| Target | Likely resource | Loader / format | Output shape (matches current `data/raw/`) |
|---|---|---|---|
| `types` | `res:/staticdata/types.fsdbinary` | `typesLoader.pyd` (or platform equivalent) | `{ "<typeID>": { typeID, typeName_en-us, groupID, marketGroupID, mass, volume, capacity, basePrice, iconID, descriptionID, published, ... } }` |
| `groups` | `res:/staticdata/groups.fsdbinary` | `groupsLoader.pyd` | `{ "<groupID>": { groupID, categoryID, groupName_en-us, anchorable, published, ... } }` |
| `industry_blueprints` | `res:/staticdata/industry/industry_blueprints.fsdbinary` | `industryBlueprintsLoader.pyd` | `{ "<bpID>": { primaryTypeID, runTime, inputs:[{typeID,quantity}], outputs:[{typeID,quantity}] } }` |
| `industry_facilities` | `res:/staticdata/industry/industry_facilities.fsdbinary` | loader from bin64 | `{ "<facilityTypeID>": { blueprints:[{blueprintID,maxInputRuns,maxOutputRuns}], inputCapacity, outputCapacity } }` |
| `solarsystems` | `res:/staticdata/universe/...` or `starmapcache.pickle` | pickle / fsd | array `[{id, name, constellationId, regionId, location}]` |
| `spacecomponentsbytype` | `res:/staticdata/spacecomponentsbytype.fsdbinary` | loader | `{ "<typeID>": { assemblyConstruction: { constructedItem, inputItems:{...} } } }` |
| `icons` | icon asset directory (PNG/DDS) | raw copy | files `data/raw/icons/<typeID>.png` |

## 6. Error handling

| Failure | Where | Behavior |
|---|---|---|
| Client root not found | `paths.resolve` | Exit with platform-specific search-path list + `--client-path` hint. |
| Python ≠ 3.12 | `extract.py` startup gate | Exit; loader ABI mismatch is unsafe. |
| `.pyd` / `.so` loader unavailable on this platform | `loader.get` | Target marked unavailable. Discover reports it. Extract skips with warning; orchestrator surfaces it and `validate` fails if any required target was skipped. |
| Resource missing from index | target `extract()` | Target's `ExtractResult` = error; manifest marks `status: "fail"`. Pipeline does not block other targets; validate fails overall. |
| Patch changed schema — added field | target `validate()` | `warnings` (non-blocking). |
| Patch changed schema — removed required field | target `validate()` | `errors` (blocking). |
| Broken join (e.g. blueprint references unknown typeID) | target `validate()` | `errors` (blocking). |
| `promote.py` on a run with no `validation-report.json` or failed validation | `promote.py` | Refuse, exit 1. |
| Backup name collision | `promote.py` | Append `.<n>` suffix; continue. |
| Ctrl-C in orchestrator | `update_static_data.py` | Preserve run-dir on disk so user can resume with `extract.py --resume <run-dir>`. |

## 7. Testing strategy

Tests catch regressions in the **scripts**, not in client data (client is uncontrolled, patches make live-client tests flaky).

- **Unit tests:**
  - `resindex.parse` against fixture index file with edge cases (comments, empty lines, missing fields).
  - `paths.resolve` with mocked filesystem (each platform branch).
  - `manifest.ExtractManifest` round-trip serialisation.

- **Integration tests with golden fixtures:**
  - `scripts/extract/tests/fixtures/mini-client/` — synthetic minimal client tree (5–10 types, 2 groups, 1 blueprint).
  - Per-target test: run `extract` against fixture, diff JSON output against snapshot.

- **Validation tests:**
  - Hand-crafted "bad" run dirs (broken join, missing field, empty file) → assert validator flags each.

- **End-to-end smoke (manual):**
  - `docs/static-data-extraction.md` checklist: how to run pre-release, what to eyeball in `validation-report.json` before promoting.

- **No live-client tests in CI.** Client may be absent in CI and patches break fixtures.

## 8. Open questions / risks

| Item | Risk | Mitigation |
|---|---|---|
| macOS loader availability | `.pyd` is Windows-only; macOS may ship `.so` or nothing. Extract on Mac may not work at all. | `discover.py` reports honestly; orchestrator falls back to "run on Windows" instruction. Spec accepts this as best-effort. |
| Exact resource paths / loader names | Hypotheses until first discover run. Patches may move them. | Discover surfaces actual paths. Each target module owns one path; cheap to update. |
| Icons size | The icons directory could be large; copying every release inflates `data/raw/`. | Icons target is optional and runs **after** `types` so it can read the run's `raw/types.json` and copy only icons referenced by an extracted type's `iconID`. Run-order dependency declared in `targets/icons.py` via a `DEPENDS_ON = ["types"]` field; orchestrator topo-sorts. |
| `industry_blueprints` JSON size | Current shape works; extraction must preserve it. | Snapshot test against the existing `data/raw/industry_blueprints.json` shape as the contract. |
| `data/` is in `.gitignore` | Extracted runs accumulate locally. | `update_static_data` keeps last 3 runs in `data/extracted/`, prunes older. |

## 9. Out of scope

- Localization pickle extraction.
- Dogma / categories / marketgroups.
- Star-map topology beyond what `solarsystems` needs.
- Cross-build diffing (compare stillness vs utopia static data).

All deferrable to later iterations under the same target-registry pattern.

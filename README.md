# Powerlay Frontier

Desktop companion app for EVE Frontier. Phase 1: Tribe TODO overlay, mock build/mining engine, and desktop dashboard.

**Community tool — not affiliated with CCP Games.** All game-related names, images, and assets are trademarks and/or copyrights of CCP hf.

## Developer Setup

- Node 18+
- pnpm (or enable with `corepack enable`)

```bash
pnpm install
```

## Game data (required for Builder features)

The `data/` folder is in `.gitignore` (game data is large and not shared publicly). Developers need to obtain these files and place them as follows:

| File | Directory | Required | Notes |
|------|-----------|----------|-------|
| `types.json` | `data/stripped/` | **Yes** | Item types (typeID → name, volume, etc.). Either receive this file from API/game data, or receive `data/raw/types.json` and run `pnpm strip-types` to generate it. |
| `industry_blueprints.json` | `data/raw/` | **Yes** | Industry blueprints (inputs/outputs, runTime). Place directly; no processing needed. |
| `solarsystems.json` | `data/stripped/` | No | Star system names for live search in the Tracking tab. Place `data/raw/solarsystems.json` (array of `{id, name, ...}`) and run `pnpm strip-solarsystems` to generate it. If missing, the star system field is a free-text input. |

**Directory layout:**
```
data/
  raw/
    industry_blueprints.json   ← required
    types.json                 ← optional (only if you run strip-types yourself)
    solarsystems.json          ← optional (only if you run strip-solarsystems yourself)
  stripped/
    types.json                 ← required (from from pnpm strip-types)
    solarsystems.json          ← optional (from pnpm strip-solarsystems; enables star system live search)
```

Without these files, the Builder tab will show a "Types loaded but empty" or "File not found" error.

## Scripts

- **`pnpm dev`** — Start desktop UI (Vite :5173), overlay UI (Vite :5174), then Electron. Use "Toggle overlay" in the desktop to show/hide the overlay.
- **`pnpm build`** — Build all packages.
- **`pnpm build:portable`** — Build all packages and produce a Windows portable executable (no installer). Output is in `dist/`.
- **`pnpm test`** — Run tests (core package).
- **`pnpm lint`** — Lint all packages.
- **`pnpm strip-types`** — Generate `data/stripped/types.json` from `data/raw/types.json`.
- **`pnpm strip-solarsystems`** — Generate `data/stripped/solarsystems.json` from `data/raw/solarsystems.json` (names only, for star system live search in Tracking tab).

## Structure

- `packages/core` — Pure logic (mining/build engine mock, Tribe TODO types and helpers). No Electron/React.
- `packages/ui-desktop` — Main dashboard (Tribe TODO CRUD, build/mining placeholder).
- `packages/ui-overlay` — Transparent overlay panel (Tribe TODO list, status updates).
- `packages/electron-shell` — Main process, preload, IPC, JSON persistence for TODOs.

## Safe Overlay Philosophy

This app does not automate gameplay, read process memory, or inject into the game.

## License

[MIT](LICENSE)

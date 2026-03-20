# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Powerlay Frontier is a community Electron desktop app for EVE Frontier (a blockchain MMO space game). It provides a dashboard for production planning and a transparent overlay system for in-game use. The app has a strict "safe" philosophy: no automation, no memory injection, no process manipulation.

## Commands

### Development
```bash
pnpm dev          # Start all three processes concurrently: desktop UI (:5173), overlay UI (:5174), Electron
```

### Build
```bash
pnpm build              # Build all packages
pnpm build:portable     # Build Windows portable executable
```

### Test & Lint
```bash
pnpm test               # Run all tests (Vitest)
pnpm lint               # Lint all packages

# Run tests for a specific package
pnpm --filter @powerlay/core test
pnpm --filter @powerlay/core test:watch
```

### Data Scripts
```bash
pnpm strip-data    # Strip game data (types.json, industry_blueprints.json) for distribution
pnpm types-name-id # Generate type name/ID mappings
```

## Architecture

This is a **pnpm workspace monorepo** with four packages:

### `packages/core` (`@powerlay/core`)
Pure TypeScript business logic with no UI or Electron dependencies. Consumed by both React apps.
- `build/` — Production calculations, blueprint/ingredient tree resolution, game data loading
- `mining/` — Mining engine types and logic
- `tribe-todo/` — TODO data structures
- `log/` — EVE game log parsing and timestamp handling

### `packages/ui-desktop`
React 18 + Vite app (port 5173) for the main dashboard window. Tabs: Builder (production planning, ingredient trees, mining tracking) and TODO (tribe task coordination). Communicates with Electron via `window.efOverlay` (defined in `preload.d.ts`).

### `packages/ui-overlay`
React 18 + Vite app (port 5174) for transparent in-game overlay panels. Uses `overlayRegistry.tsx` to route overlay types to components. Overlays are separate Electron windows with click-through support.

### `packages/electron-shell`
Electron main process (built with esbuild). Responsibilities:
- Multi-window management (main desktop + overlay windows)
- IPC handlers in `src/ipc/` for TODOs, builds, mining, game data, settings, logs
- Overlay bounds persistence (`userData/Powerlay/overlay-bounds.json`)
- Mining log file tailing (`src/log/`)
- Tray integration and system tray menu

## Key Data Flow

1. Game data (`data/raw/types.json`, `data/raw/industry_blueprints.json`) → `strip-data` script → `data/stripped/` → loaded by `@powerlay/core` at runtime
2. EVE game logs → `electron-shell` log tailer → IPC → UI mining tracking
3. User actions in `ui-desktop` → `window.efOverlay` IPC bridge → `electron-shell` handlers → `@powerlay/core` logic → IPC response back to UI
4. Overlay windows (`ui-overlay`) are spawned by `electron-shell` and communicate via the same IPC bridge

## Tech Stack

- **Electron** 28, **React** 18, **TypeScript** 5.3, **Vite** 5
- **Tailwind CSS** 4.2 (dark theme throughout)
- **Vitest** for testing (tests only in `packages/core`)
- **esbuild** for bundling the Electron main process
- Node 18+, pnpm 9+

## Game Data Requirements

The `data/` directory is gitignored. For development you need:
- `data/raw/types.json` — EVE item type definitions
- `data/raw/industry_blueprints.json` — Blueprint/recipe data

Run `pnpm strip-data` to generate `data/stripped/` versions used at runtime.

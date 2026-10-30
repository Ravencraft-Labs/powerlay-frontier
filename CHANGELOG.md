# Changelog

All notable changes to Powerlay Frontier will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Scout: system reports with planets, spectral class, transient mass and infestation index.
- Scout: SETTLED / DEVASTATED badge for the current system.
- Scout: quick-mark sites now come from game data, including the Cycle 7 sites.
- Builder: each ore shows which asteroids to mine it from, in the app and the build overlay.
- Builder: crafting steps after mining (refining, components, final items) with progress you enter; the current step moves on when it is done, and the build overlay shows it.
- Builder: free builds — track any planned items by hand (e.g. 1000 cans) without mining or recipe steps.
- Build overlay: item icons, a "?" toggle for where-to-mine hints, done checkboxes synced with the app, and step switching.
- Map (POC): travel log from LogLite — every system change of the game session with how it happened (NPC stargate, deployable gate, ship jump, respawn); deployable gates show their owner and tribe from the chain, or "not on chain" for catapults and server gates.
- Map (POC): the previous system and this session's path are drawn on the map and the mini-map.
- Map (POC): "Read LogLite" stays on after a restart.
- Map (POC): connections are coloured and filterable by kind (NPC stargates, player gates — optionally only your tribe's — catapults / server gates); several connections between two systems are drawn side by side and listed per neighbour.
- Map (POC): gate owners are looked up in the Cycle 7 world package too, so catapults (Mini / Heavy Catapult) show their owner and get their own colour and filter.
- Map (POC): scout a gate or catapult without jumping — copy its assembly id and destination link from its info window; it is added as a dashed connection from the current system.
- Map (POC): mark dormant NPC stargates (need restoration) by destination name, depot title or link; drawn dotted, cleared when you jump through.
- Scout overlay: quick marks are grouped under zone headings; the list with "depleted" buttons is gone (click a marked site again to clear it). Zone blocks are tinted with the zone colour; the half-circle button in the header turns that off.
- Scout overlay: "Gate / catapult" and "Dormant gate" buttons put gates on the map from in game (via the clipboard); gate scouting from copied info also works while only the Scout overlay is open.
- Gate location mini-overlay: pops up after a jump through a deployable gate (or scouting one) for that gate and asks where it stands — planet and Lagrange point ("P2L4"), the planet or the star; hides once answered, ✎ in the Scout overlay reopens it. Shown in the travel log and on the connection.
- Dev: `pnpm dev` mirrors the game client's LogLite stream to `data/loglite/live/client*.tsv` (rotated, 1 GB max) while "Read LogLite" is on.
- Tabs: dragging a tab shows where it will land; the overlay bar lists its buttons in the same order as the tabs.
- Overlay bar: an in-game strip to show, hide and lock the Scout, Contracts, Map and build overlays without switching to the app; the eye hides all open overlays and brings them back. Open it from the header ("Overlay bar") or the tray menu; it reopens on the next launch.

### Changed

- Electron 28 → 44 (Node 18 → 24): plugins can use built-in `node:sqlite`.
- Blockchain: Stillness now uses the Cycle 7 world package. All chain addresses live in one place (`packages/core/src/chain/worlds.ts`); a saved Cycle 6 world package setting is moved to the current one.
- Map (POC): the LogLite feed shows only client connection, jumps and new connections, and the side panels scroll instead of stretching the window.

### Fixed

- Builder: ore cost counts every ore type, and ores are no longer expanded into salvage recipes.
- Scout: with LogLite connected, the current system comes from the game session instead of the Local chat log, which can miss a system change.
- Scout: rift quick marks are the real Cycle 7 rifts (Age/Texture/Level, e.g. Old/Fine/High, with what they refine into) instead of placeholder "Rift 0020" names.

---

## [0.1.7] - 2026-03-31

### Added

- Contracts are now available in Powerlay.
- You can sign in with EVE Vault and stay logged in.
- You can switch the app between Stillness and Utopia from Settings.

### Changed

- Contract setup is simpler and easier to use.
- Settings are cleaner and easier to understand.

### Fixed

- Better error messages in contracts.
- Fixed issues with connecting storage, especially on Stillness.
- Fixed contract draft saving and token balance display.
- Closing the app from the window or tray now works properly.

---

## [0.1.6] - 2026-03-18

### Added

- **Multiple build overlays** - Open a separate overlay for each build using the eye icon in the sidebar. Each overlay stays on its own build even when you switch between builds in the app.
- **One build tracks at a time** - When you press Play on a build, any other build's mining tracking pauses. You can switch which build is tracking from the desktop or from any overlay.
- **Overlay placement** - New overlays open below the last one, or centered on screen if there's no room.
- **Collapsible ingredient tree** - Collapse or expand sections of the production tree. Use "Expand all" or "Collapse all" to quickly show or hide details.
- **Paste from EVE** - Right-click paste in Star system and planned items fields. If you copy from the game (e.g. item links), the app extracts the item name for you.
- **Smarter ore detection** - Mining tracking and overlays now focus on mineable ores (e.g. Feldspar Crystals, Platinum-Palladium Matrix) and ignore NPC loot (e.g. Rogue Drone Components, Minerals).

### Changed

- **Total frame** - Laser lenses, fuel, and time calculations moved to the right of building resources for clearer layout.
- **Production graph** - Tree connectors and network graph labels are easier to see (thicker lines, better contrast).
- **Tree list** - No vertical scroll; the list grows with content. Horizontal scroll kept for wide trees.
- **Blueprint dropdown** - Added a chevron (`▼`) so it's clear the field is a dropdown.
- **Mining materials** - Mining tracking and build overlay now only show ore types, not other materials.

### Fixed

- Dropdown menus no longer overlap item icons below them.
- Duplicate solar systems removed from the Star system search dropdown.

---

## [0.1.5] - 2026-03-17

### Added

- Lock and close buttons on all overlays when you unlock them.
- Play/Pause mining button on the Build overlay (when unlocked), in sync with the desktop mining panel.

### Changed

- New builds are named "Build #1", "Build #2", etc. by default (next free number).
- Locked overlays hide all buttons (lock, close, play/pause) so you can't accidentally click them.
- Build overlay still shows "Tracking" or "Paused" when locked; only the button is hidden.

### Fixed

- Overlay window size now matches its content exactly; no invisible area blocking game clicks.

---

## [0.1.4] - 2025-03-11

### Added

- Facility names shown next to blueprint options in the production graph.
- "Only my facilities" toggle to filter blueprints by the facilities you've added.
- Manufacturing facilities dropdown uses real game data.
- Solar systems loaded from game files.

### Changed

- Blueprint dropdown widened; facility names truncate with full text on hover.

### Fixed

- Build failure when packaging the app.

---

## [0.1.3] - 2025-03-16

### Added

- Build tracking overlay showing production and mining progress.
- Overlay lock toggle (click-through mode) so the overlay doesn't block game clicks when locked.
- Help labels ("?") on Mining tracking, Production, Total, and Production graph with usage tips.

### Changed

- Scrollbars styled to match the app's dark theme.

### Fixed

- Overlay now stays above other windows.

---

## [0.1.0] - 2025-03-11

### Added

- Tribe TODO overlay for task coordination.
- Builder tab for production planning.

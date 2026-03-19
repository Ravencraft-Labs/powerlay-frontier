# Changelog

All notable changes to Powerlay Frontier will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

- App now closes properly when clicking the window close button (X) or choosing Quit in the tray menu

---

## [0.1.6] - 2026-03-18

### Added

- **Multiple build overlays** – Open a separate overlay for each build using the eye icon in the sidebar. Each overlay stays on its own build even when you switch between builds in the app.
- **One build tracks at a time** – When you press Play on a build, any other build’s mining tracking pauses. You can switch which build is tracking from the desktop or from any overlay.
- **Overlay placement** – New overlays open below the last one, or centered on screen if there’s no room.
- **Collapsible ingredient tree** – Collapse or expand sections of the production tree. Use “Expand all” or “Collapse all” to quickly show or hide details.
- **Paste from EVE** – Right‑click paste in Star system and planned items fields. If you copy from the game (e.g. item links), the app extracts the item name for you.
- **Smarter ore detection** – Mining tracking and overlays now focus on mineable ores (e.g. Feldspar Crystals, Platinum‑Palladium Matrix) and ignore NPC loot (e.g. Rogue Drone Components, Minerals).

### Changed

- **Total frame** – Laser lenses, fuel, and time calculations moved to the right of building resources for clearer layout.
- **Production graph** – Tree connectors and network graph labels are easier to see (thicker lines, better contrast).
- **Tree list** – No vertical scroll; the list grows with content. Horizontal scroll kept for wide trees.
- **Blueprint dropdown** – Added a chevron (▼) so it’s clear the field is a dropdown.
- **Mining materials** – Mining tracking and build overlay now only show ore types, not other materials.

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
- Locked overlays hide all buttons (lock, close, play/pause) so you can’t accidentally click them.
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
- Overlay lock toggle (click-through mode) so the overlay doesn’t block game clicks when locked.
- Help labels ("?") on Mining tracking, Production, Total, and Production graph with usage tips.

### Changed

- Scrollbars styled to match the app’s dark theme.

### Fixed

- Overlay now stays above other windows.

---

## [0.1.0] - 2025-03-11

### Added

- Tribe TODO overlay for task coordination.
- Builder tab for production planning.

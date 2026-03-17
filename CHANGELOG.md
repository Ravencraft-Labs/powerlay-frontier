# Changelog

All notable changes to Powerlay Frontier will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added


### Changed


### Fixed



---

## [0.1.5] - 2025-03-11

### Added

- Lock and close buttons on all overlay frames (when unlocked)
- Mining play/pause button on Build overlay when unlocked, synced with desktop mining frame

### Changed

- New builds default to "Build #1", "Build #2", etc. (next number not used by existing default-named builds)
- Locked overlays hide all interactive buttons (lock, close, play/pause, status dropdowns) to avoid confusion
- Build overlay shows "Tracking"/"Paused" label even when locked (play/pause button hidden when locked)

### Fixed

- Overlay window now exactly matches visible content size; invisible area no longer blocks game clicks; resizing disabled

---

## [0.1.4] - 2025-03-11

### Added

- Facility names on blueprint options in production graph (from industry_facilities.json)
- "Only my facilities" toggle to filter blueprints by added manufacturing facilities
- Manufacturing facilities dropdown wired to real game data (industry_facilities.json)
- industry_facilities.json documentation in data/raw/README.md
- Solar systems are now wired to the game files

### Changed

- Facility type is now dynamic (string) from game data; validation accepts any non-empty string
- Blueprint dropdown widened (min 320px) with facility names truncating and full text on hover

### Fixed

- Build failure: removed deprecated `win.sign` from electron-builder config (invalid in electron-builder 26.x)

---

## [0.1.3] - 2025-03-16

### Added

- Build tracking overlay with production and mining progress
- Overlay lock toggle (click-through mode) with Lock button in desktop UI
- Themed scrollbars matching app dark theme (8px, border colors, rounded)
- Log file limiting: single-file trim at 2000 lines, keep 1500 (user-friendly, no rotation clutter)
- Help labels ("?") on Mining tracking, Production, Total, and Production graph frames with usage and reading tips


### Changed


### Fixed

- Overlay not above other windows



---

## [0.1.0] - 2025-03-11

### Added

- Tribe TODO overlay for task coordination
- Initial Builder tab to support production

### Changed


### Fixed

- (none yet)

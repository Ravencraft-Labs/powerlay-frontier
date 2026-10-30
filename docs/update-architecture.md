# App Update Architecture

Internal architecture note for how Powerlay Frontier builds are released and how the app updates itself.
Status: decisions recorded, implementation not started.

Reference: the release flow of [storytold/lightcraft](https://github.com/storytold/lightcraft) and the
updater in [storytold/craft-launcher](https://github.com/storytold/craft-launcher) (`crates/native/src/self_update.rs`).

## Decisions

### 1. Releases are created as drafts and published manually

- CI builds every platform and creates (or updates) a **draft** GitHub Release `Powerlay Frontier v<version>`,
  targeted at the commit that triggered the run.
- A maintainer reviews the draft (assets, checksums, notes from `CHANGELOG.md`) and publishes it by hand.
- Draft releases are invisible to the updater, so nothing reaches users until it is published.
- CI replaces assets on an existing draft, but **stops** instead of overwriting an already published
  release: bump the version before producing another one.
- Versions containing a hyphen (`0.2.0-beta.3`) are marked as prereleases.

### 2. Every release ships `SHA256SUMS.txt`

- The release job computes SHA-256 for the complete asset set and attaches `SHA256SUMS.txt`
  (`<sha256>  <file name>` per line, `sha256sum` format).
- The updater verifies every downloaded file against it before installing; a mismatch discards the download.
- Download URLs are accepted only under `https://github.com/Ravencraft-Labs/powerlay-frontier/releases/download/`.
- This sits on top of electron-updater's own `sha512` check in `latest*.yml`, and also covers manual
  downloads and any non-electron-updater path (macOS without signing, portable).

### 3. Update-loop protection

Failure mode: a release whose binary reports the wrong version (forgotten bump, stale build) makes the app
update, restart, see "update available" again, and loop.

- Before restarting into an update, the app writes a marker to `userData` with the version (tag) it just installed.
- On start, if the marker matches the release offered as latest, that release is **not** offered again,
  even if the running binary reports an older version. The marker is cleared after one run.
- A development / unpackaged build (`!app.isPackaged`) never updates itself.

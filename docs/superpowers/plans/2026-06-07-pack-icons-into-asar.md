# Pack icons into app.asar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ~16 600 icon PNGs from electron-builder's `extraResources` (loose files) into the app's `files` glob so they get packed into `app.asar`, collapsing the macOS code-signing step from minutes to seconds without runtime changes.

**Architecture:** Two coupled changes that must land together: (1) electron-builder config moves the `data/raw/icons/**/*` glob from `extraResources.filter` to `files`; (2) the `app://icons/` protocol handler in `packages/electron-shell/src/main.ts` reads icons from `app.getAppPath()` (which resolves into asar in production, repo root in dev) instead of from `getDataRoot()` (which points at `Resources/`). Electron's `fs.*` shim makes reads inside asar transparent — no other code changes.

**Tech Stack:** electron-builder (asar packaging), Electron `protocol.handle` + `app.getAppPath()`, Node `fs` (asar-aware via Electron).

**Spec:** `docs/superpowers/specs/2026-06-07-pack-icons-into-asar-design.md`

---

## File Structure

Files modified:

- `package.json` — electron-builder `build.files` and `build.extraResources` (root config block).
- `packages/electron-shell/src/main.ts` — `registerAppProtocol()` body around line 380; remove now-unused `getDataRoot` import at line 15.

No files created. No new dependencies. No test files (this is a packaging change verified by smoke-testing the built artifact — see Task 2).

---

## Task 1: Apply the coupled config + code change

The packaging change and the path change must ship together — one without the other yields a broken build. Do both in one edit pass, no intermediate commit.

**Files:**
- Modify: `package.json` (build section, lines 22–54)
- Modify: `packages/electron-shell/src/main.ts:15` (import) and `main.ts:379-381` (handler body)

- [ ] **Step 1.1: Update `package.json` — add icons to `files`**

The current `build.files` is a one-element array:

```json
    "files": [
      "packages/electron-shell/dist/**"
    ],
```

Change it to:

```json
    "files": [
      "packages/electron-shell/dist/**",
      "data/raw/icons/**/*"
    ],
```

- [ ] **Step 1.2: Update `package.json` — remove icons from `extraResources.filter`**

The current `extraResources` entry for `data` has this `filter` array:

```json
        "filter": [
          "stripped/types.json",
          "stripped/structure_recipes.json",
          "stripped/oreGroupIDs.json",
          "stripped/solarsystems.json",
          "raw/industry_blueprints.json",
          "raw/industry_facilities.json",
          "raw/icons/**/*"
        ]
```

Remove the last line so it becomes:

```json
        "filter": [
          "stripped/types.json",
          "stripped/structure_recipes.json",
          "stripped/oreGroupIDs.json",
          "stripped/solarsystems.json",
          "raw/industry_blueprints.json",
          "raw/industry_facilities.json"
        ]
```

(Don't forget to delete the trailing comma after `"raw/industry_facilities.json"`.)

- [ ] **Step 1.3: Update `packages/electron-shell/src/main.ts` — switch the icons root**

The current `registerAppProtocol` (around `main.ts:379-400`) starts with:

```ts
function registerAppProtocol(): void {
  const root = getDataRoot();
  const iconsDir = path.join(root, "data", "raw", "icons");
```

Replace those three lines with:

```ts
function registerAppProtocol(): void {
  const iconsDir = path.join(app.getAppPath(), "data", "raw", "icons");
```

Rationale: `app.getAppPath()` returns the path Electron treats as the app's main entry directory — in production this resolves *into* `app.asar`, and Electron's patched `fs.readFileSync`/`existsSync`/`statSync` (already used a few lines below in the same function) transparently read from inside the asar. In dev (`pnpm dev`), `getAppPath()` returns the repo root where the root `package.json` lives, so `data/raw/icons/` resolves to the real loose-file directory.

- [ ] **Step 1.4: Update `packages/electron-shell/src/main.ts` — remove now-unused import**

`getDataRoot` was only consumed in `registerAppProtocol`. Remove its import on `main.ts:15`:

```ts
import { getDataRoot } from "./ipc/gameDataLoader.js";
```

Delete that line entirely. (Verify with `grep -n getDataRoot packages/electron-shell/src/main.ts` after — should return nothing.)

- [ ] **Step 1.5: Type-check and lint the electron-shell package**

Run:

```bash
pnpm --filter @powerlay/electron-shell build
```

Expected: clean build, no TS errors (especially no "imported but unused" if a stricter rule kicks in for `getDataRoot`).

Then:

```bash
pnpm --filter @powerlay/electron-shell lint
```

Expected: no new lint warnings.

If either fails, fix the issue (most likely: forgot to remove the import in Step 1.4, or a stray comma in `package.json`).

- [ ] **Step 1.6: Sanity-check dev mode still works**

This change is supposed to be a no-op in dev. Quick check:

```bash
pnpm dev
```

Wait for the Electron window to open. Click into Builder → search any item. Confirm icons render in the dropdown (`packages/ui-desktop/src/components/ItemIcon.tsx` is the consumer). Close with Cmd-Q.

Expected: icons load identically to before. If they don't, the dev path resolution via `app.getAppPath()` isn't what we assumed — stop and re-investigate before continuing.

---

## Task 2: Verify the packaged build (macOS)

This is the actual point of the change. We need objective evidence that signing got faster *and* that icons still work.

**Files:** none modified.

- [ ] **Step 2.1: Note current `signing` step duration**

If you have a recent `pnpm build:mac` log handy, note roughly how long the `signing  file=dist/mac-arm64/Powerlay Frontier.app …` step took. If not, that's fine — the new run will be the baseline going forward, and the "16 k files → 1 file" change is structural enough that the speedup will be obvious.

- [ ] **Step 2.2: Build the macOS bundle and time the signing step**

```bash
time pnpm build:mac
```

While it runs, watch the electron-builder output. The line of interest is:

```
  • signing         file=dist/mac-arm64/Powerlay Frontier.app …
```

Note the wall-clock gap between that line appearing and the next major step (e.g. `building DMG`). Expected: drops from minutes-ish to seconds.

Expected end state: `dist/Powerlay Frontier-<version>.dmg` produced without errors.

- [ ] **Step 2.3: Inspect the asar to confirm icons were actually packed in**

```bash
npx asar list "dist/mac-arm64/Powerlay Frontier.app/Contents/Resources/app.asar" | grep -c '^/data/raw/icons/'
```

Expected: a count close to 16 606 (the current `data/raw/icons/` file count — verify with `find data/raw/icons -type f | wc -l` if the number looks off).

Also confirm icons are NOT also lying around loose in Resources:

```bash
ls "dist/mac-arm64/Powerlay Frontier.app/Contents/Resources/data/raw/icons/" 2>&1
```

Expected: `No such file or directory`. (If the dir is still there with 16 k PNGs, Step 1.2 didn't take effect — re-check `package.json`.)

- [ ] **Step 2.4: Install from the .dmg and smoke-test icon rendering**

Open `dist/Powerlay Frontier-<version>.dmg`, drag the app to Applications, launch it.

Check three consumption points (each pulls from `app://icons/N.png`):

1. **Builder tab** → search any item (e.g. type "Tritanium" or pick from a build) → confirm the icon appears in the search dropdown and on selected items.
2. **Contracts tab** → if any contracts list is populated, confirm item icons render in rows.
3. **Scout tab** → confirm any item icons render.

Expected: icons render identically to the dev experience. If you see broken-image placeholders (the `MissingIconPlaceholder` × glyph from `ItemIcon.tsx:32`), open DevTools → Network and look at one failing `app://icons/…` request: a 404 means the path inside asar is wrong (re-check Step 1.3).

- [ ] **Step 2.5: Spot-check `.dmg` size hasn't ballooned**

```bash
ls -lh dist/*.dmg
```

Expected: roughly comparable to previous builds. asar doesn't compress PNGs, so size should be within a few MB either way.

---

## Task 3: Verify the packaged build (Windows portable)

Same verification, Windows target. If you don't have a Windows machine handy, the portable .exe can still be inspected on macOS — but actually launching it requires Windows (or a VM / Wine, depending on what's set up).

**Files:** none modified.

- [ ] **Step 3.1: Build the Windows portable**

```bash
pnpm build:portable
```

Expected: `dist/Powerlay Frontier <version>.exe` (portable) produced without errors. Note: code-signing on Windows portable doesn't go through `signtool` unless configured — the speedup matters mostly because the unpacked file tree inside the .exe is smaller (one asar vs. 16 k loose files), which makes the NSIS / 7z stage of `electron-builder` faster too.

- [ ] **Step 3.2: Inspect that icons made it into asar**

The portable .exe is essentially a self-extracting archive. The asar can be inspected without running the exe by pointing at the staging dir electron-builder leaves under `dist/win-unpacked/` (if present) or by extracting the portable:

```bash
ls "dist/win-unpacked/resources/app.asar" 2>/dev/null && \
  npx asar list "dist/win-unpacked/resources/app.asar" | grep -c '^/data/raw/icons/'
```

Expected: same count as Step 2.3.

If `dist/win-unpacked/` is not present after a portable build, skip this step; the macOS asar check from Task 2 is sufficient evidence the `files` glob works (the glob is target-independent).

- [ ] **Step 3.3: If a Windows test environment is available, smoke-test**

Run the portable .exe on Windows, repeat the three consumption checks from Step 2.4 (Builder, Contracts, Scout).

Expected: icons render. If no Windows env is available, note that in the report and move on — the macOS smoke-test plus the asar contents check on win-unpacked is sufficient evidence the change is correct.

---

## Task 4: Report ready for commit

Per project memory: never run `git add`/`git commit` autonomously. Report state to the user and let them drive the commit.

**Files:** none modified.

- [ ] **Step 4.1: Summarize the changes for the user**

Report:

- Files changed: `package.json`, `packages/electron-shell/src/main.ts`.
- Signing-step duration: before ≈ ___, after ≈ ___ (from Steps 2.1, 2.2).
- Smoke-test result on macOS: pass/fail per Builder / Contracts / Scout (Step 2.4).
- Windows verification: asar-contents check passed / Windows smoke-test pending or N/A (Task 3).
- Suggested commit message:

  ```
  [build] pack icons into app.asar to speed up macOS signing

  Moved ~16k icon PNGs from extraResources (loose files) into the
  files glob so electron-builder packs them into app.asar. codesign
  now signs one artifact instead of 16k, cutting the signing step
  from minutes to seconds. Runtime unchanged: the app://icons/
  protocol handler reads from app.getAppPath() which resolves into
  asar in production and into the repo root in dev.
  ```

- [ ] **Step 4.2: Wait for user to drive the commit**

Do not run `git add` or `git commit`. Stop after the report. If the user asks to commit, they will say so or use their `/commit` skill.

---

## Self-Review Notes

- Spec coverage: every "Changes" item in the spec maps to a step (Step 1.1 = files glob; Step 1.2 = extraResources filter; Step 1.3 = handler path; Step 1.4 = unused import). Edge-case verifications from the spec (signing time, render in 3 places, size, asar contents, Windows) map to Tasks 2 and 3.
- No placeholders, no "implement later" — all code shown.
- Type/symbol consistency: `getAppPath()` and `app.getAppPath()` are the same; the `app` import already exists at `main.ts:1`. `path` import already exists at `main.ts:2`. No new imports needed.
- TDD note: this is a packaging change. There's no testable unit added — the "test" is the smoke-test of the built artifact, which is exactly what Tasks 2 and 3 do.

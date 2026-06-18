# Pack icons into app.asar to speed up macOS code signing

## Problem

`data/raw/icons/` contains ~16 600 PNG files (~161 MB). They are shipped via electron-builder's `extraResources`, which copies them loose into `Contents/Resources/data/raw/icons/`. macOS code signing hashes and signs every file in the bundle individually, so the `signing` step has become the dominant cost of `pnpm build:mac`. The same loose-file layout applies to the Windows portable build.

The slowdown is driven by file *count*, not total size: 16 k tiny files cost far more than one 160 MB file.

## Goal

Cut signing time by collapsing the 16 k icon files into a single artifact that codesign sees as one file, without changing how icons are requested from the renderer and without adding runtime startup work (no first-launch extraction, no userData writes).

Dev-time data layout must stay as loose files under `data/raw/icons/` so they are easy to grep/inspect manually.

## Approach

Move the icons from `extraResources` (loose) into the app's main bundle (`files`), so electron-builder packs them into `app.asar`. Codesign then signs `app.asar` as a single file. Electron's `fs.*` shims read transparently from inside asar, so the existing `app://icons/N.png` protocol handler works with a one-line path change.

JSON game data (`stripped/types.json`, `industry_blueprints.json`, etc.) stays in `extraResources` — only 6 files, no signing problem, and the existing `getDataRoot()` loader keeps working unchanged.

### Why asar over a zip + extract scheme

Considered packing icons into `icons.zip` shipped via extraResources and extracting to `userData` on first launch. Rejected: it adds a pre-build zip step, a startup extraction path (5–30 s on first launch), version/hash tracking, cleanup of old extracted versions, and an extra runtime dependency (`adm-zip` / `node-stream-zip`). The only thing zip + extract buys is "PNGs exist as loose files post-install" — which the user explicitly does not need.

## Changes

### `package.json` (electron-builder config)

```diff
   "files": [
-    "packages/electron-shell/dist/**"
+    "packages/electron-shell/dist/**",
+    "data/raw/icons/**/*"
   ],
   "extraResources": [
     ...
     {
       "from": "data",
       "to": "data",
       "filter": [
         "stripped/types.json",
         "stripped/structure_recipes.json",
         "stripped/oreGroupIDs.json",
         "stripped/solarsystems.json",
         "raw/industry_blueprints.json",
-        "raw/industry_facilities.json",
-        "raw/icons/**/*"
+        "raw/industry_facilities.json"
       ]
     }
   ]
```

### `packages/electron-shell/src/main.ts`

In `registerAppProtocol()` (around `main.ts:380`):

```diff
 function registerAppProtocol(): void {
-  const root = getDataRoot();
-  const iconsDir = path.join(root, "data", "raw", "icons");
+  const iconsDir = path.join(app.getAppPath(), "data", "raw", "icons");
```

`getDataRoot` becomes unused in `main.ts` after this change (it is currently the only consumer in that file — `main.ts:15` import, `main.ts:380` use). Remove the import. `gameDataLoader.ts` keeps using `getDataRoot` internally for JSON paths — that file is untouched.

No changes to `ItemIcon.tsx`, the preload bridge, or the renderer — URL `app://icons/N.png` is unchanged.

## Data flow

- **Build**: electron-builder evaluates `files` glob from project root → icons packed into `Resources/app.asar` at path `data/raw/icons/N.png`. JSON files copied loose into `Resources/data/...` as today.
- **Codesign (macOS)**: signs one `app.asar` (~160 MB) instead of 16 606 PNGs. Step drops from minutes to seconds.
- **Windows portable**: SignTool signs one .exe artifact — analogous win.
- **Runtime**: renderer requests `app://icons/123.png` → handler → `fs.readFileSync(<app.asar>/data/raw/icons/123.png)` → PNG response. Electron's fs shim handles the asar boundary transparently.

## Dev mode

`pnpm dev` is untouched. `app.getAppPath()` in unpacked dev mode returns the repo root (the directory of the root `package.json` that declares `"main"`). `path.join(getAppPath(), "data/raw/icons")` resolves to the real on-disk loose-file directory. No conditional needed.

## Edge cases / verification

- After packaged build, manually open `.dmg` / portable `.exe` and verify icons render in Builder, Contracts, and Scout (the three points of consumption).
- Time `signing` step before/after — that's the success metric.
- Check `.dmg` / `.exe` size doesn't grow. asar does not compress PNGs significantly; expect ~same.
- Confirm Windows portable build: icons render and signing is fast.
- Quick post-build sanity check: `npx asar list <Resources/app.asar> | grep -c '^/data/raw/icons/'` should print 16 606 (or current count).

## Non-goals

- No first-launch extraction, no userData icon directory.
- No change to `getDataRoot()` or to how JSON game data is loaded.
- No change to the dev-mode icon path.
- No change to `ItemIcon.tsx` or the `app://icons/` URL scheme.

## Estimated diff

`package.json`: ~6 lines. `main.ts`: 2 lines. No new dependencies. No new code paths.

# Building the portable app

This guide explains how to build the Windows portable app and how to update it after code changes. Optional code signing is documented at the end.

## Prerequisites

- **Node.js** 18 or newer
- **pnpm** 9 (or run `corepack enable` and use the repo's `packageManager` field)
- **(Optional, for signing)** A Windows code signing certificate (`.pfx`) and the password

## First-time build

1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```

2. **(Optional)** If you need to regenerate stripped type data:
   ```bash
   pnpm run strip-types
   ```

3. Build the portable Windows app:
   ```bash
   pnpm run build:portable
   ```
   This runs a full build (core, ui-desktop, ui-overlay, electron-shell) and then runs electron-builder to produce the portable output.

4. **Output location:** The portable executable (or unpacked folder) is written to the `dist/` directory at the repository root. For the Windows portable target you get:
   - A single portable `.exe` (e.g. `Powerlay Frontier 0.1.0.exe`), or
   - A `win-unpacked` folder containing the exe and resources (you can zip this folder for distribution).

## Updating after code changes

1. Apply your code changes (or pull the latest from the repo).

2. Run the **same** build command again:
   ```bash
   pnpm run build:portable
   ```
   No extra steps are required. A full rebuild produces a new portable exe or folder.

3. If you only changed the desktop or overlay UI, you can still run `pnpm run build:portable`; it will rebuild everything. For a quicker iteration you can run `pnpm run build` and then `electron-builder --win portable` (same result as `build:portable`).

## Code signing (optional)

Signing the executable improves trust (e.g. fewer antivirus warnings). You need a Windows code signing certificate (e.g. from DigiCert, Sectigo, or another CA). EV certificates are recommended for immediate SmartScreen reputation.

1. Obtain a `.pfx` file and its password.

2. Set environment variables **before** running the build (do not commit these):
   - **CSC_LINK** – Path to your `.pfx` file (or a base64-encoded certificate, depending on your setup).
   - **CSC_KEY_PASSWORD** – Password for the certificate.

   Example (PowerShell):
   ```powershell
   $env:CSC_LINK = "C:\path\to\your\certificate.pfx"
   $env:CSC_KEY_PASSWORD = "your-certificate-password"
   pnpm run build:portable
   ```

   Example (bash):
   ```bash
   export CSC_LINK="/path/to/certificate.pfx"
   export CSC_KEY_PASSWORD="your-certificate-password"
   pnpm run build:portable
   ```

3. electron-builder will sign the Windows executable when these variables are set. Timestamping is used by default so the signature remains valid after the certificate expires.

If you do not set `CSC_LINK` and `CSC_KEY_PASSWORD`, the build still produces an unsigned portable app (fine for local use or testing). The config sets `win.sign: null` so no signing is attempted when no certificate is provided.

## Troubleshooting

### "Cannot compute electron version"
Install Electron at the repo root so electron-builder can detect it: the root `package.json` includes `electron` in `devDependencies`. Run `pnpm install` and try again.

### "Cannot create symbolic link" when extracting winCodeSign
On Windows, electron-builder downloads a tool (winCodeSign) that is packed with symlinks; extracting it can fail without privilege to create symlinks.

- **Option A:** Run your terminal (PowerShell or CMD) **as Administrator**, then run `pnpm run build:portable` again.
- **Option B (one-time, no admin):** Pre-populate the winCodeSign cache so the 7z is never extracted:
  1. Download the **source** zip (not the `.7z`) from [electron-builder-binaries releases](https://github.com/electron-userland/electron-builder-binaries/releases/tag/winCodeSign-2.6.0) (e.g. "Source code (zip)").
  2. Unzip it and open the folder `electron-builder-binaries-winCodeSign-2.6.0\winCodeSign`.
  3. Copy the **contents** of that `winCodeSign` folder into:
     `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`
     (Create `winCodeSign-2.6.0` if it doesn’t exist.)
  4. Run `pnpm run build:portable` again; the download/extraction step will be skipped.

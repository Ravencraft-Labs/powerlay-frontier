#!/usr/bin/env node
// Wrapper that runs `python -m extract.<submodule>` using the venv-bundled
// Python interpreter. pnpm calls this so we never rely on a system python
// having the package installed.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const venvDir = join(here, ".venv");

const isWin = process.platform === "win32";
const pythonPath = isWin
  ? join(venvDir, "Scripts", "python.exe")
  : join(venvDir, "bin", "python");

if (!existsSync(pythonPath)) {
  process.stderr.write(
    `Python venv not found at ${pythonPath}.\n` +
      `Bootstrap it once:\n` +
      `  cd scripts/extract\n` +
      `  python3.12 -m venv .venv\n` +
      `  .venv/bin/pip install -e .[dev]\n`,
  );
  process.exit(1);
}

const [, , submodule, ...rest] = process.argv;
if (!submodule) {
  process.stderr.write("Usage: run.mjs <submodule> [args...]\n");
  process.exit(2);
}

const result = spawnSync(pythonPath, ["-m", `extract.${submodule}`, ...rest], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

#!/usr/bin/env node
// POC (throwaway): build data/poc-map/base.json — Cycle 6 system positions from a
// pre-Cycle-7 raw/solarsystems.json (the last client build that shipped systems.static).
// Usage: node scripts/poc-map/build-base.mjs [path/to/old/solarsystems.json]

import fs from "node:fs";
import path from "node:path";

const src = process.argv[2] ?? "data/raw.bak.20261022-183807/solarsystems.json";
const outDir = path.join(process.cwd(), "data", "poc-map");
const outPath = path.join(outDir, "base.json");

const rows = JSON.parse(fs.readFileSync(src, "utf8"));
const systems = [];
for (const r of rows) {
  if (!Array.isArray(r.location) || r.location.length !== 3) continue;
  const [x, y, z] = r.location;
  systems.push({ id: r.id, n: r.name, x, y, z, c: r.constellationId, r: r.regionId });
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify({ source: path.basename(path.dirname(src)), systems }),
  "utf8",
);
console.log(`base.json: ${systems.length} systems from ${src}`);

"use strict";

const fs = require("fs");
const path = require("path");

const LOCALE = process.env.LOCALE || "en-us";
const INPUT_PATH = path.join(process.cwd(), "data", "raw", "types.json");
const OUTPUT_DIR = path.join(process.cwd(), "data", "stripped");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "types.json");

if (!fs.existsSync(INPUT_PATH)) {
  console.error("Error: data/raw/types.json not found. Place the raw types file there and run again.");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
const nameKey = "typeName_" + LOCALE;
const stripped = {};

for (const key of Object.keys(raw)) {
  const entry = raw[key];
  const out = {};
  for (const k of Object.keys(entry)) {
    if (k.startsWith("description")) continue;
    if (k.startsWith("typeName_")) {
      if (k === nameKey) out.name = entry[k];
      continue;
    }
    out[k] = entry[k];
  }
  if (nameKey in entry) out.name = entry[nameKey];
  stripped[key] = out;
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stripped, null, 0), "utf8");

const stat = fs.statSync(OUTPUT_PATH);
const bytes = stat.size;
const mb = (bytes / (1024 * 1024)).toFixed(2);
console.log("Stripped file size: " + mb + " MB (" + bytes + " bytes)");

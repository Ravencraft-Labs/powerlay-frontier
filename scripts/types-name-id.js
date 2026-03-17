"use strict";

const fs = require("fs");
const path = require("path");

const LOCALE = process.env.LOCALE || "en-us";
const INPUT_PATH = path.join(process.cwd(), "data", "raw", "types.json");
const OUTPUT_DIR = path.join(process.cwd(), "data", "stripped");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "types-name-id.json");

if (!fs.existsSync(INPUT_PATH)) {
  console.error("Error: data/raw/types.json not found. Place the raw types file there and run again.");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
const nameKey = "typeName_" + LOCALE;
const out = {};

for (const key of Object.keys(raw)) {
  const entry = raw[key];
  const typeID = entry.typeID;
  const name = entry[nameKey] != null ? entry[nameKey] : "";
  out[key] = { typeID, name };
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 0), "utf8");

const stat = fs.statSync(OUTPUT_PATH);
const bytes = stat.size;
const mb = (bytes / (1024 * 1024)).toFixed(2);
console.log("Name+ID file size: " + mb + " MB (" + bytes + " bytes)");

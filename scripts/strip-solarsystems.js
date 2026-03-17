"use strict";

const fs = require("fs");
const path = require("path");

const INPUT_PATH = path.join(process.cwd(), "data", "raw", "solarsystems.json");
const OUTPUT_DIR = path.join(process.cwd(), "data", "stripped");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "solarsystems.json");

if (!fs.existsSync(INPUT_PATH)) {
  console.error("Error: data/raw/solarsystems.json not found. Place the raw file there and run again.");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
if (!Array.isArray(raw)) {
  console.error("Error: Expected array in solarsystems.json");
  process.exit(1);
}

const names = raw
  .map((entry) => entry?.name ?? entry?.typeName)
  .filter((n) => typeof n === "string" && n.length > 0);
names.sort((a, b) => a.localeCompare(b, "en"));

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(names, null, 0), "utf8");

const stat = fs.statSync(OUTPUT_PATH);
const bytes = stat.size;
const kb = (bytes / 1024).toFixed(2);
console.log("Stripped " + names.length + " names. Output: " + kb + " KB (" + bytes + " bytes)");

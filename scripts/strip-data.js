"use strict";

const fs = require("fs");
const path = require("path");

const LOCALE = process.env.LOCALE || "en-us";
const RAW_DIR = path.join(process.cwd(), "data", "raw");
const OUTPUT_DIR = path.join(process.cwd(), "data", "stripped");

function isOreGroup(name) {
  const n = (name || "").trim();
  if (!n) return false;
  return n.toLowerCase() === "ice" || /\sores?$/i.test(n);
}

// --- Types ---
const typesInputPath = path.join(RAW_DIR, "types.json");
const typesOutputPath = path.join(OUTPUT_DIR, "types.json");

if (!fs.existsSync(typesInputPath)) {
  console.error("Error: data/raw/types.json not found. Place the raw types file there and run again.");
  process.exit(1);
}

const rawTypes = JSON.parse(fs.readFileSync(typesInputPath, "utf8"));
const nameKey = "typeName_" + LOCALE;
const strippedTypes = {};

for (const key of Object.keys(rawTypes)) {
  const entry = rawTypes[key];
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
  strippedTypes[key] = out;
}

// --- Groups (ore detection) ---
const groupsInputPath = path.join(RAW_DIR, "groups.json");

if (!fs.existsSync(groupsInputPath)) {
  console.error("Error: data/raw/groups.json not found. Place the raw groups file there and run again.");
  process.exit(1);
}

const rawGroups = JSON.parse(fs.readFileSync(groupsInputPath, "utf8"));
const groupNameKey = "groupName_" + LOCALE;
const oreGroupIDs = [];

for (const key of Object.keys(rawGroups)) {
  const entry = rawGroups[key];
  const name = entry?.[groupNameKey] ?? entry?.["groupName_en-us"] ?? "";
  if (isOreGroup(name)) {
    const groupID = Number(entry?.groupID ?? key);
    if (Number.isFinite(groupID)) oreGroupIDs.push(groupID);
  }
}

oreGroupIDs.sort((a, b) => a - b);

// --- Solarsystems (optional) ---
const solarsystemsInputPath = path.join(RAW_DIR, "solarsystems.json");
const solarsystemsOutputPath = path.join(OUTPUT_DIR, "solarsystems.json");

let solarsystemsWritten = false;
if (fs.existsSync(solarsystemsInputPath)) {
  const rawSolarsystems = JSON.parse(fs.readFileSync(solarsystemsInputPath, "utf8"));
  if (Array.isArray(rawSolarsystems)) {
    const names = [...new Set(
      rawSolarsystems
        .map((entry) => entry?.name ?? entry?.typeName)
        .filter((n) => typeof n === "string" && n.length > 0)
    )];
    names.sort((a, b) => a.localeCompare(b, "en"));
    fs.writeFileSync(solarsystemsOutputPath, JSON.stringify(names, null, 0), "utf8");
    const stat = fs.statSync(solarsystemsOutputPath);
    const kb = (stat.size / 1024).toFixed(2);
    console.log("solarsystems.json: " + names.length + " names, " + kb + " KB");
    solarsystemsWritten = true;
  }
} else {
  console.log("solarsystems.json: skipped (file not found)");
}

// --- Write outputs ---
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(typesOutputPath, JSON.stringify(strippedTypes, null, 0), "utf8");
const typesStat = fs.statSync(typesOutputPath);
const typesMb = (typesStat.size / (1024 * 1024)).toFixed(2);
console.log("types.json: " + typesMb + " MB (" + typesStat.size + " bytes)");

const oreGroupIDsPath = path.join(OUTPUT_DIR, "oreGroupIDs.json");
fs.writeFileSync(oreGroupIDsPath, JSON.stringify(oreGroupIDs, null, 0), "utf8");
const oreStat = fs.statSync(oreGroupIDsPath);
console.log("oreGroupIDs.json: " + oreGroupIDs.length + " ore groups (" + oreStat.size + " bytes)");

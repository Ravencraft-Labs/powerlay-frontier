"use strict";

const fs = require("fs");
const path = require("path");

const LOCALE = process.env.LOCALE || "en-us";
const RAW_DIR = path.join(process.cwd(), "data", "raw");
const OUTPUT_DIR = path.join(process.cwd(), "data", "stripped");

function isOreGroup(name) {
  const n = (name || "").trim();
  if (!n) return false;
  // "Regoliths" groups replaced the "* Ores" groups in the Oct 2026 client update.
  return n.toLowerCase() === "ice" || /\s(ores?|regoliths?)$/i.test(n);
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

// --- Structure recipes (from spacecomponentsbytype) ---
// Current clients: smartDeployable.constructionCost on the structure type itself.
// Pre-Oct-2026 clients: assemblyConstruction { constructedItem, inputItems } on the kit type.
const spacecomponentsInputPath = path.join(RAW_DIR, "spacecomponentsbytype.json");
const structureRecipesOutputPath = path.join(OUTPUT_DIR, "structure_recipes.json");

function toInputItems(raw) {
  if (!raw || typeof raw !== "object") return null;
  const inputItems = {};
  for (const [typeIdStr, qty] of Object.entries(raw)) {
    const typeId = parseInt(typeIdStr, 10);
    const q = Number(qty);
    if (Number.isFinite(typeId) && Number.isFinite(q) && q > 0) {
      inputItems[typeIdStr] = q;
    }
  }
  return Object.keys(inputItems).length > 0 ? inputItems : null;
}

let structureRecipes = {};
if (fs.existsSync(spacecomponentsInputPath)) {
  const rawSpacecomponents = JSON.parse(fs.readFileSync(spacecomponentsInputPath, "utf8"));
  if (rawSpacecomponents && typeof rawSpacecomponents === "object") {
    for (const key of Object.keys(rawSpacecomponents)) {
      const entry = rawSpacecomponents[key];

      const ac = entry?.assemblyConstruction;
      if (ac && ac.constructedItem != null) {
        const constructedItem = Number(ac.constructedItem);
        const inputItems = toInputItems(ac.inputItems);
        if (Number.isFinite(constructedItem) && inputItems) {
          structureRecipes[String(constructedItem)] ??= { constructedItem, inputItems };
        }
      }

      const sd = entry?.smartDeployable;
      if (sd && sd.constructionCost) {
        const constructedItem = parseInt(key, 10);
        const inputItems = toInputItems(sd.constructionCost);
        if (Number.isFinite(constructedItem) && inputItems) {
          structureRecipes[String(constructedItem)] = { constructedItem, inputItems };
        }
      }
    }
  }
}

// --- Write outputs ---
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (Object.keys(structureRecipes).length > 0) {
  fs.writeFileSync(structureRecipesOutputPath, JSON.stringify(structureRecipes, null, 0), "utf8");
  const srStat = fs.statSync(structureRecipesOutputPath);
  const srKb = (srStat.size / 1024).toFixed(2);
  console.log("structure_recipes.json: " + Object.keys(structureRecipes).length + " recipes, " + srKb + " KB");
} else if (fs.existsSync(spacecomponentsInputPath)) {
  console.log("structure_recipes.json: 0 recipes (no assemblyConstruction entries found)");
} else {
  console.log("structure_recipes.json: skipped (file not found)");
}

fs.writeFileSync(typesOutputPath, JSON.stringify(strippedTypes, null, 0), "utf8");
const typesStat = fs.statSync(typesOutputPath);
const typesMb = (typesStat.size / (1024 * 1024)).toFixed(2);
console.log("types.json: " + typesMb + " MB (" + typesStat.size + " bytes)");

const oreGroupIDsPath = path.join(OUTPUT_DIR, "oreGroupIDs.json");
fs.writeFileSync(oreGroupIDsPath, JSON.stringify(oreGroupIDs, null, 0), "utf8");
const oreStat = fs.statSync(oreGroupIDsPath);
console.log("oreGroupIDs.json: " + oreGroupIDs.length + " ore groups (" + oreStat.size + " bytes)");

// --- Scout sites (ecosystem.json + Crude Rift types) ---
// Ecosystem names carry the zone: "Broken World - Inner Belt - Ossuary Mill (Refinery - Ruins)".
// Beacon type names are what players see in space, prefixed with the zone: "Inner Derelict Bay".
const ecosystemInputPath = path.join(RAW_DIR, "ecosystem.json");
const scoutSitesOutputPath = path.join(OUTPUT_DIR, "scout_sites.json");
const CRUDE_RIFT_GROUP_ID = 4872;

function ecosystemZone(name) {
  if (/\bInner\b/i.test(name)) return "INNER";
  if (/\bOuter\b/i.test(name)) return "OUTER";
  if (/\bTrojans?\b/i.test(name)) return "TROJAN";
  if (/\bTransitional\b/i.test(name)) return "FRINGE";
  return "UNKNOWN";
}

if (fs.existsSync(ecosystemInputPath)) {
  const rawEcosystem = JSON.parse(fs.readFileSync(ecosystemInputPath, "utf8"));
  const sites = new Map();
  for (const t of Object.values(rawTypes)) {
    const name = t?.[nameKey];
    if (t?.groupID === CRUDE_RIFT_GROUP_ID && typeof name === "string" && name.trim()) {
      sites.set(name.trim(), { name: name.trim(), zone: "RIFT", description: "Crude Rift" });
    }
  }
  for (const eco of Object.values(rawEcosystem)) {
    if (!eco?.spawnEnabled) continue;
    const beaconName = rawTypes[String(eco.entryPattern?.beaconTypeID)]?.[nameKey];
    if (typeof beaconName !== "string" || /placeholder|beacon/i.test(beaconName)) continue;
    const name = beaconName.replace(/^(Inner|Outer|Trojan|Fringe)\s+/i, "").trim();
    if (!name || sites.has(name)) continue;
    sites.set(name, {
      name,
      zone: ecosystemZone(eco.name ?? ""),
      description: (eco.name ?? "").replace(/\s+/g, " ").trim(),
      ...(Array.isArray(eco.requireAllTags) && eco.requireAllTags.length > 0 && { tags: eco.requireAllTags }),
    });
  }
  const list = [...sites.values()].sort((a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name, "en"));
  fs.writeFileSync(scoutSitesOutputPath, JSON.stringify(list, null, 0), "utf8");
  console.log("scout_sites.json: " + list.length + " sites");
} else {
  console.log("scout_sites.json: skipped (ecosystem.json not found)");
}

// --- System states (systemstate.json) ---
// Keyed by solar system ID: Cycle 7 system names come from the server, not the client localization.
const systemstateInputPath = path.join(RAW_DIR, "systemstate.json");
const systemStatesOutputPath = path.join(OUTPUT_DIR, "system_states.json");

if (fs.existsSync(systemstateInputPath)) {
  const rawSystemstate = JSON.parse(fs.readFileSync(systemstateInputPath, "utf8"));
  const states = {};
  for (const [id, entry] of Object.entries(rawSystemstate)) {
    if (typeof entry?.state === "string") states[id] = entry.state;
  }
  fs.writeFileSync(systemStatesOutputPath, JSON.stringify(states, null, 0), "utf8");
  console.log("system_states.json: " + Object.keys(states).length + " systems");
} else {
  console.log("system_states.json: skipped (systemstate.json not found)");
}

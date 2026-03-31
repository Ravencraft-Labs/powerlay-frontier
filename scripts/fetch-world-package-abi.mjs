#!/usr/bin/env node
/**
 * Fetch the full normalized Move ABI for the EVE Frontier world-contracts package
 * and save it to data/help_db/world-package-abi.json.
 *
 * This is a one-time / refresh script used to discover exact module names,
 * function signatures, struct definitions, and type parameters before wiring
 * up the Powerlay Move extension (powerlay_storage.move).
 *
 * Output file: data/help_db/world-package-abi.json
 *
 * Usage:
 *   node scripts/fetch-world-package-abi.mjs [network]
 *   network: "utopia" (default) | "stillness"
 *
 * Or with pnpm (from workspace root):
 *   node scripts/fetch-world-package-abi.mjs
 *
 * Requires: Node 18+ (uses built-in fetch).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "..");

const WORLD_PACKAGES = {
  utopia: "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75",
  stillness: "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c",
};

const RPC_URLS = {
  utopia: "https://rpc.testnet.sui.io",
  stillness: "https://rpc.testnet.sui.io",
};

const network = process.argv[2]?.toLowerCase() === "stillness" ? "stillness" : "utopia";
const packageId = WORLD_PACKAGES[network];
const rpcUrl = RPC_URLS[network];

const outDir = path.join(WORKSPACE_ROOT, "data", "help_db");
const outFile = path.join(outDir, `world-package-abi-${network}.json`);

console.log(`Network   : ${network}`);
console.log(`Package   : ${packageId}`);
console.log(`RPC       : ${rpcUrl}`);
console.log(`Output    : ${outFile}`);
console.log("");

// ---------------------------------------------------------------------------
// 1. getNormalizedMoveModulesByPackage — full ABI with all modules/functions/structs
// ---------------------------------------------------------------------------
async function fetchNormalizedModules() {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "sui_getNormalizedMoveModulesByPackage",
    params: [packageId],
  };

  console.log("Fetching normalized modules (sui_getNormalizedMoveModulesByPackage)…");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// 2. getObject — the package object itself (bytecode metadata, etc.)
// ---------------------------------------------------------------------------
async function fetchPackageObject() {
  const body = {
    jsonrpc: "2.0",
    id: 2,
    method: "sui_getObject",
    params: [packageId, { showType: true, showContent: true, showBcs: false, showStorageRebate: false }],
  };

  console.log("Fetching package object (sui_getObject)…");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const [modules, packageObj] = await Promise.all([
    fetchNormalizedModules(),
    fetchPackageObject(),
  ]);

  const output = {
    _meta: {
      network,
      packageId,
      rpcUrl,
      fetchedAt: new Date().toISOString(),
      description:
        "Normalized Move ABI for EVE Frontier world-contracts (utopia testnet). " +
        "Use this to verify exact module names, function signatures, and struct layouts " +
        "before wiring up powerlay_storage.move imports.",
      keyModulesToCheck: [
        "storage_unit  — StorageUnit struct, authorize_extension, deposit_to_open_inventory, withdraw_from_open_inventory",
        "access_control — OwnerCap<T>",
        "character     — borrow_owner_cap, return_owner_cap",
        "item          — Item<T>",
      ],
    },
    packageObject: packageObj,
    modules,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\nSaved ${Math.round(fs.statSync(outFile).size / 1024)} KB to ${outFile}`);

  // ---------------------------------------------------------------------------
  // Print a quick summary of relevant modules
  // ---------------------------------------------------------------------------
  if (modules && typeof modules === "object") {
    const interesting = ["storage_unit", "access_control", "character", "item"];
    console.log("\n--- Module summary ---");
    for (const name of interesting) {
      const mod = modules[name];
      if (!mod) {
        console.log(`  ${name}: NOT FOUND (check full JSON for actual module names)`);
        continue;
      }
      const funcs = Object.keys(mod.exposedFunctions ?? {});
      const structs = Object.keys(mod.structs ?? {});
      console.log(`  ${name}:`);
      console.log(`    structs  : ${structs.join(", ") || "(none)"}`);
      console.log(`    functions: ${funcs.join(", ") || "(none)"}`);
    }

    console.log("\n--- All module names in package ---");
    console.log(" ", Object.keys(modules).join(", "));
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});

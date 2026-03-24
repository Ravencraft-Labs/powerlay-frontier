#!/usr/bin/env node
/**
 * Debug Sui GraphQL: list Move objects owned by an address (official schema).
 * Prints HTTP status, full JSON, object type summary, and (if found) tribe_id from EVE Character.
 *
 * Tribe resolution matches `playerTribeFromChain.ts` (PlayerProfile → character_id → Character.tribe_id).
 *
 * Usage:
 *   node scripts/debug-ef-graphql.mjs <walletAddress> [graphqlUrl]
 *   pnpm debug-graphql -- 0xabc... https://graphql.testnet.sui.io/graphql
 *
 * With plain `node`, do NOT pass a standalone `--` before the address (that becomes the "wallet").
 * Leading `--` args are stripped automatically.
 *
 * URL resolution: 2nd CLI arg → POWERLAY_EF_GRAPHQL_URL → default testnet GraphQL.
 */

const DEFAULT_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

// `address.objects.nodes` are MoveObject; use `contents` on the node directly.
// (A nested `asMoveObject { contents }` fails validation: no `asMoveObject` on MoveObject.)
const CHARACTER_TRIBE_QUERY = `
  query CharacterTribe($id: SuiAddress!) {
    object(address: $id) {
      asMoveObject {
        contents {
          type { repr }
          json
        }
      }
    }
  }
`;

const GET_ALL_OBJECTS_QUERY = `
  query GetAllObjects($address: SuiAddress!) {
    address(address: $address) {
      objects(first: 50) {
        nodes {
          address
          contents {
            type {
              repr
            }
            json
          }
        }
      }
    }
  }
`;

function printHelp() {
  console.log(`
Usage:
  node scripts/debug-ef-graphql.mjs <suiAddress> [graphqlUrl]

Examples:
  node scripts/debug-ef-graphql.mjs 0x1234...abcd
  node scripts/debug-ef-graphql.mjs 0x1234...abcd https://graphql.testnet.sui.io/graphql

Environment:
  POWERLAY_EF_GRAPHQL_URL   Used when [graphqlUrl] is omitted
  POWERLAY_EF_GRAPHQL_TIMEOUT_MS   Optional timeout (default 15000 for this script)

Default URL if unset: ${DEFAULT_GRAPHQL_URL}
`);
}

function normalizeArgs(raw) {
  const a = [...raw];
  while (a.length && a[0] === "--") a.shift();
  return a;
}

function findCharacterIdFromProfileResponse(json) {
  const nodes = json?.data?.address?.objects?.nodes;
  if (!Array.isArray(nodes)) return null;
  for (const n of nodes) {
    const repr = n?.contents?.type?.repr ?? "";
    if (!repr.includes("::character::PlayerProfile")) continue;
    const cid = n?.contents?.json?.character_id;
    if (typeof cid === "string" && cid.trim()) return cid.trim();
  }
  return null;
}

function parseTribeFromCharacterResponse(json) {
  const contents = json?.data?.object?.asMoveObject?.contents;
  if (!contents) return null;
  const repr = contents.type?.repr ?? "";
  if (!repr.includes("::character::Character")) return null;
  const tid = contents.json?.tribe_id;
  if (typeof tid === "number" && Number.isFinite(tid) && tid > 0) return String(Math.trunc(tid));
  if (typeof tid === "string" && tid.trim()) return tid.trim();
  return null;
}

function summarizeObjects(json) {
  const nodes = json?.data?.address?.objects?.nodes;
  if (!Array.isArray(nodes)) return null;
  const rows = [];
  for (const n of nodes) {
    const addr = n?.address ?? "(no address)";
    const repr = n?.contents?.type?.repr ?? null;
    rows.push({
      address: addr,
      typeRepr: repr ?? (n?.contents == null ? "(no contents)" : "(no type.repr)"),
    });
  }
  return rows;
}

async function main() {
  let argv = normalizeArgs(process.argv.slice(2));
  if (argv.includes("-h") || argv.includes("--help")) {
    printHelp();
    process.exit(0);
  }
  if (argv.length === 0) {
    printHelp();
    process.exit(1);
  }

  const address = argv[0]?.trim();
  if (!address || address === "--") {
    console.error("Error: Sui address required (usually 0x…).\n");
    printHelp();
    process.exit(1);
  }

  let url = argv[1]?.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    url = process.env.POWERLAY_EF_GRAPHQL_URL?.trim() || DEFAULT_GRAPHQL_URL;
  }

  const timeoutMs = Math.min(
    60_000,
    Math.max(1_000, parseInt(process.env.POWERLAY_EF_GRAPHQL_TIMEOUT_MS || "15000", 10) || 15_000)
  );

  console.log("--- Sui GraphQL object exploration ---");
  console.log("URL:    ", url);
  console.log("Address:", address);
  console.log("Timeout:", timeoutMs, "ms");
  console.log("");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const body = {
    query: GET_ALL_OBJECTS_QUERY,
    variables: { address },
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    console.error("Fetch failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  clearTimeout(t);

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  console.log("HTTP", res.status, res.statusText);
  console.log("");
  if (json) {
    console.log("Response JSON:");
    console.log(JSON.stringify(json, null, 2));
    console.log("");

    if (json.errors?.length) {
      console.log("GraphQL errors:", json.errors.length);
      for (const err of json.errors) {
        console.log(" -", err.message || err);
      }
      console.log("");
    }

    const rows = summarizeObjects(json);
    if (rows) {
      console.log(`Owned objects (first ${rows.length}, query cap 50):`);
      for (const r of rows) {
        console.log(`  ${r.address}`);
        console.log(`    type: ${r.typeRepr}`);
      }
      console.log("");
    } else if (json.data && !json.errors?.length) {
      console.log("Hint: No nodes[] in data.address.objects — response shape may differ for this RPC version.");
    } else if (!json.data && !json.errors) {
      console.log("Hint: Unexpected shape — endpoint may not be GraphQL or returned non-JSON.");
    }

    if (!json.errors?.length) {
      const characterId = findCharacterIdFromProfileResponse(json);
      let tribeId = null;
      if (characterId) {
        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), timeoutMs);
        try {
          const r2 = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: CHARACTER_TRIBE_QUERY,
              variables: { id: characterId },
            }),
            signal: c2.signal,
          });
          if (r2.ok) {
            const j2 = await r2.json();
            if (!j2.errors?.length) tribeId = parseTribeFromCharacterResponse(j2);
          }
        } catch {
          /* ignore */
        } finally {
          clearTimeout(t2);
        }
      }
      if (tribeId) {
        console.log("Resolved tribe_id (same as app X-Tribe-Id):", tribeId);
        console.log("(Tribe display name is not stored on Character; only numeric tribe_id.)");
      } else {
        console.log("Tribe: could not resolve (no PlayerProfile/character_id or Character.tribe_id on this endpoint).");
      }
      console.log("");
    }
  } else {
    console.log("Raw body (not JSON):");
    console.log(text.slice(0, 4000) + (text.length > 4000 ? "\n... (truncated)" : ""));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

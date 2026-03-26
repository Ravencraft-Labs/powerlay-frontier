#!/usr/bin/env node
/**
 * Debug Sui GraphQL for EVE Frontier tribe resolution (same path as `playerTribeFromChain.ts`).
 *
 * Prints: endpoint info, `chainIdentifier`, optional World Package object checks (Resources doc),
 * owned-object summary, `PlayerProfile` → `character_id` choice (Utopia → Stillness → first, same as app),
 * resolved World API base for tribe names, and `Character.tribe_id` when present.
 *
 * Usage:
 *   node scripts/debug-ef-graphql.mjs <walletAddress> [graphqlUrl]
 *   pnpm debug-graphql -- 0xabc... https://graphql.testnet.sui.io/graphql
 *
 * With plain `node`, do NOT pass a standalone `--` before the address (that becomes the "wallet").
 * Leading `--` args are stripped automatically.
 *
 * URL: 2nd CLI arg → POWERLAY_EF_GRAPHQL_URL → default testnet GraphQL.
 *
 * @see https://docs.evefrontier.com/tools/resources — World Package ids and World API bases
 * @see docs/contracts-integration.md — tribe resolution model
 */

const DEFAULT_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

/** Official "World Package" addresses — update when docs change */
const FRONTIER_WORLD_PACKAGE = {
  utopia:
    "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75",
  stillness:
    "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c",
};

const FRONTIER_RESOURCES_DOC = "https://docs.evefrontier.com/tools/resources";

const CHAIN_IDENTIFIER_QUERY = `
  query ChainIdentifier {
    chainIdentifier
  }
`;

const OBJECT_EXISTS_QUERY = `
  query ObjectExists($id: SuiAddress!) {
    object(address: $id) {
      address
    }
  }
`;

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
  POWERLAY_EF_GRAPHQL_URL        Used when [graphqlUrl] is omitted
  POWERLAY_EF_GRAPHQL_TIMEOUT_MS Optional timeout (default 15000 for this script)
  POWERLAY_EF_WORLD_API_BASE     Operator override for World API base (tribe display names)
  POWERLAY_EF_WORLD_API_DISABLE  If true, skip World API (app behavior)

Default URL if unset: ${DEFAULT_GRAPHQL_URL}
`);
}

/**
 * Human-readable guess from hostname only — chainIdentifier from the server is authoritative.
 */
function networkHintFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    if (host === "graphql.mainnet.sui.io" || host.endsWith(".mainnet.sui.io")) {
      return "Host suggests Sui mainnet public indexer.";
    }
    if (host === "graphql.testnet.sui.io" || (host.includes("testnet") && host.includes("sui.io"))) {
      return "Host suggests Sui Foundation public testnet indexer.";
    }
    if (host.includes("devnet.sui.io")) {
      return "Host suggests Sui devnet.";
    }
    if (host.includes("evefrontier")) {
      return "Host suggests EVE Frontier–related infrastructure.";
    }
    return "Unrecognized host — use chainIdentifier (below) and operator docs to identify the network.";
  } catch {
    return "Invalid URL.";
  }
}

/**
 * @returns {{ chainIdentifier: string | null, error?: string }}
 */
async function fetchChainIdentifier(graphqlUrl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 10_000));
  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: CHAIN_IDENTIFIER_QUERY }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return { chainIdentifier: null, error: "Response was not JSON" };
    }
    if (!res.ok) {
      return { chainIdentifier: null, error: `HTTP ${res.status}` };
    }
    if (json?.errors?.length) {
      const msg = json.errors.map((e) => e.message || String(e)).join("; ");
      return { chainIdentifier: null, error: msg };
    }
    const id = json?.data?.chainIdentifier;
    if (typeof id === "string" && id.trim()) {
      return { chainIdentifier: id.trim() };
    }
    return { chainIdentifier: null, error: "No data.chainIdentifier in response" };
  } catch (e) {
    if (e?.name === "AbortError") {
      return { chainIdentifier: null, error: "Timeout" };
    }
    return { chainIdentifier: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {{ found: boolean, error?: string }}
 */
async function probeObjectExists(graphqlUrl, objectAddress, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 10_000));
  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: OBJECT_EXISTS_QUERY,
        variables: { id: objectAddress },
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return { found: false, error: "Non-JSON response" };
    }
    if (!res.ok) {
      return { found: false, error: `HTTP ${res.status}` };
    }
    if (json?.errors?.length) {
      return { found: false, error: json.errors.map((e) => e.message || String(e)).join("; ") };
    }
    const obj = json?.data?.object;
    return { found: obj != null };
  } catch (e) {
    if (e?.name === "AbortError") {
      return { found: false, error: "Timeout" };
    }
    return { found: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ utopia: { found: boolean; error?: string }; stillness: { found: boolean; error?: string } }} r
 */
function inferFrontierDeployment(r) {
  const u = r.utopia.found;
  const s = r.stillness.found;
  if (u && !s) {
    return "Ledger: Utopia World Package object present; Stillness package not found — pair Utopia World API for names.";
  }
  if (!u && s) {
    return "Ledger: Stillness World Package present; Utopia package not found — pair Stillness World API for names.";
  }
  if (u && s) {
    return "Ledger: both official World Package objects exist on this endpoint (typical on shared testnet). Use PlayerProfile type prefix or POWERLAY_EF_WORLD_API_BASE to align with the app.";
  }
  const errU = r.utopia.error ? ` Utopia: ${r.utopia.error}.` : "";
  const errS = r.stillness.error ? ` Stillness: ${r.stillness.error}.` : "";
  return `Ledger: neither official World Package found (wrong network, or package ids changed in docs).${errU}${errS}`;
}

/** @param {string | null | undefined} typeRepr */
function frontierPublisherFromTypeRepr(typeRepr) {
  if (typeof typeRepr !== "string" || !typeRepr.includes("::")) return null;
  const lower = typeRepr.toLowerCase();
  const u = FRONTIER_WORLD_PACKAGE.utopia.toLowerCase();
  const st = FRONTIER_WORLD_PACKAGE.stillness.toLowerCase();
  if (lower.startsWith(`${u}::`)) return "utopia";
  if (lower.startsWith(`${st}::`)) return "stillness";
  return null;
}

function normalizeArgs(raw) {
  const a = [...raw];
  while (a.length && a[0] === "--") a.shift();
  return a;
}

/** @returns {{ objectAddress: string, characterId: string, typeRepr: string, pkg: string }[]} */
function collectPlayerProfilesDetailed(json) {
  const nodes = json?.data?.address?.objects?.nodes;
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const n of nodes) {
    const repr = n?.contents?.type?.repr ?? "";
    if (!repr.includes("::character::PlayerProfile")) continue;
    const cid = n?.contents?.json?.character_id;
    if (typeof cid !== "string" || !cid.trim()) continue;
    const pkg = frontierPublisherFromTypeRepr(repr);
    out.push({
      objectAddress: typeof n?.address === "string" ? n.address : "(unknown)",
      characterId: cid.trim(),
      typeRepr: repr,
      pkg: pkg ?? "unknown",
    });
  }
  return out;
}

/**
 * Same order as `playerTribeFromChain.ts`: Utopia package → Stillness → first.
 * @returns {{ profile: { objectAddress: string, characterId: string, typeRepr: string, pkg: string } | null, reason: string }}
 */
function pickPlayerProfileForTribe(profiles) {
  if (profiles.length === 0) {
    return { profile: null, reason: "No PlayerProfile with character_id in first 50 objects." };
  }
  if (profiles.length === 1) {
    return { profile: profiles[0], reason: "Single PlayerProfile in sample." };
  }
  const u = profiles.find((x) => x.pkg === "utopia");
  if (u) {
    return { profile: u, reason: "Multiple profiles — chose Utopia World Package (app priority)." };
  }
  const s = profiles.find((x) => x.pkg === "stillness");
  if (s) {
    return { profile: s, reason: "Multiple profiles — chose Stillness World Package (app priority)." };
  }
  return { profile: profiles[0], reason: "Multiple profiles, no known package id — first in GraphQL order." };
}

/**
 * @param {string} pkg "utopia" | "stillness" | "unknown"
 */
function resolveWorldApiBaseForPackageDebug(pkg) {
  const dis = process.env.POWERLAY_EF_WORLD_API_DISABLE?.trim().toLowerCase();
  if (dis === "1" || dis === "true" || dis === "yes") {
    return { base: "", note: "POWERLAY_EF_WORLD_API_DISABLE — name lookup skipped in app" };
  }
  const override = process.env.POWERLAY_EF_WORLD_API_BASE?.trim();
  if (override) {
    return { base: override, note: "POWERLAY_EF_WORLD_API_BASE override" };
  }
  if (pkg === "utopia") {
    return { base: DEFAULT_WORLD_API_UTOPIA, note: "Utopia PlayerProfile → Utopia World API (Resources doc)" };
  }
  return {
    base: DEFAULT_WORLD_API_STILLNESS,
    note: "Stillness or unknown package → Stillness World API default",
  };
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

  console.log("--- Sui GraphQL debug ---");
  console.log("Endpoint URL:     ", url);
  console.log("URL network hint: ", networkHintFromUrl(url));

  const chainMeta = await fetchChainIdentifier(url, timeoutMs);
  if (chainMeta.chainIdentifier) {
    console.log("Chain identifier: ", chainMeta.chainIdentifier);
    console.log("                  (from endpoint; unique per network genesis — compare across envs)");
  } else {
    console.log("Chain identifier: (unavailable)", chainMeta.error ? `— ${chainMeta.error}` : "");
  }

  console.log("");
  console.log("--- Frontier World Package objects (from Resources doc) ---");
  console.log("Doc:", FRONTIER_RESOURCES_DOC);
  const [utopiaProbe, stillnessProbe] = await Promise.all([
    probeObjectExists(url, FRONTIER_WORLD_PACKAGE.utopia, timeoutMs),
    probeObjectExists(url, FRONTIER_WORLD_PACKAGE.stillness, timeoutMs),
  ]);
  console.log(
    "Utopia World Package:   ",
    utopiaProbe.found ? "FOUND" : "not found",
    utopiaProbe.error && !utopiaProbe.found ? `(${utopiaProbe.error})` : ""
  );
  console.log("                        ", FRONTIER_WORLD_PACKAGE.utopia);
  console.log(
    "Stillness World Package:",
    stillnessProbe.found ? "FOUND" : "not found",
    stillnessProbe.error && !stillnessProbe.found ? `(${stillnessProbe.error})` : ""
  );
  console.log("                        ", FRONTIER_WORLD_PACKAGE.stillness);
  console.log("");
  console.log(inferFrontierDeployment({ utopia: utopiaProbe, stillness: stillnessProbe }));

  console.log("");
  console.log("Wallet address:   ", address);
  console.log("Timeout:          ", timeoutMs, "ms");
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
        const pub = frontierPublisherFromTypeRepr(r.typeRepr);
        if (pub) {
          console.log(
            `    → type publisher matches ${pub === "utopia" ? "Utopia" : "Stillness"} World Package (from docs)`
          );
        }
      }
      const publishers = [...new Set(rows.map((row) => frontierPublisherFromTypeRepr(row.typeRepr)).filter(Boolean))];
      if (publishers.length === 1) {
        const which = publishers[0] === "utopia" ? "Utopia" : "Stillness";
        console.log(
          `Summary: owned Move types here use the ${which} World Package — app maps tribe names via the matching World API host from ${FRONTIER_RESOURCES_DOC} (or POWERLAY_EF_WORLD_API_BASE).`
        );
      } else if (publishers.length > 1) {
        console.log(
          `Summary: mixed World Package publishers (${publishers.join(", ")}). App picks profile: Utopia → Stillness → first; World API base follows that choice unless POWERLAY_EF_WORLD_API_BASE is set.`
        );
      }
      console.log("");
    } else if (json.data && !json.errors?.length) {
      console.log("Hint: No nodes[] in data.address.objects — response shape may differ for this RPC version.");
    } else if (!json.data && !json.errors) {
      console.log("Hint: Unexpected shape — endpoint may not be GraphQL or returned non-JSON.");
    }

    if (!json.errors?.length) {
      const profileRows = collectPlayerProfilesDetailed(json);
      console.log("--- PlayerProfile → character_id (same rules as desktop app) ---");
      if (profileRows.length === 0) {
        console.log("No PlayerProfile in sample.");
      } else {
        console.log(`${profileRows.length} PlayerProfile(s):`);
        profileRows.forEach((p, i) => {
          console.log(`  [${i + 1}] ${p.objectAddress}  package=${p.pkg}  character_id=${p.characterId}`);
        });
      }
      const pick = pickPlayerProfileForTribe(profileRows);
      const characterId = pick.profile?.characterId ?? null;
      console.log("Selected character_id:", characterId ?? "(none)");
      console.log("Selection:", pick.reason);
      if (pick.profile) {
        const w = resolveWorldApiBaseForPackageDebug(pick.profile.pkg);
        console.log("World API base for tribe name (app):", w.base || "(none)");
        console.log("World API rule:", w.note);
      }
      console.log("");

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

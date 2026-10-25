// Travel journal fed by LogLite: every system change of the current game session, with how it happened
// (NPC stargate, deployable gate + its owner, ship jump, respawn). A session starts when the game client
// connects to the LogLite listener; earlier sessions are kept (capped) for "previous system" after a restart.
import { app } from "electron";
import fs from "fs";
import path from "path";
import type { TravelHop } from "@powerlay/core";
import { lookupGateOwner } from "../blockchain/gateOwners.js";

const MAX_HOPS = 2000;

export interface TravelLog {
  /** ISO time the current game session started (game client connected). */
  sessionStartedAt: string | null;
  hops: TravelHop[];
}

function travelLogPath(): string {
  const dir = path.join(app.getPath("userData"), "Powerlay");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "travel-log.json");
}

let log: TravelLog | null = null;

function load(): TravelLog {
  if (log) return log;
  try {
    log = JSON.parse(fs.readFileSync(travelLogPath(), "utf8")) as TravelLog;
  } catch {
    log = { sessionStartedAt: null, hops: [] };
  }
  return log;
}

function save(): void {
  if (log) fs.writeFileSync(travelLogPath(), JSON.stringify(log), "utf8");
}

export function startTravelSession(): void {
  load().sessionStartedAt = new Date().toISOString();
  save();
}

/** Records a hop; a deployable gate's owner is looked up on chain and filled in afterwards. */
export function recordHop(hop: TravelHop): void {
  const l = load();
  l.hops = [...l.hops, hop].slice(-MAX_HOPS);
  save();
  if (hop.via === "deployable-gate" && hop.gateId != null) void resolveOwner(hop);
}

const OWNER_RETRY_MS = 30_000;
/** Last owner lookup per hop, so a failing network isn't hit on every poll. */
const ownerTriedAt = new WeakMap<TravelHop, number>();

let gateOwnerListener: ((hop: TravelHop) => void) | null = null;

/** Called whenever a deployable gate hop gets its owner (e.g. to colour the map edge). */
export function onGateOwnerResolved(fn: (hop: TravelHop) => void): void {
  gateOwnerListener = fn;
}

async function resolveOwner(hop: TravelHop): Promise<void> {
  ownerTriedAt.set(hop, Date.now());
  hop.gateOwner = await lookupGateOwner(hop.gateId!);
  save();
  if (hop.gateOwner.kind !== "unknown") gateOwnerListener?.(hop);
}

/** Current session's hops, plus the last hop before it (so "previous system" survives a client restart). */
export function getTravel(): { sessionStartedAt: string | null; hops: TravelHop[]; lastHop: TravelHop | null } {
  const l = load();
  const since = l.sessionStartedAt ?? "";
  // Retry owner lookups that failed on the network (or were cut short by an app restart).
  for (const h of l.hops) {
    if (h.at < since || h.via !== "deployable-gate" || h.gateId == null) continue;
    if (h.gateOwner && h.gateOwner.kind !== "unknown") continue;
    if (Date.now() - (ownerTriedAt.get(h) ?? 0) < OWNER_RETRY_MS) continue;
    void resolveOwner(h);
  }
  return { sessionStartedAt: l.sessionStartedAt, hops: l.hops.filter((h) => h.at >= since), lastHop: l.hops.at(-1) ?? null };
}

export function clearTravelSession(): void {
  startTravelSession();
}

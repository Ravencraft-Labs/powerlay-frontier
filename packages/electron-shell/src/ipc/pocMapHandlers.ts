// POC (throwaway, not for release): Map tab data.
// - base: Cycle 6 system positions from data/poc-map/base.json (scripts/poc-map/build-base.mjs)
// - links: Cycle 7 name ↔ system ID, learned from in-game chat links copied to the clipboard
//   (`<url=showinfo:5//30020262>B88</url>`), paired with the current system from the Local chat log.
// - loglite: user-toggled stand-in for LogLite; session changes give the current system ID, stargate
//   jumps give edges, and a Local log line arriving with a session change binds name ↔ ID.
import { app, clipboard, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { classifyHop, type LogLiteEvent, type PendingJump, type TravelVia } from "@powerlay/core";
import { getDataRoot } from "./gameDataLoader.js";
import { loadSettings, saveSettings } from "./settingsStore.js";
import { clearTravelSession, getTravel, onGateOwnerResolved, recordHop, startTravelSession } from "./travelLog.js";
import { getCurrentSystem, onLocalSystemLine } from "../log/chatLogReader.js";
import { getLogLiteStatus, startLogLiteListener, stopLogLiteListener } from "../log/logLiteListener.js";

function pocDataDir(): string {
  const dir = path.join(app.getPath("userData"), "Powerlay");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** showinfo typeIDs: 3 = region, 4 = constellation, 5 = solar system. */
const LOCATION_LINK_RE = /<url=showinfo:([345])\/\/(\d+)>([^<]*)<\/url>/g;
/** Dragged links carry a kind prefix: `Solar System - DI7|021`; typed ones are just the typed text. */
const KIND_PREFIX_RE = /^(Solar System|Constellation|Region)\s*-\s*/i;

export interface PocSystemLink {
  id: number;
  /** Full Cycle 7 name when known (from the Local log or a full link text). */
  name: string | null;
  /** Raw link texts seen for this ID — often only the typed prefix. */
  linkTexts: string[];
  source: "current-system" | "link-text" | "prefix-only" | "loglite";
  at: string;
}

export interface PocAreaNames {
  regions: Record<string, string>;
  constellations: Record<string, string>;
}

function areaNamesPath(): string {
  return path.join(pocDataDir(), "poc-area-names.json");
}

function loadAreaNames(): PocAreaNames {
  try {
    return JSON.parse(fs.readFileSync(areaNamesPath(), "utf8")) as PocAreaNames;
  } catch {
    return { regions: {}, constellations: {} };
  }
}

function linksPath(): string {
  return path.join(pocDataDir(), "poc-system-links.json");
}

function loadLinks(): Record<string, PocSystemLink> {
  try {
    return JSON.parse(fs.readFileSync(linksPath(), "utf8")) as Record<string, PocSystemLink>;
  } catch {
    return {};
  }
}

/** Cycle 7 names look like `G48|L11`, `OV1-6KH`, `B.VXV.W2E`: a typed prefix usually won't. */
function looksLikeFullName(text: string): boolean {
  return /^[A-Z0-9]{1,4}[|.\- ][A-Z0-9]{2,4}([|.\- ][A-Z0-9]{1,4})?$/i.test(text.trim());
}

function ingestClipboard(text: string): PocSystemLink[] {
  const all = [...text.matchAll(LOCATION_LINK_RE)].map((m) => {
    const raw = m[3].trim();
    return { kind: m[1], id: Number(m[2]), linkText: raw.replace(KIND_PREFIX_RE, ""), hadPrefix: KIND_PREFIX_RE.test(raw) };
  });

  const areas = all.filter((f) => f.kind !== "5" && f.linkText);
  if (areas.length > 0) {
    const names = loadAreaNames();
    for (const a of areas) (a.kind === "3" ? names.regions : names.constellations)[a.id] = a.linkText;
    fs.writeFileSync(areaNamesPath(), JSON.stringify(names, null, 2), "utf8");
  }

  const found = all.filter((f) => f.kind === "5");
  if (found.length === 0) return [];
  const links = loadLinks();
  const current = getCurrentSystem();
  const changed: PocSystemLink[] = [];
  for (const { id, linkText, hadPrefix } of found) {
    const prev = links[id];
    let name = prev?.name ?? null;
    let source = prev?.source ?? "prefix-only";
    // A single link whose text is a prefix of where we are → it's the current system.
    if (found.length === 1 && current && current.toLowerCase().startsWith(linkText.toLowerCase())) {
      name = current;
      source = "current-system";
    } else if (hadPrefix && linkText) {
      // Dragged link: the text is the full name.
      name = linkText;
      source = "link-text";
    } else if (!name && looksLikeFullName(linkText)) {
      name = linkText;
      source = "link-text";
    }
    const linkTexts = [...new Set([...(prev?.linkTexts ?? []), linkText])];
    links[id] = { id, name, linkTexts, source, at: new Date().toISOString() };
    changed.push(links[id]);
  }
  fs.writeFileSync(linksPath(), JSON.stringify(links, null, 2), "utf8");
  return changed;
}

/** System IDs from `showinfo:5` links, in the order they appear in the text. */
function systemIdsInOrder(text: string): number[] {
  return [...text.matchAll(LOCATION_LINK_RE)].filter((m) => m[1] === "5").map((m) => Number(m[2]));
}

// --- Cycle 7 connections, confirmed in game (Adjacent Solar Systems / Route tabs) ---

export interface PocEdge {
  a: number;
  b: number;
  /** "jump": through an NPC stargate; "deployable": through an anchored gate or catapult. */
  source: "adjacent" | "route" | "jump" | "deployable";
  /** Gate used, when the edge came from a jump. */
  gateId?: number;
  /** Deployable edges: "player" = on-chain gate, "offchain" = catapult or server gate; unset until looked up. */
  gateOwner?: "player" | "offchain";
  /** Player gates: the owner's tribe. */
  gateTribeId?: number;
  at: string;
}

function edgesPath(): string {
  return path.join(pocDataDir(), "poc-edges.json");
}

/**
 * One NPC connection per system pair; every deployable gate (player gate, catapult) is a connection of its own,
 * so a pair can have an NPC stargate and one or more gates at the same time.
 */
function edgeKey(e: Pick<PocEdge, "a" | "b" | "source" | "gateId">): string {
  return e.source === "deployable" ? `${e.a}-${e.b}-g${e.gateId ?? "?"}` : `${e.a}-${e.b}`;
}

function loadEdges(): Record<string, PocEdge> {
  try {
    const raw = JSON.parse(fs.readFileSync(edgesPath(), "utf8")) as Record<string, PocEdge>;
    // Older files keyed deployable edges by the pair alone; re-key so they don't block the NPC link.
    return Object.fromEntries(Object.values(raw).map((e) => [edgeKey(e), e]));
  } catch {
    return {};
  }
}

function saveEdges(pairs: [number, number][], source: PocEdge["source"], gateId?: number): PocEdge[] {
  const edges = loadEdges();
  const added: PocEdge[] = [];
  for (const [x, y] of pairs) {
    if (x === y) continue;
    const edge: PocEdge = { a: Math.min(x, y), b: Math.max(x, y), source, ...(gateId != null && { gateId }), at: new Date().toISOString() };
    const key = edgeKey(edge);
    if (!edges[key]) added.push((edges[key] = edge));
  }
  fs.writeFileSync(edgesPath(), JSON.stringify(edges, null, 2), "utf8");
  return added;
}

function setEdgeGateOwner(x: number, y: number, gateId: number, gateOwner: NonNullable<PocEdge["gateOwner"]>, tribeId: number | null): void {
  const edges = loadEdges();
  const e = edges[edgeKey({ a: Math.min(x, y), b: Math.max(x, y), source: "deployable", gateId })];
  if (!e || (e.gateOwner === gateOwner && (e.gateTribeId ?? null) === tribeId)) return;
  e.gateOwner = gateOwner;
  if (tribeId != null) e.gateTribeId = tribeId;
  else delete e.gateTribeId;
  fs.writeFileSync(edgesPath(), JSON.stringify(edges, null, 2), "utf8");
}

/** ID of the current system: straight from LogLite while connected, else via the Local log name. */
function currentSystemId(): number | null {
  if (logLiteSystemId != null && getLogLiteStatus().state === "connected") return logLiteSystemId;
  const current = getCurrentSystem();
  return current ? systemIdByName(current) : null;
}

/**
 * ID for a system name as players see it (Local log, chat links). Cycle 7 names come from the
 * server, so the only source is what LogLite and chat links have bound so far.
 */
export function systemIdByName(name: string): number | null {
  if (name === getCurrentSystem()) {
    if (logLiteSystemId != null && getLogLiteStatus().state === "connected") return logLiteSystemId;
  }
  const n = name.toLowerCase();
  return Object.values(loadLinks()).find((l) => l.name?.toLowerCase() === n)?.id ?? null;
}

export interface PocEdgeResult {
  anchorId?: number | null;
  ingested: PocSystemLink[];
  added: PocEdge[];
  error?: string;
}

/** Links copied from "Adjacent Solar Systems": each one is a neighbour of the anchor system. */
function addAdjacent(text: string, anchorId: number | null): PocEdgeResult {
  const ingested = ingestClipboard(text);
  const anchor = anchorId ?? currentSystemId();
  if (anchor == null) return { anchorId: null, ingested, added: [], error: "Current system ID unknown — link it from chat first" };
  const ids = systemIdsInOrder(text).filter((id) => id !== anchor);
  if (ids.length === 0) return { anchorId: anchor, ingested, added: [], error: "No system links in clipboard" };
  return { anchorId: anchor, ingested, added: saveEdges(ids.map((id) => [anchor, id]), "adjacent") };
}

/** Links copied from the "Route" tab, in order: consecutive systems are one jump apart; the route starts here. */
function addRoute(text: string): PocEdgeResult {
  const ingested = ingestClipboard(text);
  const ids = systemIdsInOrder(text);
  if (ids.length === 0) return { ingested, added: [], error: "No system links in clipboard" };
  const start = currentSystemId();
  const chain = start != null && ids[0] !== start ? [start, ...ids] : ids;
  const pairs: [number, number][] = [];
  for (let i = 1; i < chain.length; i++) pairs.push([chain[i - 1], chain[i]]);
  return {
    anchorId: start,
    ingested,
    added: saveEdges(pairs, "route"),
    error: start == null ? "Current system ID unknown — the first jump from here was not recorded" : undefined,
  };
}

// --- LogLite → map ---

export interface PocLogLiteFeedItem {
  at: string;
  kind: "connected" | "disconnected" | "system" | "jump" | "hop" | "edge-added" | "edge-known" | "name-bound" | "warp";
  text: string;
}

/** A Local log line and a session change this close together describe the same arrival. */
const NAME_BIND_WINDOW_MS = 10_000;
const FEED_LIMIT = 30;

let logLiteSystemId: number | null = null;
let lastSession: { systemId: number; receivedAt: number } | null = null;
let lastLocal: { name: string; receivedAt: number } | null = null;
let pendingJump: PendingJump | null = null;
let feed: PocLogLiteFeedItem[] = [];
let stopLocalListener: (() => void) | null = null;

function pushFeed(kind: PocLogLiteFeedItem["kind"], text: string): void {
  feed = [{ at: new Date().toISOString(), kind, text }, ...feed].slice(0, FEED_LIMIT);
}

function systemLabel(id: number): string {
  const name = loadLinks()[id]?.name;
  return name ? `${name} (${id})` : String(id);
}

function bindName(id: number, name: string): void {
  const links = loadLinks();
  const prev = links[id];
  if (prev?.name === name) return;
  links[id] = { id, name, linkTexts: prev?.linkTexts ?? [], source: "loglite", at: new Date().toISOString() };
  fs.writeFileSync(linksPath(), JSON.stringify(links, null, 2), "utf8");
  pushFeed("name-bound", `${name} = ${id}`);
}

function tryBindName(): void {
  if (!lastSession || !lastLocal) return;
  if (Math.abs(lastSession.receivedAt - lastLocal.receivedAt) > NAME_BIND_WINDOW_MS) return;
  bindName(lastSession.systemId, lastLocal.name);
}

function onLogLiteEvent(event: LogLiteEvent): void {
  const now = Date.now();
  if (event.kind === "jump") {
    const fromSystemId = event.fromSystemId ?? logLiteSystemId;
    pendingJump = { gate: event.gate, gateId: event.gateId, fromSystemId, receivedAt: now };
    const via = event.gate === "stargate" ? "stargate" : "deployable gate";
    pushFeed("jump", `Jumping${fromSystemId != null ? ` from ${systemLabel(fromSystemId)}` : ""} via ${via} ${event.gateId}`);
    return;
  }
  if (event.kind === "warp") {
    pushFeed("warp", event.state === "start" ? "Warp started" : "Warp ended");
    return;
  }

  logLiteSystemId = event.systemId;
  lastSession = { systemId: event.systemId, receivedAt: now };
  tryBindName();
  pushFeed("system", `Current system: ${systemLabel(event.systemId)}`);

  const hop = classifyHop(event, pendingJump, now, new Date(now).toISOString());
  pendingJump = null;
  if (!hop) return;
  recordHop(hop);
  pushFeed("hop", `${VIA_LABEL[hop.via]}: ${systemLabel(hop.fromSystemId)} → ${systemLabel(hop.toSystemId)}`);
  // Only gates make connections; a ship jump or respawn can cross any distance.
  if (hop.via === "stargate" || hop.via === "deployable-gate") {
    const added = saveEdges([[hop.fromSystemId, hop.toSystemId]], hop.via === "stargate" ? "jump" : "deployable", hop.gateId);
    const label = `${systemLabel(hop.fromSystemId)} ↔ ${systemLabel(hop.toSystemId)}`;
    pushFeed(added.length > 0 ? "edge-added" : "edge-known", added.length > 0 ? `New link on map: ${label}` : `Link already known: ${label}`);
  }
}

const VIA_LABEL: Record<TravelVia, string> = {
  stargate: "Stargate",
  "deployable-gate": "Deployable gate",
  "ship-jump": "Ship jump",
  respawn: "Respawn",
};

function setLogLite(on: boolean): void {
  // Remembered so travel keeps being recorded after an app restart.
  if (loadSettings().logLite !== on) saveSettings({ ...loadSettings(), logLite: on });
  stopLocalListener?.();
  stopLocalListener = null;
  stopLogLiteListener();
  logLiteSystemId = null;
  lastSession = lastLocal = pendingJump = null;
  if (!on) return;
  feed = [];
  stopLocalListener = onLocalSystemLine((name) => {
    lastLocal = { name, receivedAt: Date.now() };
    tryBindName();
  });
  startLogLiteListener({
    onEvent: onLogLiteEvent,
    onConnection: (connected) => {
      // A client connecting is a new game session: the travel path starts over.
      if (connected) startTravelSession();
      pushFeed(connected ? "connected" : "disconnected", connected ? "Game client connected" : "Game client disconnected");
    },
  });
}

let clipboardTimer: ReturnType<typeof setInterval> | null = null;
let lastClipboard = "";
let lastIngested: PocSystemLink[] = [];

export function registerPocMapHandlers(): void {
  onGateOwnerResolved((hop) => {
    const o = hop.gateOwner;
    if (hop.gateId == null || !o || o.kind === "unknown") return;
    setEdgeGateOwner(hop.fromSystemId, hop.toSystemId, hop.gateId, o.kind, o.kind === "player" ? o.tribeId : null);
  });
  if (loadSettings().logLite) setLogLite(true);

  ipcMain.handle("pocMap:get-travel", () => getTravel());
  ipcMain.handle("pocMap:clear-travel", () => {
    clearTravelSession();
    return getTravel();
  });

  ipcMain.handle("pocMap:watch-clipboard", async (_event, on: boolean) => {
    if (clipboardTimer) clearInterval(clipboardTimer);
    clipboardTimer = null;
    if (!on) return;
    // Clipboard reads are async since Electron 44; skip a tick while the previous read is pending.
    lastClipboard = await clipboard.readText();
    let reading = false;
    clipboardTimer = setInterval(async () => {
      if (reading) return;
      reading = true;
      try {
        const text = await clipboard.readText();
        if (text === lastClipboard) return;
        lastClipboard = text;
        const changed = ingestClipboard(text);
        if (changed.length > 0) lastIngested = changed;
      } finally {
        reading = false;
      }
    }, 700);
  });

  ipcMain.handle("pocMap:get-links", () => ({
    links: Object.values(loadLinks()),
    lastIngested,
    areaNames: loadAreaNames(),
    edges: Object.values(loadEdges()),
    currentSystemId: currentSystemId(),
  }));

  ipcMain.handle("pocMap:add-adjacent", async (_event, anchorId: number | null, text?: string) =>
    addAdjacent(text ?? (await clipboard.readText()), anchorId),
  );

  ipcMain.handle("pocMap:add-route", async (_event, text?: string) => addRoute(text ?? (await clipboard.readText())));

  ipcMain.handle("pocMap:ingest-text", (_event, text: string) => ingestClipboard(text));

  ipcMain.handle("pocMap:ingest-clipboard", async () => {
    const changed = ingestClipboard(await clipboard.readText());
    if (changed.length > 0) lastIngested = changed;
    return changed;
  });

  ipcMain.handle("pocMap:get-base", () => {
    const p = path.join(getDataRoot(), "data", "poc-map", "base.json");
    if (!fs.existsSync(p)) return { error: `Missing ${p}. Run: node scripts/poc-map/build-base.mjs` };
    return JSON.parse(fs.readFileSync(p, "utf8"));
  });

  ipcMain.handle("pocMap:loglite-set", (_event, on: boolean) => {
    setLogLite(on);
    return getLogLiteStatus();
  });

  ipcMain.handle("pocMap:loglite-status", () => ({ ...getLogLiteStatus(), currentSystemId: logLiteSystemId, feed }));
}

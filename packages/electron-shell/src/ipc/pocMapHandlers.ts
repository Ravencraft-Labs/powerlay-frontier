// POC (throwaway, not for release): Map tab data.
// - base: Cycle 6 system positions from data/poc-map/base.json (scripts/poc-map/build-base.mjs)
// - links: Cycle 7 name ↔ system ID, learned from in-game chat links copied to the clipboard
//   (`<url=showinfo:5//30020262>B88</url>`), paired with the current system from the Local chat log.
// - loglite: user-toggled stand-in for LogLite; session changes give the current system ID, stargate
//   jumps give edges, and a Local log line arriving with a session change binds name ↔ ID.
import { app, clipboard, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import type { LogLiteEvent } from "@powerlay/core";
import { getDataRoot } from "./gameDataLoader.js";
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
  source: "adjacent" | "route" | "jump";
  /** Stargate used, when the edge came from a jump. */
  gateId?: number;
  at: string;
}

function edgesPath(): string {
  return path.join(pocDataDir(), "poc-edges.json");
}

function loadEdges(): Record<string, PocEdge> {
  try {
    return JSON.parse(fs.readFileSync(edgesPath(), "utf8")) as Record<string, PocEdge>;
  } catch {
    return {};
  }
}

function saveEdges(pairs: [number, number][], source: PocEdge["source"], gateId?: number): PocEdge[] {
  const edges = loadEdges();
  const added: PocEdge[] = [];
  for (const [x, y] of pairs) {
    if (x === y) continue;
    const a = Math.min(x, y), b = Math.max(x, y);
    const key = `${a}-${b}`;
    if (!edges[key]) added.push((edges[key] = { a, b, source, ...(gateId != null && { gateId }), at: new Date().toISOString() }));
  }
  fs.writeFileSync(edgesPath(), JSON.stringify(edges, null, 2), "utf8");
  return added;
}

/** ID of the current system: straight from LogLite while connected, else via the Local log name. */
function currentSystemId(): number | null {
  if (logLiteSystemId != null && getLogLiteStatus().state === "connected") return logLiteSystemId;
  const current = getCurrentSystem()?.toLowerCase();
  if (!current) return null;
  return Object.values(loadLinks()).find((l) => l.name?.toLowerCase() === current)?.id ?? null;
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
  kind: "connected" | "disconnected" | "system" | "jump" | "edge-added" | "edge-known" | "name-bound" | "warp";
  text: string;
}

/** A Local log line and a session change this close together describe the same arrival. */
const NAME_BIND_WINDOW_MS = 10_000;
/** Session change this soon after a stargate jump from the old system is that jump landing. */
const JUMP_LANDING_WINDOW_MS = 60_000;
const FEED_LIMIT = 30;

let logLiteSystemId: number | null = null;
let lastSession: { systemId: number; receivedAt: number } | null = null;
let lastLocal: { name: string; receivedAt: number } | null = null;
let pendingJump: { fromSystemId: number; gateId: number; receivedAt: number } | null = null;
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
    pendingJump = { fromSystemId: event.fromSystemId, gateId: event.gateId, receivedAt: now };
    pushFeed("jump", `Jumping from ${systemLabel(event.fromSystemId)} via gate ${event.gateId}`);
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

  const jump = pendingJump;
  pendingJump = null;
  if (
    jump &&
    event.fromSystemId === jump.fromSystemId &&
    event.systemId !== jump.fromSystemId &&
    now - jump.receivedAt <= JUMP_LANDING_WINDOW_MS
  ) {
    const added = saveEdges([[jump.fromSystemId, event.systemId]], "jump", jump.gateId);
    const label = `${systemLabel(jump.fromSystemId)} ↔ ${systemLabel(event.systemId)}`;
    pushFeed(added.length > 0 ? "edge-added" : "edge-known", added.length > 0 ? `New link on map: ${label}` : `Link already known: ${label}`);
  }
}

function setLogLite(on: boolean): void {
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
    onConnection: (connected) => pushFeed(connected ? "connected" : "disconnected", connected ? "Game client connected" : "Game client disconnected"),
  });
}

let clipboardTimer: ReturnType<typeof setInterval> | null = null;
let lastClipboard = "";
let lastIngested: PocSystemLink[] = [];

export function registerPocMapHandlers(): void {
  ipcMain.handle("pocMap:watch-clipboard", (_event, on: boolean) => {
    if (clipboardTimer) clearInterval(clipboardTimer);
    clipboardTimer = null;
    if (!on) return;
    lastClipboard = clipboard.readText();
    clipboardTimer = setInterval(() => {
      const text = clipboard.readText();
      if (text === lastClipboard) return;
      lastClipboard = text;
      const changed = ingestClipboard(text);
      if (changed.length > 0) lastIngested = changed;
    }, 700);
  });

  ipcMain.handle("pocMap:get-links", () => ({
    links: Object.values(loadLinks()),
    lastIngested,
    areaNames: loadAreaNames(),
    edges: Object.values(loadEdges()),
    currentSystemId: currentSystemId(),
  }));

  ipcMain.handle("pocMap:add-adjacent", (_event, anchorId: number | null, text?: string) =>
    addAdjacent(text ?? clipboard.readText(), anchorId),
  );

  ipcMain.handle("pocMap:add-route", (_event, text?: string) => addRoute(text ?? clipboard.readText()));

  ipcMain.handle("pocMap:ingest-text", (_event, text: string) => ingestClipboard(text));

  ipcMain.handle("pocMap:ingest-clipboard", () => {
    const changed = ingestClipboard(clipboard.readText());
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

import { app } from "electron";
import fs from "fs";
import path from "path";
import type { ScoutActivityEvent, ScoutEntry, CreateScoutEntryInput } from "@powerlay/core";

const FILENAME = "scout-activity-log.json";

function getDataPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILENAME);
}

function loadLog(): ScoutActivityEvent[] {
  const filePath = getDataPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as ScoutActivityEvent[]) : [];
  } catch {
    return [];
  }
}

function appendEvent(event: ScoutActivityEvent): void {
  const log = loadLog();
  log.push(event);
  // Keep last 1000 events to avoid unbounded growth
  const trimmed = log.slice(-1000);
  fs.writeFileSync(getDataPath(), JSON.stringify(trimmed, null, 2), "utf-8");
}

function generateId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function logCreated(entry: ScoutEntry, input: CreateScoutEntryInput): void {
  appendEvent({
    id: generateId(),
    entryId: entry.id,
    action: "created",
    actor: input.reporter,
    system: entry.system,
    subtype: entry.subtype,
    zone: entry.zone,
    timestamp: new Date().toISOString(),
  });
}

export function logCleared(entry: ScoutEntry, actor: string): void {
  appendEvent({
    id: generateId(),
    entryId: entry.id,
    action: "cleared",
    actor,
    system: entry.system,
    subtype: entry.subtype,
    zone: entry.zone,
    timestamp: new Date().toISOString(),
  });
}

export function logDeleted(entry: ScoutEntry, actor: string): void {
  appendEvent({
    id: generateId(),
    entryId: entry.id,
    action: "deleted",
    actor,
    system: entry.system,
    subtype: entry.subtype,
    zone: entry.zone,
    timestamp: new Date().toISOString(),
  });
}

export function getActivityLog(limit = 200): ScoutActivityEvent[] {
  const log = loadLog();
  return log.slice(-limit).reverse(); // newest first
}

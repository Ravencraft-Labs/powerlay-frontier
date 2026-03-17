import { app } from "electron";
import fs from "fs";
import path from "path";
import { parseLogLineTimestamp, parseMiningLine } from "@powerlay/core";
import type { TypesMap } from "@powerlay/core";
import { appLog } from "./appLogger.js";
import { createFileTailer } from "./fileTailer.js";

export type MiningByBuild = Record<string, Record<number, number>>;

const MINING_STATE_FILE = "mining-log-state.json";

function getMiningStatePath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, MINING_STATE_FILE);
}

function loadPersistedState(): MiningByBuild {
  try {
    const p = getMiningStatePath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Record<string, Record<string, number>>;
    const result: MiningByBuild = {};
    for (const [buildId, byType] of Object.entries(data)) {
      if (byType && typeof byType === "object") {
        result[buildId] = {};
        for (const [k, v] of Object.entries(byType)) {
          const typeID = parseInt(k, 10);
          if (Number.isFinite(typeID) && typeof v === "number") result[buildId][typeID] = v;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

function persistState(): void {
  try {
    const p = getMiningStatePath();
    fs.writeFileSync(p, JSON.stringify(miningState, null, 0), "utf-8");
  } catch (err) {
    appLog.warn("miningLogReader: failed to persist state", { error: String(err) });
  }
}

let miningState: MiningByBuild = loadPersistedState();
let selectedBuildId: string | null = null;
let plannedVolByTypeId: Record<number, number> | null = null;
let logReaderError: string | null = null;
let tailerStop: (() => void) | null = null;
let trackingActive = false;
let trackingStartTime: number = 0;

function findTypeIdByName(types: TypesMap, oreName: string): number | null {
  const q = oreName.trim().toLowerCase();
  if (!q) return null;
  for (const key of Object.keys(types)) {
    const t = types[key];
    const name = (t?.name ?? "").trim().toLowerCase();
    if (name === q) return t.typeID;
  }
  return null;
}

export function addMiningEvent(typeID: number, volume: number): void {
  if (!selectedBuildId) return;
  const build = miningState[selectedBuildId] ?? {};
  const current = build[typeID] ?? 0;
  const needed = plannedVolByTypeId?.[typeID];
  const toAdd =
    needed != null ? Math.max(0, Math.min(volume, needed - current)) : volume;
  if (toAdd <= 0) return;
  build[typeID] = current + toAdd;
  miningState[selectedBuildId] = build;
  persistState();
}

export function getMiningState(): MiningByBuild {
  return JSON.parse(JSON.stringify(miningState));
}

export function getLogReaderError(): string | null {
  return logReaderError;
}

export function getTrackingActive(): boolean {
  return trackingActive;
}

export function setSelectedBuild(buildId: string | null): void {
  selectedBuildId = buildId;
}

export function setPlannedVolumes(planned: Record<number, number> | null): void {
  plannedVolByTypeId = planned;
}

export function setMiningState(state: MiningByBuild): void {
  miningState = state;
  persistState();
}

export function resetMiningForBuild(buildId: string): void {
  delete miningState[buildId];
  persistState();
}

export function startTracking(
  logDir: string,
  types: TypesMap,
  pollIntervalMs: number = 1000,
  planned?: Record<number, number>
): void {
  trackingActive = true;
  trackingStartTime = Date.now();
  plannedVolByTypeId = planned ?? null;
  startMiningLogReader(logDir, types, pollIntervalMs);
}

export function stopTracking(): void {
  trackingActive = false;
  stopMiningLogReader();
}

export function startMiningLogReader(
  logDir: string,
  types: TypesMap,
  pollIntervalMs: number = 1000
): void {
  stopMiningLogReader();
  logReaderError = null;

  const tailer = createFileTailer({
    logDir,
    pollIntervalMs,
    onLine: (line) => {
      const lineTime = parseLogLineTimestamp(line);
      if (lineTime === null || lineTime < trackingStartTime) return;
      const event = parseMiningLine(line);
      if (!event) return;
      const typeID = findTypeIdByName(types, event.oreName);
      if (typeID == null) {
        appLog.warn("miningLogReader: unknown ore name", { oreName: event.oreName });
        return;
      }
      const t = types[String(typeID)];
      const volume = (t?.volume ?? 0) * event.quantity;
      if (volume <= 0) return;
      addMiningEvent(typeID, volume);
    },
    onError: (err) => {
      logReaderError = err;
      if (err) {
        appLog.warn("miningLogReader: log access issue", { error: err });
      }
    },
  });

  tailer.start();
  tailerStop = tailer.stop;
  const expanded = logDir
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || "")
    .replace(/%HOME%/gi, process.env.HOME || "")
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || "")
    .replace(/%APPDATA%/gi, process.env.APPDATA || "");
  appLog.info("miningLogReader started", { logDir, resolvedPath: path.resolve(expanded) });
}

export function stopMiningLogReader(): void {
  if (tailerStop) {
    tailerStop();
    tailerStop = null;
  }
  appLog.info("miningLogReader stopped");
}

import { app } from "electron";
import fs from "fs";
import path from "path";
import type { ScoutSettings } from "@powerlay/core";

const FILENAME = "scout-settings.json";

const DEFAULTS: ScoutSettings = {
  defaultVisibility: "tribe",
  systemOverride: null,
};

function getDataPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILENAME);
}

export function loadScoutSettings(): ScoutSettings {
  const filePath = getDataPath();
  if (!fs.existsSync(filePath)) return { ...DEFAULTS };
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Partial<ScoutSettings>;
    return {
      defaultVisibility: data.defaultVisibility ?? DEFAULTS.defaultVisibility,
      systemOverride: data.systemOverride ?? null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveScoutSettings(settings: ScoutSettings): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(settings, null, 2), "utf-8");
}

export function updateScoutSettings(patch: Partial<ScoutSettings>): ScoutSettings {
  const current = loadScoutSettings();
  const updated: ScoutSettings = { ...current, ...patch };
  saveScoutSettings(updated);
  return updated;
}

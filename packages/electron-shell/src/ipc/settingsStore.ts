import { app } from "electron";
import fs from "fs";
import path from "path";

const SETTINGS_FILE = "settings.json";

function getSettingsPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, SETTINGS_FILE);
}

export interface AppSettings {
  gameLogDir?: string;
  skipLogPrompt?: boolean;
}

const DEFAULT_GAME_LOG_DIR =
  process.platform === "win32"
    ? "%USERPROFILE%\\Documents\\Frontier\\Logs\\Gamelogs"
    : `${process.env.HOME || "~"}/Documents/Frontier/Logs/Gamelogs`;

const defaults: AppSettings = {
  gameLogDir: DEFAULT_GAME_LOG_DIR,
};

export function loadSettings(): AppSettings {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return { ...defaults };
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Partial<AppSettings>;
    return { ...defaults, ...data };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    const p = getSettingsPath();
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

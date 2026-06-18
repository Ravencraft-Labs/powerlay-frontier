import { app } from "electron";
import fs from "fs";
import path from "path";

const DEFAULT_WORLD_CONTRACTS_PACKAGE_ID_STILLNESS =
  "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";
const DEFAULT_CONTRACTS_API_BASE_STILLNESS = "https://stillness-back.ravencraft.dev/api/v1";
const DEFAULT_STORAGE_API_BASE_STILLNESS = "https://stillness-back.ravencraft.dev/api/v1";

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
  /** World-contracts package id used for wallet sign flows (connect storage, contract delivery). */
  worldContractsPackageId?: string;
  /** Contracts backend base URL including `/api/v1`. */
  contractsApiBase?: string;
  /** Storage backend base URL including `/api/v1`. */
  storageApiBase?: string;
  /** Overlay background opacity, 0–100. Default 92. */
  overlayOpacity?: number;
}

const DEFAULT_GAME_LOG_DIR =
  process.platform === "win32"
    ? "%USERPROFILE%\\Documents\\Frontier\\Logs\\Gamelogs"
    : `${process.env.HOME || "~"}/Documents/Frontier/Logs/Gamelogs`;

const defaults: AppSettings = {
  gameLogDir: DEFAULT_GAME_LOG_DIR,
  worldContractsPackageId: DEFAULT_WORLD_CONTRACTS_PACKAGE_ID_STILLNESS,
  contractsApiBase: DEFAULT_CONTRACTS_API_BASE_STILLNESS,
  storageApiBase: DEFAULT_STORAGE_API_BASE_STILLNESS,
  overlayOpacity: 92,
};

export function loadSettings(): AppSettings {
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return { ...defaults };
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    delete data.efGraphqlUrl;
    delete data.efWorldApiBaseUrl;
    return { ...defaults, ...(data as Partial<AppSettings>) };
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

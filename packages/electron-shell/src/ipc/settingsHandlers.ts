import { ipcMain } from "electron";
import { loadSettings, saveSettings, type AppSettings } from "./settingsStore.js";
import { restartMiningReader } from "../log/restartMiningReader.js";
import { resolvePlayerTribe } from "../blockchain/tribeResolve.js";
import { resetContractsHttpBackend } from "../contracts/contractsHttpBackend.js";
import { resetStorageHttpBackend } from "../storage/storageHttpBackend.js";

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:set", async (_event, settings: Partial<AppSettings>) => {
    const current = loadSettings();
    const hadGameLogDir = "gameLogDir" in settings;
    const hadWorldPkg = "worldContractsPackageId" in settings;
    const hadContractsApiBase = "contractsApiBase" in settings;
    const hadStorageApiBase = "storageApiBase" in settings;
    saveSettings({ ...current, ...settings });
    if (hadGameLogDir) {
      await restartMiningReader();
    }
    if (hadContractsApiBase) {
      resetContractsHttpBackend();
    }
    if (hadStorageApiBase) {
      resetStorageHttpBackend();
    }
    if (hadWorldPkg) {
      // Keep session.characterId aligned with chosen world package (Stillness/Utopia) after setting changes.
      await resolvePlayerTribe().catch(() => { /* best effort */ });
    }
  });
}

import { ipcMain } from "electron";
import { loadSettings, saveSettings, type AppSettings } from "./settingsStore.js";
import { restartMiningReader } from "../log/restartMiningReader.js";

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:set", async (_event, settings: Partial<AppSettings>) => {
    const current = loadSettings();
    const hadGameLogDir = "gameLogDir" in settings;
    saveSettings({ ...current, ...settings });
    if (hadGameLogDir) {
      await restartMiningReader();
    }
  });
}

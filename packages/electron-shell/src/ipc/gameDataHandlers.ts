import { ipcMain } from "electron";
import { loadGameData } from "./gameDataLoader.js";

export function registerGameDataHandlers(): void {
  ipcMain.handle("gameData:get", async () => loadGameData());
}

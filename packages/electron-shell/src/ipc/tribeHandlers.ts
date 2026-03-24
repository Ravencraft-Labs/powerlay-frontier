/**
 * IPC handlers for tribe resolution. Merge tribe into session after chain/dev resolve.
 */
import { ipcMain } from "electron";
import { resolvePlayerTribe } from "../blockchain/tribeResolve.js";

export function registerTribeHandlers(): void {
  ipcMain.handle("tribe:resolve", async () => {
    return resolvePlayerTribe();
  });
}

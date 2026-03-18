import { ipcMain } from "electron";
import {
  getMiningState,
  getLogReaderError,
  getTrackingActive,
  getTrackingBuildId,
  setSelectedBuild,
  setMiningState,
  resetMiningForBuild,
  startTracking,
  stopTracking,
} from "../log/miningLogReader.js";
import { getTailerTestError } from "../log/tailerTest.js";
import { loadGameData } from "./gameDataLoader.js";
import { loadSettings } from "./settingsStore.js";

export function registerMiningHandlers(): void {
  ipcMain.handle("mining:get-state", () => getMiningState());
  ipcMain.handle("mining:get-errors", () => ({
    tailerTestError: getTailerTestError(),
    logReaderError: getLogReaderError(),
    trackingActive: getTrackingActive(),
    trackingBuildId: getTrackingBuildId(),
  }));
  ipcMain.handle(
    "mining:start-tracking",
    async (
      _event,
      opts?: { buildId?: string; plannedVolByTypeId?: Record<number, number> }
    ) => {
      const gameData = await loadGameData();
      const settings = loadSettings();
      const logDir =
        settings.gameLogDir ??
        "%USERPROFILE%\\Documents\\Frontier\\Logs\\Gamelogs";
      if (gameData.types && Object.keys(gameData.types).length > 0) {
        if (opts?.buildId != null) setSelectedBuild(opts.buildId);
        const oreGroupIDsSet =
          gameData.oreGroupIDs?.length
            ? new Set(gameData.oreGroupIDs)
            : undefined;
        startTracking(
          logDir,
          gameData.types,
          1000,
          opts?.plannedVolByTypeId,
          oreGroupIDsSet
        );
      }
    }
  );
  ipcMain.handle("mining:stop-tracking", () => stopTracking());
  ipcMain.handle("mining:set-selected-build", (_event, buildId: string | null) => {
    setSelectedBuild(buildId);
  });
  ipcMain.handle("mining:set-state", (_event, state: Record<string, Record<number, number>>) => {
    setMiningState(state);
  });
  ipcMain.handle("mining:reset-build", (_event, buildId: string) => {
    resetMiningForBuild(buildId);
  });
}

import { loadGameData } from "../ipc/gameDataLoader.js";
import { loadSettings } from "../ipc/settingsStore.js";
import { getTrackingActive, startMiningLogReader } from "./miningLogReader.js";

/** Restart the mining log reader with current settings. Call after settings change. Only starts if tracking was active. */
export async function restartMiningReader(): Promise<void> {
  if (!getTrackingActive()) return;
  try {
    const gameData = await loadGameData();
    const settings = loadSettings();
    const logDir = settings.gameLogDir ?? "%USERPROFILE%\\Documents\\Frontier\\Logs\\Gamelogs";
    if (gameData.types && Object.keys(gameData.types).length > 0) {
      startMiningLogReader(logDir, gameData.types, 1000);
    }
  } catch (err) {
    console.error("Failed to restart mining log reader:", err);
  }
}

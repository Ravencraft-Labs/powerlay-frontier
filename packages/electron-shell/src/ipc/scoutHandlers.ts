import { ipcMain } from "electron";
import type { CreateScoutEntryInput, UpdateScoutEntryInput, ScoutEntry, ScoutSettings } from "@powerlay/core";
import { getCurrentSystem, getChatLogError, startChatLogReader, stopChatLogReader, DEFAULT_CHAT_LOG_DIR } from "../log/chatLogReader.js";
import { getScoutStore } from "./scoutStore.js";
import { loadScoutSettings, updateScoutSettings } from "./scoutSettingsStore.js";
import { logCreated, logCleared, logDeleted, getActivityLog } from "./scoutActivityStore.js";

/** Returns the active system: manual override takes priority over chatlog. */
function getActiveSystem(): string | null {
  const settings = loadScoutSettings();
  if (settings.systemOverride) return settings.systemOverride;
  return getCurrentSystem();
}

/**
 * Visibility/auth gate stub.
 * Currently trusts all local entries. When API sync is added, this will
 * filter by session.tribeId / session.walletId.
 */
function canViewEntry(_entry: ScoutEntry): boolean {
  return true;
}

/** Stub for future remote sync. */
async function syncToRemote(_entries: ScoutEntry[]): Promise<void> {
  // Future: POST to back.ravencraft.dev/api/v1/scout/entries
}

export function registerScoutHandlers(): void {
  const store = getScoutStore();

  // Auto-start chatlog reader
  startChatLogReader(DEFAULT_CHAT_LOG_DIR);

  ipcMain.handle("scout:get-current-system", () => getCurrentSystem());

  ipcMain.handle("scout:get-active-system", () => getActiveSystem());

  ipcMain.handle("scout:set-system-override", (_event, system: string | null) => {
    return updateScoutSettings({ systemOverride: system ?? null });
  });

  ipcMain.handle("scout:get-error", () => getChatLogError());

  ipcMain.handle("scout:list", () => {
    return store.list().filter(canViewEntry);
  });

  ipcMain.handle("scout:get", (_event, id: string) => {
    const entry = store.get(id);
    if (!entry || !canViewEntry(entry)) return null;
    return entry;
  });

  ipcMain.handle("scout:create", (_event, input: CreateScoutEntryInput) => {
    const entry = store.create(input);
    logCreated(entry, input);
    void syncToRemote(store.list());
    return entry;
  });

  ipcMain.handle("scout:update", (_event, id: string, patch: UpdateScoutEntryInput) => {
    const before = store.get(id);
    // Auto-fill clearedAt when transitioning to "cleared"
    if (patch.status === "cleared" && before?.status === "active") {
      patch = { ...patch, clearedAt: new Date().toISOString() };
    }
    const entry = store.update(id, patch);
    if (entry && patch.status === "cleared" && before?.status === "active") {
      logCleared(entry, patch.clearedBy ?? "manual");
    }
    if (entry) void syncToRemote(store.list());
    return entry;
  });

  ipcMain.handle("scout:delete", (_event, id: string) => {
    const before = store.get(id);
    const ok = store.delete(id);
    if (ok && before) logDeleted(before, "manual");
    if (ok) void syncToRemote(store.list());
    return ok;
  });

  ipcMain.handle("scout:get-settings", (): ScoutSettings => {
    return loadScoutSettings();
  });

  ipcMain.handle("scout:update-settings", (_event, patch: Partial<ScoutSettings>) => {
    return updateScoutSettings(patch);
  });

  ipcMain.handle("scout:get-activity-log", (_event, limit?: number) => {
    return getActivityLog(limit ?? 200);
  });

  ipcMain.handle("scout:start-watching", () => {
    startChatLogReader(DEFAULT_CHAT_LOG_DIR);
  });

  ipcMain.handle("scout:stop-watching", () => {
    stopChatLogReader();
  });
}

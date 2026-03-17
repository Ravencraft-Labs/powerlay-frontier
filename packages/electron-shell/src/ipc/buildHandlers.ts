import { ipcMain } from "electron";
import type { BuildPlan } from "@powerlay/core";
import { getBuildStore } from "./buildStore.js";

export function registerBuildHandlers(): void {
  const store = getBuildStore();

  ipcMain.handle("builds:list", async () => store.list());
  ipcMain.handle("builds:get", async (_, id: string) => store.get(id));
  ipcMain.handle("builds:save", async (_, plan: unknown) => store.save(plan as BuildPlan));
  ipcMain.handle("builds:delete", async (_, id: string) => store.delete(id));
}

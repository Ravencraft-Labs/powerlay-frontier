import { ipcMain } from "electron";
import { getTodoStore } from "./todoStore.js";

export function registerTodoHandlers(): void {
  const store = getTodoStore();

  ipcMain.handle("tribe-todo:list", async () => store.list());
  ipcMain.handle("tribe-todo:create", async (_, todo: unknown) => store.create(todo));
  ipcMain.handle("tribe-todo:update", async (_, id: string, patch: unknown) => store.update(id, patch));
  ipcMain.handle("tribe-todo:delete", async (_, id: string) => store.delete(id));
}

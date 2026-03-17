import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("efOverlay", {
  tribeTodo: {
    list: () => ipcRenderer.invoke("tribe-todo:list"),
    create: (todo: unknown) => ipcRenderer.invoke("tribe-todo:create", todo),
    update: (id: string, patch: unknown) => ipcRenderer.invoke("tribe-todo:update", id, patch),
    delete: (id: string) => ipcRenderer.invoke("tribe-todo:delete", id),
  },
  builds: {
    list: () => ipcRenderer.invoke("builds:list"),
    get: (id: string) => ipcRenderer.invoke("builds:get", id),
    save: (plan: unknown) => ipcRenderer.invoke("builds:save", plan),
    delete: (id: string) => ipcRenderer.invoke("builds:delete", id),
  },
  overlay: {
    toggle: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:toggle", frame),
    show: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:show", frame),
    hide: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:hide", frame),
    getLockState: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:get-lock-state", frame),
    toggleLock: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:toggle-lock", frame),
    getBuilderState: () => ipcRenderer.invoke("overlay:get-builder-state"),
    setBuilderState: (state: { buildName?: string; mined?: number; totalOre?: number; productionLeftSeconds?: number }) =>
      ipcRenderer.send("overlay:set-builder-state", state),
  },
  gameData: {
    get: () => ipcRenderer.invoke("gameData:get"),
  },
  mining: {
    getState: () => ipcRenderer.invoke("mining:get-state"),
    getErrors: () => ipcRenderer.invoke("mining:get-errors"),
    setSelectedBuild: (buildId: string | null) => ipcRenderer.invoke("mining:set-selected-build", buildId),
    setState: (state: Record<string, Record<number, number>>) => ipcRenderer.invoke("mining:set-state", state),
    resetBuild: (buildId: string) => ipcRenderer.invoke("mining:reset-build", buildId),
    startTracking: (opts?: {
      buildId?: string;
      plannedVolByTypeId?: Record<number, number>;
    }) => ipcRenderer.invoke("mining:start-tracking", opts),
    stopTracking: () => ipcRenderer.invoke("mining:stop-tracking"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (settings: { gameLogDir?: string }) => ipcRenderer.invoke("settings:set", settings),
  },
  app: {
    openLogFolder: () => ipcRenderer.invoke("app:open-log-folder"),
    pickLogDir: (defaultPath?: string) => ipcRenderer.invoke("app:pick-log-dir", defaultPath),
    shouldShowLogPrompt: () => ipcRenderer.invoke("app:should-show-log-prompt"),
    setSkipLogPrompt: () => ipcRenderer.invoke("app:set-skip-log-prompt"),
  },
  getIconsBaseUrl: () => Promise.resolve("app://icons/"),
});

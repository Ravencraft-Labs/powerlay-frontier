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
    setContentSize: (frame: "todo" | "builder", width: number, height: number, buildId?: string) =>
      ipcRenderer.send("overlay:set-content-size", frame, width, height, buildId),
    toggle: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:toggle", frame),
    toggleBuilder: (buildId: string) => ipcRenderer.invoke("overlay:toggle-builder", buildId),
    getVisibleBuilderIds: () => ipcRenderer.invoke("overlay:get-visible-builder-ids") as Promise<string[]>,
    show: (frame: "todo" | "builder") => ipcRenderer.invoke("overlay:show", frame),
    hide: (frame: "todo" | "builder", buildId?: string) => ipcRenderer.invoke("overlay:hide", frame, buildId),
    hideBuilder: (buildId: string) => ipcRenderer.invoke("overlay:hide-builder", buildId),
    getLockState: (frame: "todo" | "builder", buildId?: string) =>
      ipcRenderer.invoke("overlay:get-lock-state", frame, buildId),
    toggleLock: (frame: "todo" | "builder", buildId?: string) =>
      ipcRenderer.invoke("overlay:toggle-lock", frame, buildId),
    getBuilderState: (buildId: string) => ipcRenderer.invoke("overlay:get-builder-state", buildId),
    setBuilderState: (states: Record<string, { buildName?: string; mined?: number; totalOre?: number; productionLeftSeconds?: number; miningOres?: Array<{ name: string; minedVol: number; neededVol: number }>; plannedVolByTypeId?: Record<number, number> }>) =>
      ipcRenderer.send("overlay:set-builder-state", states),
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
  auth: {
    getSession: () => ipcRenderer.invoke("auth:get-session"),
    login: () => ipcRenderer.invoke("auth:login"),
    logout: () => ipcRenderer.invoke("auth:logout"),
    cancel: () => ipcRenderer.invoke("auth:cancel"),
  },
  getIconsBaseUrl: () => Promise.resolve("app://icons/"),
});

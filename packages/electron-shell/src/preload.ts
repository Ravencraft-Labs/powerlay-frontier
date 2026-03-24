import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("efOverlay", {
  contracts: {
    search: (params: unknown) => ipcRenderer.invoke("contracts:search", params),
    listMyContracts: (bucket?: string) => ipcRenderer.invoke("contracts:list-my-contracts", bucket),
    listDrafts: () => ipcRenderer.invoke("contracts:list-drafts"),
    get: (id: string) => ipcRenderer.invoke("contracts:get", id),
    createDraft: (input: unknown) => ipcRenderer.invoke("contracts:create-draft", input),
    updateDraft: (id: string, patch: unknown) => ipcRenderer.invoke("contracts:update-draft", id, patch),
    publish: (id: string) => ipcRenderer.invoke("contracts:publish", id),
    hide: (contractId: string) => ipcRenderer.invoke("contracts:hide", contractId),
    join: (contractId: string, displayName?: string) => ipcRenderer.invoke("contracts:join", contractId, displayName),
    tokenBalance: () => ipcRenderer.invoke("contracts:token-balance"),
    stats: () => ipcRenderer.invoke("contracts:stats"),
    cancel: (contractId: string) => ipcRenderer.invoke("contracts:cancel", contractId),
    completeContract: (contractId: string) => ipcRenderer.invoke("contracts:complete-contract", contractId),
    getBackendStatus: () => ipcRenderer.invoke("contracts:backend-status"),
  },
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
    setContentSize: (frame: "contracts" | "builder", width: number, height: number, buildId?: string) =>
      ipcRenderer.send("overlay:set-content-size", frame, width, height, buildId),
    toggle: (frame: "contracts" | "builder") => ipcRenderer.invoke("overlay:toggle", frame),
    toggleBuilder: (buildId: string) => ipcRenderer.invoke("overlay:toggle-builder", buildId),
    getVisibleBuilderIds: () => ipcRenderer.invoke("overlay:get-visible-builder-ids") as Promise<string[]>,
    show: (frame: "contracts" | "builder") => ipcRenderer.invoke("overlay:show", frame),
    hide: (frame: "contracts" | "builder", buildId?: string) => ipcRenderer.invoke("overlay:hide", frame, buildId),
    hideBuilder: (buildId: string) => ipcRenderer.invoke("overlay:hide-builder", buildId),
    getLockState: (frame: "contracts" | "builder", buildId?: string) =>
      ipcRenderer.invoke("overlay:get-lock-state", frame, buildId),
    toggleLock: (frame: "contracts" | "builder", buildId?: string) =>
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
    set: (settings: {
      gameLogDir?: string;
      skipLogPrompt?: boolean;
      efGraphqlUrl?: string;
      efWorldApiBaseUrl?: string;
    }) => ipcRenderer.invoke("settings:set", settings),
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
  tribe: {
    resolve: () => ipcRenderer.invoke("tribe:resolve"),
  },
  getIconsBaseUrl: () => Promise.resolve("app://icons/"),
});

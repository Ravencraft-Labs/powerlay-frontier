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
    getLogs: (id: string) => ipcRenderer.invoke("contracts:get-logs", id),
    signDeliveryTx: (params: unknown) => ipcRenderer.invoke("contracts:sign-delivery-tx", params),
    recordDelivery: (contractId: string, body: unknown) =>
      ipcRenderer.invoke("contracts:record-delivery", contractId, body),
    submitDepositAttempt: (contractId: string, body: unknown) =>
      ipcRenderer.invoke("contracts:submit-deposit-attempt", contractId, body),
  },
  storage: {
    listConnected: () => ipcRenderer.invoke("storage:list-connected"),
    discoverWalletSsus: () => ipcRenderer.invoke("storage:discover-wallet-ssus"),
    register: (ssuObjectId: string, txHash: string, name?: string) =>
      ipcRenderer.invoke("storage:register", ssuObjectId, txHash, name),
    disconnect: (ssuObjectId: string) => ipcRenderer.invoke("storage:disconnect", ssuObjectId),
    signConnectTx: (params: { storageUnitId: string; ownerCapId: string; tribeId: string; characterId?: string; worldPackageId?: string }) =>
      ipcRenderer.invoke("storage:sign-connect-tx", params),
    getHistory: (ssuId: string) => ipcRenderer.invoke("storage:get-history", ssuId),
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
    setContentSize: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", width: number, height: number, buildId?: string) =>
      ipcRenderer.send("overlay:set-content-size", frame, width, height, buildId),
    toggle: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc") => ipcRenderer.invoke("overlay:toggle", frame),
    toggleBuilder: (buildId: string) => ipcRenderer.invoke("overlay:toggle-builder", buildId),
    getVisibleBuilderIds: () => ipcRenderer.invoke("overlay:get-visible-builder-ids") as Promise<string[]>,
    getVisible: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc") => ipcRenderer.invoke("overlay:get-visible", frame),
    show: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc") => ipcRenderer.invoke("overlay:show", frame),
    hide: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", buildId?: string) => ipcRenderer.invoke("overlay:hide", frame, buildId),
    hideBuilder: (buildId: string) => ipcRenderer.invoke("overlay:hide-builder", buildId),
    getLockState: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", buildId?: string) =>
      ipcRenderer.invoke("overlay:get-lock-state", frame, buildId),
    toggleLock: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", buildId?: string) =>
      ipcRenderer.invoke("overlay:toggle-lock", frame, buildId),
    getUserSize: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", buildId?: string) =>
      ipcRenderer.invoke("overlay:get-user-size", frame, buildId),
    setUserSize: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", width: number, height: number, buildId?: string) =>
      ipcRenderer.invoke("overlay:set-user-size", frame, width, height, buildId),
    clearUserSize: (frame: "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc", buildId?: string) =>
      ipcRenderer.invoke("overlay:clear-user-size", frame, buildId),
    /** Toolbar: which overlays are open and locked. */
    getBarState: () => ipcRenderer.invoke("overlay:get-bar-state"),
    setAllLocked: (locked: boolean) => ipcRenderer.invoke("overlay:set-all-locked", locked),
    toggleAllVisible: () => ipcRenderer.invoke("overlay:toggle-all-visible"),
    getBuilderState: (buildId: string) => ipcRenderer.invoke("overlay:get-builder-state", buildId),
    setBuilderState: (states: Record<string, { buildName?: string; mined?: number; totalOre?: number; productionLeftSeconds?: number; miningOres?: Array<{ name: string; minedVol: number; neededVol: number; asteroids?: string[] }>; plannedVolByTypeId?: Record<number, number> }>) =>
      ipcRenderer.send("overlay:set-builder-state", states),
    /** Build overlay: mark an ore mined / a crafted item made (or undo) in the desktop app. */
    sendBuilderAction: (buildId: string, action: { kind: "ore-done" | "item-done"; typeID: number; done: boolean } | { kind: "item-add"; typeID: number; delta: number } | { kind: "pick-step"; step: number | null } | { kind: "set-auto"; on: boolean } | { kind: "needed-add"; typeID: number; delta: number }) =>
      ipcRenderer.send("overlay:builder-action", buildId, action),
    /** Desktop: receive build overlay actions. Returns an unsubscribe. */
    onBuilderAction: (cb: (buildId: string, action: { kind: "ore-done" | "item-done"; typeID: number; done: boolean } | { kind: "item-add"; typeID: number; delta: number } | { kind: "pick-step"; step: number | null } | { kind: "set-auto"; on: boolean } | { kind: "needed-add"; typeID: number; delta: number }) => void) => {
      const handler = (_e: unknown, buildId: string, action: { kind: "ore-done" | "item-done"; typeID: number; done: boolean } | { kind: "item-add"; typeID: number; delta: number } | { kind: "pick-step"; step: number | null } | { kind: "set-auto"; on: boolean } | { kind: "needed-add"; typeID: number; delta: number }) =>
        cb(buildId, action);
      ipcRenderer.on("builder:overlay-action", handler);
      return () => ipcRenderer.removeListener("builder:overlay-action", handler);
    },
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
      worldContractsPackageId?: string;
      contractsApiBase?: string;
      storageApiBase?: string;
      overlayOpacity?: number;
      tabOrder?: string[];
    }) =>
      ipcRenderer.invoke("settings:set", settings),
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
  scout: {
    getCurrentSystem: () => ipcRenderer.invoke("scout:get-current-system"),
    getActiveSystem: () => ipcRenderer.invoke("scout:get-active-system"),
    setSystemOverride: (system: string | null) => ipcRenderer.invoke("scout:set-system-override", system),
    getError: () => ipcRenderer.invoke("scout:get-error"),
    list: () => ipcRenderer.invoke("scout:list"),
    get: (id: string) => ipcRenderer.invoke("scout:get", id),
    create: (input: unknown) => ipcRenderer.invoke("scout:create", input),
    update: (id: string, patch: unknown) => ipcRenderer.invoke("scout:update", id, patch),
    delete: (id: string) => ipcRenderer.invoke("scout:delete", id),
    getSettings: () => ipcRenderer.invoke("scout:get-settings"),
    updateSettings: (patch: unknown) => ipcRenderer.invoke("scout:update-settings", patch),
    startWatching: () => ipcRenderer.invoke("scout:start-watching"),
    stopWatching: () => ipcRenderer.invoke("scout:stop-watching"),
    getActivityLog: (limit?: number) => ipcRenderer.invoke("scout:get-activity-log", limit),
    getSites: () => ipcRenderer.invoke("scout:get-sites"),
    getSystemInfo: (system: string) => ipcRenderer.invoke("scout:get-system-info", system),
  },
  pocMap: {
    getBase: () => ipcRenderer.invoke("pocMap:get-base"),
    setLogLite: (on: boolean) => ipcRenderer.invoke("pocMap:loglite-set", on),
    getLogLiteStatus: () => ipcRenderer.invoke("pocMap:loglite-status"),
    watchClipboard: (on: boolean) => ipcRenderer.invoke("pocMap:watch-clipboard", on),
    getLinks: () => ipcRenderer.invoke("pocMap:get-links"),
    ingestText: (text: string) => ipcRenderer.invoke("pocMap:ingest-text", text),
    ingestClipboard: () => ipcRenderer.invoke("pocMap:ingest-clipboard"),
    addAdjacent: (anchorId: number | null, text?: string) => ipcRenderer.invoke("pocMap:add-adjacent", anchorId, text),
    addRoute: (text?: string) => ipcRenderer.invoke("pocMap:add-route", text),
    getTravel: () => ipcRenderer.invoke("pocMap:get-travel"),
    scoutGate: (text?: string) => ipcRenderer.invoke("pocMap:scout-gate", text),
    addDormant: (fromSystemId: number | null, text?: string, note?: string) => ipcRenderer.invoke("pocMap:add-dormant", fromSystemId, text, note),
    removeDormant: (id: string) => ipcRenderer.invoke("pocMap:remove-dormant", id),
    setGateLocation: (gateId: number, systemId: number, location: string | null) =>
      ipcRenderer.invoke("pocMap:set-gate-location", gateId, systemId, location),
    getGatePlacement: () => ipcRenderer.invoke("pocMap:get-gate-placement"),
    placeGate: (gateId: number, systemId: number, toSystemId: number | null) =>
      ipcRenderer.invoke("pocMap:place-gate", gateId, systemId, toSystemId),
    dismissGatePlacement: () => ipcRenderer.invoke("pocMap:dismiss-gate-placement"),
    clearTravel: () => ipcRenderer.invoke("pocMap:clear-travel"),
  },
  plugins: {
    list: () => ipcRenderer.invoke("plugins:list"),
    dir: () => ipcRenderer.invoke("plugins:dir"),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke("plugins:set-enabled", id, enabled),
    rendererSource: (id: string) => ipcRenderer.invoke("plugins:renderer-source", id),
    invoke: (id: string, channel: string, ...args: unknown[]) => ipcRenderer.invoke("plugins:invoke", id, channel, ...args),
  },
  getIconsBaseUrl: () => Promise.resolve("app://icons/"),
});

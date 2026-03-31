import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, protocol, screen, shell, Tray } from "electron";
import path from "path";
import fs from "fs";
import { registerTodoHandlers } from "./ipc/todoHandlers.js";
import { registerContractsHandlers } from "./ipc/contractsHandlers.js";
import { registerBuildHandlers } from "./ipc/buildHandlers.js";
import { registerGameDataHandlers } from "./ipc/gameDataHandlers.js";
import { registerSettingsHandlers } from "./ipc/settingsHandlers.js";
import { registerMiningHandlers } from "./ipc/miningHandlers.js";
import { startAuthServer } from "./auth/authServer.js";
import { registerAuthHandlers } from "./ipc/authHandlers.js";
import { registerTribeHandlers } from "./ipc/tribeHandlers.js";
import { registerScoutHandlers } from "./ipc/scoutHandlers.js";
import { registerStorageHandlers } from "./ipc/storageHandlers.js";
import { getDataRoot } from "./ipc/gameDataLoader.js";
import { loadSettings, saveSettings } from "./ipc/settingsStore.js";
import { runTailerTest } from "./log/tailerTest.js";
import { getAppLogDir } from "./log/appLogger.js";
import { checkLogDir, expandPath } from "./log/fileTailer.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

type OverlayFrame = "contracts" | "builder" | "scout";
const overlayWindows: Partial<Record<OverlayFrame, BrowserWindow>> = {};
const overlayLockState: Record<OverlayFrame, boolean> = { contracts: false, builder: false, scout: false };
const builderOverlayWindows = new Map<string, BrowserWindow>();
const overlayLockStateByBuild: Record<string, boolean> = {};

const OVERLAY_BOUNDS_FILE = "overlay-bounds.json";
const BUILDER_OVERLAY_GAP = 16;

interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getOverlayBoundsPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, OVERLAY_BOUNDS_FILE);
}

function loadOverlayBounds(): Partial<Record<OverlayFrame, OverlayBounds>> {
  try {
    const p = getOverlayBoundsPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Record<string, { x?: number; y?: number; width?: number; height?: number }>;
    const result: Partial<Record<OverlayFrame, OverlayBounds>> = {};
    for (const f of ["contracts", "builder", "scout"] as OverlayFrame[]) {
      let b = data[f];
      if (f === "contracts" && !b && data["todo"]) b = data["todo"];
      if (b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height)) {
        try {
          const display = screen.getDisplayMatching({ x: b.x!, y: b.y!, width: b.width!, height: b.height! });
          const workArea = display.workArea;
          const x = Math.max(workArea.x, Math.min(b.x!, workArea.x + workArea.width - Math.min(b.width!, workArea.width)));
          const y = Math.max(workArea.y, Math.min(b.y!, workArea.y + workArea.height - Math.min(b.height!, workArea.height)));
          result[f] = { x, y, width: b.width!, height: b.height! };
        } catch {
          result[f] = { x: b.x!, y: b.y!, width: b.width!, height: b.height! };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

function loadBuilderOverlayBounds(buildId: string): OverlayBounds | undefined {
  try {
    const p = getOverlayBoundsPath();
    if (!fs.existsSync(p)) return undefined;
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Record<string, { x?: number; y?: number; width?: number; height?: number }>;
    const key = `builder-${buildId}`;
    const b = data[key];
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return undefined;
    try {
      const display = screen.getDisplayMatching({ x: b.x!, y: b.y!, width: b.width!, height: b.height! });
      const workArea = display.workArea;
      const x = Math.max(workArea.x, Math.min(b.x!, workArea.x + workArea.width - Math.min(b.width!, workArea.width)));
      const y = Math.max(workArea.y, Math.min(b.y!, workArea.y + workArea.height - Math.min(b.height!, workArea.height)));
      return { x, y, width: b.width!, height: b.height! };
    } catch {
      return { x: b.x!, y: b.y!, width: b.width!, height: b.height! };
    }
  } catch {
    return undefined;
  }
}

function saveOverlayBounds(bounds: Partial<Record<OverlayFrame, OverlayBounds>>): void {
  try {
    const p = getOverlayBoundsPath();
    let existing: Partial<Record<string, OverlayBounds>> = {};
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      existing = JSON.parse(raw) as Record<string, OverlayBounds>;
    }
    const merged = { ...existing, ...bounds };
    fs.writeFileSync(p, JSON.stringify(merged, null, 0), "utf-8");
  } catch {
    /* ignore */
  }
}

function saveBuilderOverlayBounds(buildId: string, bounds: OverlayBounds): void {
  try {
    const p = getOverlayBoundsPath();
    let existing: Partial<Record<string, OverlayBounds>> = {};
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      existing = JSON.parse(raw) as Record<string, OverlayBounds>;
    }
    existing[`builder-${buildId}`] = bounds;
    fs.writeFileSync(p, JSON.stringify(existing, null, 0), "utf-8");
  } catch {
    /* ignore */
  }
}

function applyOverlayLockState(frame: OverlayFrame, w: BrowserWindow): void {
  if (overlayLockState[frame]) {
    w.setIgnoreMouseEvents(true, { forward: true });
  } else {
    w.setIgnoreMouseEvents(false);
  }
}

interface MiningOreItem {
  name: string;
  minedVol: number;
  neededVol: number;
}

interface BuilderOverlayState {
  buildName?: string;
  mined?: number;
  totalOre?: number;
  productionLeftSeconds?: number;
  miningOres?: MiningOreItem[];
  plannedVolByTypeId?: Record<number, number>;
}
let builderOverlayStateByBuild: Record<string, BuilderOverlayState> = {};

function getDesktopUrl(): string {
  const url = process.env.DESKTOP_URL;
  if (url) return url;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "desktop", "index.html");
  }
  return "http://localhost:5173";
}

function getOverlayBaseUrl(): string {
  const url = process.env.OVERLAY_URL;
  if (url) return url;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "overlay", "index.html");
  }
  return "http://localhost:5174";
}

function getIconPath(): string | undefined {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "icon.png");
    return fs.existsSync(p) ? p : undefined;
  }
  const iconPath = path.join(__dirname, "..", "..", "..", "build", "icon.png");
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function createMainWindow(): void {
  const iconPath = getIconPath();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(iconPath && { icon: iconPath }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenu(null);
  const desktopUrl = getDesktopUrl();
  if (desktopUrl.startsWith("http://") || desktopUrl.startsWith("https://")) {
    mainWindow.loadURL(desktopUrl);
  } else {
    mainWindow.loadFile(desktopUrl);
  }
  mainWindow.on("close", (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      app.quit();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    for (const frame of Object.keys(overlayWindows) as OverlayFrame[]) {
      const w = overlayWindows[frame];
      if (w && !w.isDestroyed()) w.close();
    }
    for (const w of builderOverlayWindows.values()) {
      if (w && !w.isDestroyed()) w.close();
    }
  });
}

function getOrCreateOverlayWindow(frame: OverlayFrame): BrowserWindow {
  let w = overlayWindows[frame];
  if (w && !w.isDestroyed()) return w;
  const savedBounds = loadOverlayBounds()[frame];
  const opts: Electron.BrowserWindowConstructorOptions = {
    width: 320,
    height: 300,
    x: savedBounds?.x,
    y: savedBounds?.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    useContentSize: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  w = new BrowserWindow(opts);
  // Use highest Z-order level to improve overlay staying on top (helps on some Windows setups)
  w.setAlwaysOnTop(true, "screen-saver");
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      if (w && !w.isDestroyed()) {
        const b = w.getBounds();
        saveOverlayBounds({ [frame]: { x: b.x, y: b.y, width: b.width, height: b.height } });
      }
    }, 300);
  };
  w.on("move", scheduleSave);
  w.on("close", () => {
    if (w && !w.isDestroyed()) {
      const b = w.getBounds();
      saveOverlayBounds({ [frame]: { x: b.x, y: b.y, width: b.width, height: b.height } });
    }
  });
  w.on("closed", () => {
    delete overlayWindows[frame];
  });
  w.webContents.once("did-finish-load", () => {
    const locked = overlayLockState[frame] ?? false;
    if (locked) w.setIgnoreMouseEvents(true, { forward: true });
    else w.setIgnoreMouseEvents(false);
  });
  w.hide();
  overlayWindows[frame] = w;

  const base = getOverlayBaseUrl();
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const sep = base.includes("?") ? "&" : "?";
    w.loadURL(`${base}${sep}frame=${frame}`);
  } else {
    w.loadFile(base, { query: { frame } });
  }
  return w;
}

function getOrCreateBuilderOverlayWindow(buildId: string): BrowserWindow {
  let w = builderOverlayWindows.get(buildId);
  if (w && !w.isDestroyed()) return w;

  const savedBounds = loadBuilderOverlayBounds(buildId);
  let x: number | undefined = savedBounds?.x;
  let y: number | undefined = savedBounds?.y;

  if (x == null || y == null) {
    const allBuilderWindows = Array.from(builderOverlayWindows.values()).filter((win) => !win.isDestroyed());
    const defaultWidth = 320;
    const defaultHeight = 300;
    const workArea = screen.getPrimaryDisplay().workArea;

    if (allBuilderWindows.length > 0) {
      let bottomY = 0;
      let refX = workArea.x;
      for (const win of allBuilderWindows) {
        const b = win.getBounds();
        const winBottom = b.y + b.height;
        if (winBottom > bottomY) {
          bottomY = winBottom;
          refX = b.x;
        }
      }
      const newY = bottomY + BUILDER_OVERLAY_GAP;
      if (newY + defaultHeight <= workArea.y + workArea.height) {
        x = refX;
        y = newY;
      }
    }
    if (x == null || y == null) {
      x = Math.round(workArea.x + (workArea.width - defaultWidth) / 2);
      y = Math.round(workArea.y + (workArea.height - defaultHeight) / 2);
    }
  }

  const opts: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds?.width ?? 320,
    height: savedBounds?.height ?? 300,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    useContentSize: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  w = new BrowserWindow(opts);
  w.setAlwaysOnTop(true, "screen-saver");
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      if (w && !w.isDestroyed()) {
        const b = w.getBounds();
        saveBuilderOverlayBounds(buildId, { x: b.x, y: b.y, width: b.width, height: b.height });
      }
    }, 300);
  };
  w.on("move", scheduleSave);
  w.on("close", () => {
    if (w && !w.isDestroyed()) {
      const b = w.getBounds();
      saveBuilderOverlayBounds(buildId, { x: b.x, y: b.y, width: b.width, height: b.height });
    }
  });
  w.on("closed", () => {
    builderOverlayWindows.delete(buildId);
  });
  w.webContents.once("did-finish-load", () => {
    const locked = overlayLockStateByBuild[buildId] ?? false;
    if (locked) w!.setIgnoreMouseEvents(true, { forward: true });
    else w!.setIgnoreMouseEvents(false);
  });
  w.hide();
  builderOverlayWindows.set(buildId, w);

  const base = getOverlayBaseUrl();
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const sep = base.includes("?") ? "&" : "?";
    w.loadURL(`${base}${sep}frame=builder&buildId=${encodeURIComponent(buildId)}`);
  } else {
    w.loadFile(base, { query: { frame: "builder", buildId } });
  }
  return w;
}

function registerAppProtocol(): void {
  const root = getDataRoot();
  const iconsDir = path.join(root, "data", "raw", "icons");
  protocol.handle("app", (request) => {
    const u = new URL(request.url);
    if (u.hostname !== "icons" || !u.pathname.startsWith("/")) {
      return new Response("Not Found", { status: 404 });
    }
    const filename = path.basename(u.pathname).replace(/\.\./g, "");
    if (!filename || !filename.endsWith(".png")) {
      return new Response("Not Found", { status: 404 });
    }
    const filePath = path.join(iconsDir, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return new Response("Not Found", { status: 404 });
    }
    const buf = fs.readFileSync(filePath);
    return new Response(buf, {
      headers: { "Content-Type": "image/png" },
    });
  });
}

app.whenReady().then(async () => {
  registerAppProtocol();
  registerTodoHandlers();
  registerBuildHandlers();
  registerGameDataHandlers();
  registerSettingsHandlers();
  registerMiningHandlers();

  const authServer = await startAuthServer();
  registerContractsHandlers(authServer);
  registerAuthHandlers(authServer, () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  registerTribeHandlers();
  registerScoutHandlers();
  registerStorageHandlers(authServer);

  ipcMain.handle("app:open-log-folder", async () => {
    const dir = getAppLogDir();
    const result = await shell.openPath(dir);
    return result;
  });

  ipcMain.handle("app:pick-log-dir", async (_event, defaultPath?: string) => {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const expanded =
      defaultPath
        ?.replace(/%USERPROFILE%/gi, home)
        .replace(/%HOME%/gi, home)
        .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"))
        .replace(/%APPDATA%/gi, process.env.APPDATA || path.join(home, "AppData", "Roaming")) ?? "";
    const startPath = expanded && fs.existsSync(expanded) ? expanded : undefined;
    const win = BrowserWindow.getAllWindows().find((w) => w.isFocused()) ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win ?? null, {
      properties: ["openDirectory"],
      title: "Select game log directory",
      defaultPath: startPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("app:should-show-log-prompt", () => {
    const settings = loadSettings();
    if (settings.skipLogPrompt) return { show: false };
    const logDir = settings.gameLogDir ?? "%USERPROFILE%\\Documents\\Frontier\\Logs\\Gamelogs";
    const expanded = expandPath(logDir);
    const check = checkLogDir(expanded);
    return { show: !check.ok };
  });

  ipcMain.handle("app:set-skip-log-prompt", () => {
    const settings = loadSettings();
    saveSettings({ ...settings, skipLogPrompt: true });
  });

  await runTailerTest();

  createMainWindow();

  const iconPath = getIconPath();
  if (iconPath) {
    let icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      if (process.platform === "darwin") {
        icon = icon.resize({ width: 16, height: 16 });
        icon.setTemplateImage(true);
      }
      tray = new Tray(icon);
      tray.setToolTip("Powerlay Frontier");
      tray.on("click", () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
      tray.setContextMenu(
        Menu.buildFromTemplate([
          {
            label: "Open",
            click: () => {
              if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
              }
            },
          },
          { type: "separator" },
          {
            label: "Quit",
            click: () => app.quit(),
          },
        ])
      );
    }
  }

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (tray && !isQuitting) return; // Keep running in tray
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("overlay:toggle", (_event, frame: OverlayFrame) => {
  if (frame === "builder") return;
  const w = getOrCreateOverlayWindow(frame);
  if (w.isVisible()) w.hide();
  else w.show();
});

ipcMain.handle("overlay:toggle-scout", () => {
  const w = getOrCreateOverlayWindow("scout");
  if (w.isVisible()) w.hide();
  else w.show();
});

ipcMain.handle("overlay:toggle-builder", (_event, buildId: string) => {
  const w = getOrCreateBuilderOverlayWindow(buildId);
  if (w.isVisible()) w.hide();
  else w.show();
});

ipcMain.handle("overlay:get-visible-builder-ids", () => {
  const ids: string[] = [];
  for (const [id, win] of builderOverlayWindows) {
    if (win && !win.isDestroyed() && win.isVisible()) ids.push(id);
  }
  return ids;
});

ipcMain.handle("overlay:show", (_event, frame: OverlayFrame) => {
  if (frame === "builder") return;
  getOrCreateOverlayWindow(frame as Exclude<OverlayFrame, "builder">).show();
});

ipcMain.handle("overlay:hide", (_event, frame: OverlayFrame, buildId?: string) => {
  if (frame === "builder" && buildId) {
    builderOverlayWindows.get(buildId)?.hide();
    return;
  }
  if (frame !== "builder") overlayWindows[frame]?.hide();
});

ipcMain.handle("overlay:hide-builder", (_event, buildId: string) => {
  builderOverlayWindows.get(buildId)?.hide();
  return undefined;
});

ipcMain.handle("overlay:get-builder-state", (_event, buildId: string) => {
  return builderOverlayStateByBuild[buildId] ?? {};
});

ipcMain.on("overlay:set-builder-state", (_event, states: Record<string, BuilderOverlayState>) => {
  builderOverlayStateByBuild = states && typeof states === "object" ? { ...states } : {};
});

ipcMain.handle("overlay:get-visible", (_event, frame: OverlayFrame) => {
  const w = overlayWindows[frame];
  return w && !w.isDestroyed() && w.isVisible();
});

ipcMain.handle("overlay:get-lock-state", (_event, frame: OverlayFrame, buildId?: string) => {
  if (frame === "builder" && buildId) return overlayLockStateByBuild[buildId] ?? false;
  return overlayLockState[frame] ?? false;
});

ipcMain.on("overlay:set-content-size", (_event, frame: OverlayFrame, width: number, height: number, buildId?: string) => {
  if (frame === "builder" && buildId) {
    const w = builderOverlayWindows.get(buildId);
    if (w && !w.isDestroyed() && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      w.setContentSize(Math.round(width), Math.round(height));
    }
    return;
  }
  const w = overlayWindows[frame];
  if (w && !w.isDestroyed() && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    w.setContentSize(Math.round(width), Math.round(height));
  }
});

ipcMain.handle("overlay:toggle-lock", (_event, frame: OverlayFrame, buildId?: string) => {
  if (frame === "builder" && buildId) {
    overlayLockStateByBuild[buildId] = !(overlayLockStateByBuild[buildId] ?? false);
    const locked = overlayLockStateByBuild[buildId];
    const w = builderOverlayWindows.get(buildId);
    if (w && !w.isDestroyed()) {
      if (locked) w.setIgnoreMouseEvents(true, { forward: true });
      else w.setIgnoreMouseEvents(false);
    }
    return locked;
  }
  overlayLockState[frame] = !(overlayLockState[frame] ?? false);
  const locked = overlayLockState[frame];
  const w = overlayWindows[frame];
  if (w && !w.isDestroyed()) {
    if (locked) w.setIgnoreMouseEvents(true, { forward: true });
    else w.setIgnoreMouseEvents(false);
  }
  return locked;
});

import { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } from "electron";
import path from "path";
import fs from "fs";
import { registerTodoHandlers } from "./ipc/todoHandlers.js";
import { registerBuildHandlers } from "./ipc/buildHandlers.js";
import { registerGameDataHandlers } from "./ipc/gameDataHandlers.js";
import { registerSettingsHandlers } from "./ipc/settingsHandlers.js";
import { registerMiningHandlers } from "./ipc/miningHandlers.js";
import { getDataRoot } from "./ipc/gameDataLoader.js";
import { loadSettings, saveSettings } from "./ipc/settingsStore.js";
import { runTailerTest } from "./log/tailerTest.js";
import { getAppLogDir } from "./log/appLogger.js";
import { checkLogDir, expandPath } from "./log/fileTailer.js";

let mainWindow: BrowserWindow | null = null;

type OverlayFrame = "todo" | "builder";
const overlayWindows: Partial<Record<OverlayFrame, BrowserWindow>> = {};
const overlayLockState: Record<OverlayFrame, boolean> = { todo: false, builder: false };

const OVERLAY_BOUNDS_FILE = "overlay-bounds.json";

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
    for (const f of ["todo", "builder"] as OverlayFrame[]) {
      const b = data[f];
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
}
let builderOverlayState: BuilderOverlayState = {};

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

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  mainWindow.on("closed", () => {
    mainWindow = null;
    for (const frame of Object.keys(overlayWindows) as OverlayFrame[]) {
      const w = overlayWindows[frame];
      if (w && !w.isDestroyed()) w.close();
    }
  });
}

function getOrCreateOverlayWindow(frame: OverlayFrame): BrowserWindow {
  let w = overlayWindows[frame];
  if (w && !w.isDestroyed()) return w;
  const savedBounds = loadOverlayBounds()[frame];
  const opts: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds?.width ?? 320,
    height: savedBounds?.height ?? 400,
    x: savedBounds?.x,
    y: savedBounds?.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
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
  w.on("resize", scheduleSave);
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
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("overlay:toggle", (_event, frame: OverlayFrame) => {
  const w = getOrCreateOverlayWindow(frame);
  if (w.isVisible()) w.hide();
  else w.show();
});

ipcMain.handle("overlay:show", (_event, frame: OverlayFrame) => {
  getOrCreateOverlayWindow(frame).show();
});

ipcMain.handle("overlay:hide", (_event, frame: OverlayFrame) => {
  overlayWindows[frame]?.hide();
});

ipcMain.handle("overlay:get-builder-state", () => builderOverlayState);
ipcMain.on("overlay:set-builder-state", (_event, state: BuilderOverlayState) => {
  builderOverlayState = state ?? {};
});

ipcMain.handle("overlay:get-lock-state", (_event, frame: OverlayFrame) => {
  return overlayLockState[frame] ?? false;
});

ipcMain.handle("overlay:toggle-lock", (_event, frame: OverlayFrame) => {
  overlayLockState[frame] = !(overlayLockState[frame] ?? false);
  const locked = overlayLockState[frame];
  const w = overlayWindows[frame];
  if (w && !w.isDestroyed()) {
    if (locked) w.setIgnoreMouseEvents(true, { forward: true });
    else w.setIgnoreMouseEvents(false);
  }
  return locked;
});

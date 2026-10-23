// Local plugins: folders with manifest.json + main.cjs (main process) and/or renderer.js (desktop renderer).
// Plugins are user-installed and never shipped with the app. Directory: POWERLAY_PLUGINS_DIR, else
// <repo>/plugins in dev, else userData/Powerlay/plugins when packaged. A broken plugin is skipped, not fatal.
import { app, ipcMain } from "electron";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { getDataRoot } from "../ipc/gameDataLoader.js";
import { loadSettings, saveSettings } from "../ipc/settingsStore.js";

interface PluginManifest {
  id: string;
  name?: string;
  version?: string;
  main?: string;
  renderer?: string;
}

export interface PluginContext {
  id: string;
  dir: string;
  /** `<plugin dir>/data`, created on demand — the plugin's own storage. */
  dataDir: string;
  handle(channel: string, fn: (...args: unknown[]) => unknown): void;
  log(...args: unknown[]): void;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string | null;
  hasRenderer: boolean;
  enabled: boolean;
  error?: string;
}

interface PluginModule {
  activate?: (ctx: PluginContext) => void;
  deactivate?: () => void;
}

interface LoadedPlugin {
  info: PluginInfo;
  dir: string;
  manifest: PluginManifest;
  /** Set while the main part is active. */
  mod?: PluginModule;
}

const plugins = new Map<string, LoadedPlugin>();
const handlers = new Map<string, (...args: unknown[]) => unknown>();

export function getPluginsDir(): string {
  if (process.env.POWERLAY_PLUGINS_DIR) return path.resolve(process.env.POWERLAY_PLUGINS_DIR);
  if (app.isPackaged) return path.join(app.getPath("userData"), "Powerlay", "plugins");
  return path.join(getDataRoot(), "plugins");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isDisabled(id: string): boolean {
  return (loadSettings().disabledPlugins ?? []).includes(id);
}

function activatePlugin(p: LoadedPlugin): void {
  const { info, dir, manifest } = p;
  const id = info.id;
  delete info.error;
  if (!manifest.main || p.mod) return;
  const ctx: PluginContext = {
    id,
    dir,
    get dataDir() {
      const d = path.join(dir, "data");
      fs.mkdirSync(d, { recursive: true });
      return d;
    },
    handle: (channel, fn) => handlers.set(`${id}:${channel}`, fn),
    log: (...args) => console.log(`[plugin:${id}]`, ...args),
  };
  try {
    // The main bundle is CJS, so load with require — esbuild would rewrite a dynamic import().
    const mod = createRequire(__filename)(path.join(dir, manifest.main)) as PluginModule;
    mod.activate?.(ctx);
    p.mod = mod;
  } catch (err) {
    info.error = errorText(err);
    console.error(`[plugin:${id}] failed to load:`, err);
  }
}

function deactivatePlugin(p: LoadedPlugin): void {
  try {
    p.mod?.deactivate?.();
  } catch (err) {
    console.error(`[plugin:${p.info.id}] deactivate failed:`, err);
  }
  p.mod = undefined;
  for (const key of [...handlers.keys()]) if (key.startsWith(`${p.info.id}:`)) handlers.delete(key);
}

function loadPlugin(dir: string): void {
  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as PluginManifest;
  } catch {
    return; // not a plugin folder
  }
  const id = manifest.id || path.basename(dir);
  const info: PluginInfo = {
    id,
    name: manifest.name ?? id,
    version: manifest.version ?? null,
    hasRenderer: !!manifest.renderer && fs.existsSync(path.join(dir, manifest.renderer)),
    enabled: !isDisabled(id),
  };
  const p: LoadedPlugin = { info, dir, manifest };
  plugins.set(id, p);
  if (info.enabled) activatePlugin(p);
}

export function loadPlugins(): void {
  const root = getPluginsDir();
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return; // no plugins dir
  }
  for (const name of names) {
    const dir = path.join(root, name);
    if (fs.statSync(dir).isDirectory()) loadPlugin(dir);
  }
}

export function registerPluginHandlers(): void {
  ipcMain.handle("plugins:list", () => [...plugins.values()].map((p) => p.info));

  ipcMain.handle("plugins:dir", () => getPluginsDir());

  ipcMain.handle("plugins:set-enabled", (_event, id: string, enabled: boolean) => {
    const p = plugins.get(id);
    if (!p) return [...plugins.values()].map((x) => x.info);
    const settings = loadSettings();
    const disabled = new Set(settings.disabledPlugins ?? []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    saveSettings({ ...settings, disabledPlugins: [...disabled] });
    p.info.enabled = enabled;
    if (enabled) activatePlugin(p);
    else deactivatePlugin(p);
    return [...plugins.values()].map((x) => x.info);
  });

  ipcMain.handle("plugins:renderer-source", (_event, id: string) => {
    const p = plugins.get(id);
    if (!p?.info.enabled || !p.manifest.renderer) return null;
    return fs.readFileSync(path.join(p.dir, p.manifest.renderer), "utf8");
  });

  ipcMain.handle("plugins:invoke", async (_event, id: string, channel: string, ...args: unknown[]) => {
    const fn = handlers.get(`${id}:${channel}`);
    if (!fn) return { error: `Plugin ${id} has no handler "${channel}"` };
    return fn(...args);
  });
}

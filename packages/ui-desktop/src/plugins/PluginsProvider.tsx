// Loads local plugins' renderer.js (source fetched over IPC, imported from a Blob URL so it works with both the
// Vite dev server and file://) and exposes what they contribute. A plugin that fails to load is skipped.
// Plugins switched off in Settings are listed but not activated; toggling reloads the active set.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PluginInfo } from "../preload";
import type { ActivePlugin, PluginContributions, PluginHostApi } from "./types";

const hostUi: PluginHostApi["ui"] = {
  btnCls:
    "px-3 py-1 text-xs rounded-md border border-border/60 text-muted hover:text-text hover:border-border cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-default",
  errorCls: "px-3 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-400",
  labelCls: "flex items-center gap-1 cursor-pointer text-xs text-muted",
};

interface PluginsContextValue {
  /** Enabled plugins whose renderer part loaded. */
  active: ActivePlugin[];
  /** Every installed plugin, enabled or not; `error` covers both the main and the renderer part. */
  installed: PluginInfo[];
  setEnabled(id: string, enabled: boolean): Promise<void>;
}

const PluginsContext = createContext<PluginsContextValue>({ active: [], installed: [], setEnabled: async () => {} });

export function usePlugins(): ActivePlugin[] {
  return useContext(PluginsContext).active;
}

export function usePluginRegistry(): PluginsContextValue {
  return useContext(PluginsContext);
}

async function activatePlugin(id: string, name: string): Promise<ActivePlugin | null> {
  const api = window.efOverlay?.plugins;
  const source = await api?.rendererSource(id);
  if (!api || !source) return null;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const mod = (await import(/* @vite-ignore */ url)) as {
      activate?: (host: PluginHostApi) => PluginContributions | Promise<PluginContributions>;
    };
    const host: PluginHostApi = { React, invoke: (channel, ...args) => api.invoke(id, channel, ...args), ui: hostUi };
    return { id, name, contributions: (await mod.activate?.(host)) ?? {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PluginsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActivePlugin[]>([]);
  const [installed, setInstalled] = useState<PluginInfo[]>([]);
  /** Kept across reloads so toggling one plugin doesn't remount (and reset) the others. */
  const activeRef = useRef<ActivePlugin[]>([]);

  const load = useCallback(async (infos: PluginInfo[]) => {
    const next: ActivePlugin[] = [];
    const rendererErrors = new Map<string, string>();
    for (const info of infos) {
      if (!info.enabled) continue;
      if (info.error) console.error(`[plugin:${info.id}] main failed:`, info.error);
      if (!info.hasRenderer) continue;
      const existing = activeRef.current.find((a) => a.id === info.id);
      if (existing) {
        next.push(existing);
        continue;
      }
      try {
        const p = await activatePlugin(info.id, info.name);
        if (p) next.push(p);
      } catch (err) {
        console.error(`[plugin:${info.id}] renderer failed:`, err);
        rendererErrors.set(info.id, err instanceof Error ? err.message : String(err));
      }
    }
    activeRef.current = next;
    setActive(next);
    setInstalled(infos.map((i) => (rendererErrors.has(i.id) ? { ...i, error: i.error ?? rendererErrors.get(i.id) } : i)));
  }, []);

  useEffect(() => {
    void (async () => load((await window.efOverlay?.plugins?.list()) ?? []))();
  }, [load]);

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const infos = await window.efOverlay?.plugins?.setEnabled(id, enabled);
      if (infos) await load(infos);
    },
    [load],
  );

  return <PluginsContext.Provider value={{ active, installed, setEnabled }}>{children}</PluginsContext.Provider>;
}

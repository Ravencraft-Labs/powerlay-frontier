import React, { useState, useEffect } from "react";
import { FRONTIER_WORLDS } from "@powerlay/core";
import { usePluginRegistry } from "../plugins/PluginsProvider";

const WORLD_PACKAGE_STILLNESS = FRONTIER_WORLDS.stillness.worldPackage;
const WORLD_PACKAGE_UTOPIA = FRONTIER_WORLDS.utopia.worldPackage;
const CONTRACTS_API_STILLNESS = "https://stillness-back.ravencraft.dev/api/v1";
const CONTRACTS_API_UTOPIA = "https://utopia-back.ravencraft.dev/api/v1";

type BackendEnvironment = "stillness" | "utopia";

function environmentPresetFromValues(
  worldPackageId: string,
  contractsApiBase: string,
  storageApiBase: string
): BackendEnvironment {
  if (
    worldPackageId === WORLD_PACKAGE_UTOPIA &&
    contractsApiBase === CONTRACTS_API_UTOPIA &&
    storageApiBase === CONTRACTS_API_UTOPIA
  ) {
    return "utopia";
  }
  return "stillness";
}

function applyEnvironmentPreset(environment: BackendEnvironment): {
  worldContractsPackageId: string;
  contractsApiBase: string;
  storageApiBase: string;
} {
  if (environment === "utopia") {
    return {
      worldContractsPackageId: WORLD_PACKAGE_UTOPIA,
      contractsApiBase: CONTRACTS_API_UTOPIA,
      storageApiBase: CONTRACTS_API_UTOPIA,
    };
  }

  return {
    worldContractsPackageId: WORLD_PACKAGE_STILLNESS,
    contractsApiBase: CONTRACTS_API_STILLNESS,
    storageApiBase: CONTRACTS_API_STILLNESS,
  };
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function PluginsSettings({ sectionCls }: { sectionCls: string }) {
  const { installed, setEnabled } = usePluginRegistry();
  const [dir, setDir] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void window.efOverlay?.plugins?.dir().then(setDir);
  }, []);

  return (
    <section className={sectionCls}>
      <h3 className="text-sm font-semibold text-text mb-2">Plugins</h3>
      <p className="text-xs text-muted mb-2">
        Local plugins from{" "}
        <code className="px-1 py-0.5 rounded bg-bg/80 text-xs break-all">{dir ?? "…"}</code>. Changes apply immediately.
      </p>
      {installed.length === 0 && <p className="text-xs text-muted">No plugins installed.</p>}
      <div className="space-y-2">
        {installed.map((p) => (
          <div key={p.id}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={p.enabled}
                disabled={busyId === p.id}
                onChange={async (e) => {
                  setBusyId(p.id);
                  try {
                    await setEnabled(p.id, e.target.checked);
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="rounded border-border-input"
              />
              <span className="text-sm text-text">{p.name}</span>
              <span className="text-xs text-muted">
                {p.id}
                {p.version ? ` · v${p.version}` : ""}
              </span>
            </label>
            {p.enabled && p.error && <p className="text-xs text-red-400 mt-1 ml-6 break-all">{p.error}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [gameLogDir, setGameLogDir] = useState("");
  const [skipLogPrompt, setSkipLogPrompt] = useState(false);
  const [backendEnvironment, setBackendEnvironment] = useState<BackendEnvironment>("stillness");
  const [overlayOpacity, setOverlayOpacity] = useState(92);
  const [miniMapOpacity, setMiniMapOpacity] = useState(92);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen && window.efOverlay?.settings?.get) {
      window.efOverlay.settings.get().then((s) => {
        setGameLogDir(s.gameLogDir ?? "");
        setSkipLogPrompt(s.skipLogPrompt ?? false);
        setOverlayOpacity(s.overlayOpacity ?? 92);
        setMiniMapOpacity(s.miniMapOpacity ?? s.overlayOpacity ?? 92);
        setBackendEnvironment(
          environmentPresetFromValues(
            (s.worldContractsPackageId ?? WORLD_PACKAGE_STILLNESS).trim(),
            (s.contractsApiBase ?? CONTRACTS_API_STILLNESS).trim(),
            (s.storageApiBase ?? CONTRACTS_API_STILLNESS).trim()
          )
        );
      });
    }
  }, [isOpen]);

  const handleSave = () => {
    const preset = applyEnvironmentPreset(backendEnvironment);
    window.efOverlay?.settings?.set({
      gameLogDir: gameLogDir || undefined,
      skipLogPrompt: skipLogPrompt || undefined,
      worldContractsPackageId: preset.worldContractsPackageId,
      contractsApiBase: preset.contractsApiBase,
      storageApiBase: preset.storageApiBase,
      overlayOpacity,
      miniMapOpacity,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleOpenLogFolder = () => {
    window.efOverlay?.app?.openLogFolder();
  };

  if (!isOpen) return null;

  const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-text">Settings</h2>
          <button
            type="button"
            className="p-1 rounded text-muted hover:text-text hover:bg-border"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <section className={sectionCls}>
          <h3 className="text-sm font-semibold text-text mb-2">EVE Frontier logs</h3>
          <p className="text-xs text-muted mb-2">Where the game writes its mining and activity logs.</p>
          <div className="mb-3 px-3 py-2 rounded-md bg-selection-bg/25 border border-selection-bg/50 text-sm text-text">
            <strong className="text-selection-text">Hint:</strong> Logs are usually in{" "}
            <code className="px-1 py-0.5 rounded bg-bg/80 text-xs">Documents\Frontier\Logs\Gamelogs</code> — use Browse to locate the folder.
          </div>
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <label className="text-muted text-xs block mb-1">Game log directory</label>
                <input
                  type="text"
                  className="w-full px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm"
                  value={gameLogDir}
                  onChange={(e) => setGameLogDir(e.target.value)}
                  placeholder="%USERPROFILE%\Documents\Frontier\Logs\Gamelogs"
                />
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface whitespace-nowrap"
                onClick={async () => {
                    const picked = await window.efOverlay?.app?.pickLogDir(gameLogDir || undefined);
                    if (picked) setGameLogDir(picked);
                  }}
              >
                Browse
              </button>
            </div>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
              onClick={handleSave}
            >
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <p className="text-xs text-muted mt-2">
            Restart the app after changing the game log path for changes to take effect.
          </p>
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!skipLogPrompt}
              onChange={(e) => setSkipLogPrompt(!e.target.checked)}
              className="rounded border-border-input"
            />
            <span className="text-sm text-text">Show log locate prompt on next launch</span>
          </label>
        </section>

        <section className={sectionCls}>
          <h3 className="text-sm font-semibold text-text mb-2">Server</h3>
          <p className="text-xs text-muted mb-2">
            Choose which Powerlay deployment the desktop app should use.
          </p>
          <div className="space-y-2">
            <label className="text-muted text-xs block">Target server</label>
            <select
              className="w-full px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm"
              value={backendEnvironment}
              onChange={(e) => setBackendEnvironment(e.target.value as BackendEnvironment)}
            >
              <option value="stillness">Stillness</option>
              <option value="utopia">Utopia</option>
            </select>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
              onClick={handleSave}
            >
              {saved ? "Saved" : "Save"}
            </button>
          </div>
        </section>

        <section className={sectionCls}>
          <h3 className="text-sm font-semibold text-text mb-2">Overlay</h3>
          <p className="text-xs text-muted mb-3">Background opacity of the overlay windows and of the map window next to Scout.</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-muted text-xs">Opacity</label>
              <span className="text-sm text-text tabular-nums">{overlayOpacity}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex items-center justify-between">
              <label className="text-muted text-xs">Map window opacity</label>
              <span className="text-sm text-text tabular-nums">{miniMapOpacity}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={miniMapOpacity}
              onChange={(e) => setMiniMapOpacity(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
              onClick={handleSave}
            >
              {saved ? "Saved" : "Save"}
            </button>
          </div>
        </section>

        <PluginsSettings sectionCls={sectionCls} />

        <section className={sectionCls}>
          <h3 className="text-sm font-semibold text-text mb-2">Powerlay logs</h3>
          <p className="text-xs text-muted mb-2">Diagnostic logs from this app (tailer, mining reader, etc.).</p>
          <button
            type="button"
            className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
            onClick={handleOpenLogFolder}
          >
            Open Powerlay log folder
          </button>
        </section>
      </div>
    </div>
  );
}

export function SettingsCogButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="p-2 rounded text-muted hover:text-text hover:bg-border"
      onClick={onClick}
      title="Settings"
      aria-label="Settings"
    >
      <CogIcon />
    </button>
  );
}

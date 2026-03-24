import React, { useState, useEffect } from "react";

/** Must match defaults in electron-shell `playerTribeFromChain.ts` */
const DEFAULT_EF_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";
const DEFAULT_EF_WORLD_API_BASE_URL = "https://world-api-stillness.live.tech.evefrontier.com";

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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [gameLogDir, setGameLogDir] = useState("");
  const [skipLogPrompt, setSkipLogPrompt] = useState(false);
  const [efGraphqlUrl, setEfGraphqlUrl] = useState("");
  const [efWorldApiBaseUrl, setEfWorldApiBaseUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen && window.efOverlay?.settings?.get) {
      window.efOverlay.settings.get().then((s) => {
        setGameLogDir(s.gameLogDir ?? "");
        setSkipLogPrompt(s.skipLogPrompt ?? false);
        setEfGraphqlUrl(s.efGraphqlUrl ?? "");
        setEfWorldApiBaseUrl(s.efWorldApiBaseUrl ?? "");
      });
    }
  }, [isOpen]);

  const handleSave = () => {
    window.efOverlay?.settings?.set({
      gameLogDir: gameLogDir || undefined,
      skipLogPrompt: skipLogPrompt || undefined,
      efGraphqlUrl: efGraphqlUrl.trim() || undefined,
      efWorldApiBaseUrl: efWorldApiBaseUrl.trim() || undefined,
    });
    window.dispatchEvent(new Event("powerlay:settings-saved"));
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
          <h3 className="text-sm font-semibold text-text mb-2">Contracts &amp; tribe</h3>
          <p className="text-xs text-muted mb-2">
            To show <strong className="text-text">tribe</strong> and <strong className="text-text">alliance</strong> contracts in search, this app looks up your tribe using your wallet and a{" "}
            <strong className="text-text">Sui GraphQL</strong> endpoint. The default is Sui testnet; if your game data lives elsewhere, enter the GraphQL URL your team or docs provide. Your tribe
            <strong className="text-text"> display name</strong> is loaded from the EVE Frontier <strong className="text-text">World API</strong> (<code className="text-[0.65rem]">GET /v2/tribes/{"{id}"}</code>
            ) when possible.
          </p>
          <label className="text-muted text-xs block mb-1">Sui GraphQL URL (optional override)</label>
          <input
            type="url"
            className="w-full px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm mb-2"
            value={efGraphqlUrl}
            onChange={(e) => setEfGraphqlUrl(e.target.value)}
            placeholder={DEFAULT_EF_GRAPHQL_URL}
            spellCheck={false}
            autoComplete="off"
          />
          <p className="text-xs text-muted mb-2">
            Leave empty to use the built-in default (<code className="px-1 rounded bg-border-input/80 text-[0.65rem] break-all">{DEFAULT_EF_GRAPHQL_URL}</code>
            ), unless <code className="px-1 rounded bg-border-input/80 text-[0.65rem]">POWERLAY_EF_GRAPHQL_URL</code> is set in the environment.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
              onClick={async () => {
                setEfGraphqlUrl("");
                const cur = await window.efOverlay?.settings?.get();
                if (cur && window.efOverlay?.settings?.set) {
                  await window.efOverlay.settings.set({ ...cur, efGraphqlUrl: undefined });
                  window.dispatchEvent(new Event("powerlay:settings-saved"));
                }
              }}
            >
              Use default GraphQL
            </button>
            <button type="button" className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface" onClick={handleSave}>
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <label className="text-muted text-xs block mb-1 mt-3">World API base URL (optional override)</label>
          <input
            type="url"
            className="w-full px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm mb-2"
            value={efWorldApiBaseUrl}
            onChange={(e) => setEfWorldApiBaseUrl(e.target.value)}
            placeholder={DEFAULT_EF_WORLD_API_BASE_URL}
            spellCheck={false}
            autoComplete="off"
          />
          <p className="text-xs text-muted mb-2">
            No trailing slash. Leave empty for Stillness default (
            <code className="px-1 rounded bg-border-input/80 text-[0.65rem] break-all">{DEFAULT_EF_WORLD_API_BASE_URL}</code>
            ) or set <code className="px-1 rounded bg-border-input/80 text-[0.65rem]">POWERLAY_EF_WORLD_API_BASE</code> (e.g. your dev gateway). Docs:{" "}
            <a
              className="text-selection-text underline-offset-2 hover:underline"
              href="https://world-api-stillness.live.tech.evefrontier.com/docs/index.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Swagger UI
            </a>
            . Disable name lookup: <code className="px-1 rounded bg-border-input/80 text-[0.65rem]">POWERLAY_EF_WORLD_API_DISABLE=true</code>.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface"
              onClick={async () => {
                setEfWorldApiBaseUrl("");
                const cur = await window.efOverlay?.settings?.get();
                if (cur && window.efOverlay?.settings?.set) {
                  await window.efOverlay.settings.set({ ...cur, efWorldApiBaseUrl: undefined });
                  window.dispatchEvent(new Event("powerlay:settings-saved"));
                }
              }}
            >
              Use default World API
            </button>
            <button type="button" className="px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface" onClick={handleSave}>
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <p className="text-xs text-muted mt-2">After changing this, tribe access refreshes automatically. You may need to open the Contracts tab again.</p>
        </section>

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

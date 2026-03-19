import React, { useState, useEffect } from "react";
import { TribeTodoSection } from "./components/TribeTodoSection";
import { BuildMiningSection } from "./components/BuildMiningSection";
import { SettingsModal, SettingsCogButton } from "./components/SettingsModal";
import { LogLocateModal } from "./components/LogLocateModal";
import { AuthProvider } from "./context/AuthContext";
import { WalletLoginButton } from "./components/WalletLoginButton";

type TabId = "todo" | "builder";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("builder");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogLocateModal, setShowLogLocateModal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.efOverlay?.app?.shouldShowLogPrompt) return;
    window.efOverlay.app.shouldShowLogPrompt().then(({ show }) => {
      if (show) setShowLogLocateModal(true);
    });
  }, []);

  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <nav className="flex gap-0 -mb-px">
          <h1 className="m-0 mr-6 text-xl font-semibold text-text">Powerlay Frontier</h1>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === "builder"
                ? "text-selection-text border-selection-bg font-semibold"
                : "text-muted border-transparent hover:text-text"
            }`}
            onClick={() => setActiveTab("builder")}
          >
            Builder
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === "todo"
                ? "text-selection-text border-selection-bg font-semibold"
                : "text-muted border-transparent hover:text-text"
            }`}
            onClick={() => setActiveTab("todo")}
          >
            TODO
          </button>
        </nav>
          <div className="flex items-center gap-3">
            <WalletLoginButton />
            <SettingsCogButton onClick={() => setSettingsOpen(true)} />
          </div>
        </header>
      <main className="flex-1 min-h-0 p-6 flex flex-col gap-6 overflow-y-auto">
        {activeTab === "builder" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <BuildMiningSection />
          </div>
        )}
        {activeTab === "todo" && <TribeTodoSection />}
      </main>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LogLocateModal
        isOpen={showLogLocateModal}
        onClose={() => setShowLogLocateModal(false)}
      />
      </div>
    </AuthProvider>
  );
}

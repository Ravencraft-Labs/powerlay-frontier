import React, { useState, useEffect, useCallback, useRef } from "react";
import { ContractsSection } from "./components/contracts/ContractsSection";
import { BuildMiningSection } from "./components/BuildMiningSection";
import { SettingsModal, SettingsCogButton } from "./components/SettingsModal";
import { LogLocateModal } from "./components/LogLocateModal";
import { AuthProvider } from "./context/AuthContext";
import { ContractsAccessProvider } from "./context/ContractsAccessContext";
import { WalletLoginButton } from "./components/WalletLoginButton";

type TabId = "contracts" | "builder";

const TAB_LABELS: Record<TabId, string> = {
  contracts: "Contracts",
  builder: "Builder",
};

const DEFAULT_TAB_ORDER: TabId[] = ["contracts", "builder"];
const STORAGE_ORDER_KEY = "powerlay:main-tab-order";
const STORAGE_ACTIVE_KEY = "powerlay:main-active-tab";

function isTabId(x: unknown): x is TabId {
  return x === "contracts" || x === "builder";
}

function loadTabOrder(): TabId[] {
  try {
    const raw = localStorage.getItem(STORAGE_ORDER_KEY);
    if (!raw) return [...DEFAULT_TAB_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_TAB_ORDER];
    const ids = parsed.filter(isTabId);
    if (ids.length !== DEFAULT_TAB_ORDER.length || new Set(ids).size !== DEFAULT_TAB_ORDER.length) {
      return [...DEFAULT_TAB_ORDER];
    }
    return ids;
  } catch {
    return [...DEFAULT_TAB_ORDER];
  }
}

function loadActiveTab(): TabId {
  try {
    const a = localStorage.getItem(STORAGE_ACTIVE_KEY);
    if (isTabId(a)) return a;
  } catch {
    /* ignore */
  }
  return "contracts";
}

function reorderTabs(order: TabId[], fromId: TabId, toId: TabId): TabId[] {
  const fromIndex = order.indexOf(fromId);
  const toIndex = order.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export default function App() {
  const [tabOrder, setTabOrder] = useState<TabId[]>(loadTabOrder);
  const [activeTab, setActiveTab] = useState<TabId>(loadActiveTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogLocateModal, setShowLogLocateModal] = useState(false);
  const [draggingTab, setDraggingTab] = useState<TabId | null>(null);
  /** Skip the synthetic click after a successful drop (avoids toggling tab unintentionally). */
  const suppressTabClickRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(tabOrder));
    } catch {
      /* ignore */
    }
  }, [tabOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_KEY, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.efOverlay?.app?.shouldShowLogPrompt) return;
    window.efOverlay.app.shouldShowLogPrompt().then(({ show }) => {
      if (show) setShowLogLocateModal(true);
    });
  }, []);

  const onTabDragStart = useCallback((e: React.DragEvent, id: TabId) => {
    e.dataTransfer.setData("application/x-powerlay-tab", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingTab(id);
  }, []);

  const onTabDragEnd = useCallback(() => {
    setDraggingTab(null);
  }, []);

  const onTabDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onTabDrop = useCallback((e: React.DragEvent, targetId: TabId) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("application/x-powerlay-tab");
    if (!isTabId(fromId) || fromId === targetId) return;
    suppressTabClickRef.current = true;
    setTabOrder((prev) => reorderTabs(prev, fromId, targetId));
    window.setTimeout(() => {
      suppressTabClickRef.current = false;
    }, 0);
  }, []);

  const onTabActivate = useCallback((id: TabId) => {
    if (suppressTabClickRef.current) return;
    setActiveTab(id);
  }, []);

  return (
    <AuthProvider>
      <ContractsAccessProvider>
        <div className="min-h-screen flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border">
            <nav className="flex items-end gap-0 -mb-px flex-wrap" aria-label="Main">
              <h1 className="m-0 mr-6 text-xl font-semibold text-text shrink-0">Powerlay Frontier</h1>
              <div className="flex gap-0" role="tablist">
                {tabOrder.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    draggable
                    title="Drag to reorder tabs"
                    onDragStart={(e) => onTabDragStart(e, id)}
                    onDragEnd={onTabDragEnd}
                    onDragOver={onTabDragOver}
                    onDrop={(e) => onTabDrop(e, id)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 select-none cursor-grab active:cursor-grabbing ${
                      activeTab === id
                        ? "text-selection-text border-selection-bg font-semibold"
                        : "text-muted border-transparent hover:text-text"
                    } ${draggingTab === id ? "opacity-60" : ""}`}
                    onClick={() => onTabActivate(id)}
                  >
                    {TAB_LABELS[id]}
                  </button>
                ))}
              </div>
            </nav>
            <div className="flex items-center gap-3 shrink-0">
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
            {activeTab === "contracts" && <ContractsSection />}
          </main>
          <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <LogLocateModal isOpen={showLogLocateModal} onClose={() => setShowLogLocateModal(false)} />
        </div>
      </ContractsAccessProvider>
    </AuthProvider>
  );
}

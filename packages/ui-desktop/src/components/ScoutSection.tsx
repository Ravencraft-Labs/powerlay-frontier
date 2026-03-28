import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ScoutEntry, RiftZone, ScoutVisibility, CreateScoutEntryInput, ScoutSettings, ScoutActivityEvent } from "@powerlay/core";
import { ScoutQuickPicker } from "./ScoutQuickPicker";
import { ScoutAddEntryForm } from "./ScoutAddEntryForm";
import { ScoutEntryList } from "./ScoutEntryList";
import { OverlayWithLock } from "./OverlayWithLock";

const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";
const filterPillCls = (on: boolean) =>
  `px-3 py-1 text-xs font-medium rounded-full border cursor-pointer ${
    on
      ? "border-selection-bg bg-selection-bg/15 text-text"
      : "border-border/50 text-muted hover:text-text hover:border-border"
  }`;

type FilterValue = RiftZone | "all" | "note" | "anomaly" | "resource" | "structure";

const FILTER_OPTIONS: Array<{ label: string; value: FilterValue }> = [
  { label: "All",    value: "all" },
  { label: "RIFT",   value: "RIFT" },
  { label: "INNER",  value: "INNER" },
  { label: "TROJAN", value: "TROJAN" },
  { label: "FRINGE", value: "FRINGE" },
  { label: "OUTER",  value: "OUTER" },
  { label: "FERAL",  value: "FERAL" },
  { label: "Notes",  value: "note" },
];

const VISIBILITY_LABELS: Record<ScoutVisibility, string> = {
  tribe: "Tribe",
  alliance: "Alliance",
  private: "Private",
};

export function ScoutSection() {
  const [autoSystem, setAutoSystem] = useState<string | null>(null);
  const [systemOverride, setSystemOverride] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState("");
  const [editingSystem, setEditingSystem] = useState(false);
  const [entries, setEntries] = useState<ScoutEntry[]>([]);
  const [filterType, setFilterType] = useState<FilterValue>("all");
  const [settings, setSettings] = useState<ScoutSettings>({ defaultVisibility: "tribe" });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<ScoutActivityEvent[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const overrideInputRef = useRef<HTMLInputElement>(null);

  const activeSystem = systemOverride ?? autoSystem ?? "";

  const loadEntries = useCallback(async () => {
    try {
      const list = await window.efOverlay?.scout?.list();
      if (list) setEntries(list);
    } catch {
      /* ignore */
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await window.efOverlay?.scout?.getSettings();
      if (s) {
        setSettings(s);
        setSystemOverride(s.systemOverride ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void window.efOverlay?.scout?.startWatching?.();
    void loadSettings();
    void loadEntries();

    const interval = setInterval(async () => {
      try {
        const [sys, list] = await Promise.all([
          window.efOverlay?.scout?.getCurrentSystem?.(),
          window.efOverlay?.scout?.list?.(),
        ]);
        setAutoSystem(sys ?? null);
        if (list) setEntries(list);
      } catch {
        /* ignore */
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [loadEntries, loadSettings]);

  useEffect(() => {
    if (editingSystem && overrideInputRef.current) {
      overrideInputRef.current.focus();
    }
  }, [editingSystem]);

  async function handleSetOverride() {
    const trimmed = overrideInput.trim();
    if (!trimmed) return;
    setSystemOverride(trimmed);
    setEditingSystem(false);
    try {
      const updated = await window.efOverlay?.scout?.setSystemOverride?.(trimmed);
      if (updated) setSettings(updated);
    } catch {
      /* ignore */
    }
  }

  async function handleClearOverride() {
    setSystemOverride(null);
    setEditingSystem(false);
    setOverrideInput("");
    try {
      const updated = await window.efOverlay?.scout?.setSystemOverride?.(null);
      if (updated) setSettings(updated);
    } catch {
      /* ignore */
    }
  }

  async function handleAddEntry(input: CreateScoutEntryInput) {
    try {
      await window.efOverlay?.scout?.create?.(input);
      await loadEntries();
    } catch {
      /* ignore */
    }
  }

  async function handleRemoveEntry(id: string) {
    try {
      await window.efOverlay?.scout?.delete?.(id);
      await loadEntries();
    } catch {
      /* ignore */
    }
  }

  async function handleMarkCleared(id: string) {
    const actor = "manual"; // future: use session?.walletAddress or character name
    try {
      await window.efOverlay?.scout?.update?.(id, { status: "cleared", clearedBy: actor });
      await loadEntries();
      if (logOpen) await loadActivityLog();
    } catch {
      /* ignore */
    }
  }

  const loadActivityLog = useCallback(async () => {
    try {
      const log = await window.efOverlay?.scout?.getActivityLog?.(100);
      if (log) setActivityLog(log);
    } catch {
      /* ignore */
    }
  }, []);

  async function handleDelete(id: string) {
    try {
      await window.efOverlay?.scout?.delete?.(id);
      await loadEntries();
      if (logOpen) await loadActivityLog();
    } catch {
      /* ignore */
    }
  }

  async function handleVisibilityChange(vis: ScoutVisibility) {
    setSettings((prev) => ({ ...prev, defaultVisibility: vis }));
    try {
      const updated = await window.efOverlay?.scout?.updateSettings?.({ defaultVisibility: vis });
      if (updated) setSettings(updated);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className={sectionCls}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="m-0 text-base font-semibold text-text">Scout</h2>
        <OverlayWithLock
          frame="scout"
          btnCls="px-3 py-1 text-xs rounded-md border border-border/60 text-muted hover:text-text hover:border-border cursor-pointer bg-transparent"
        />
      </div>

      {/* System banner */}
      <div className="flex items-center gap-2 mb-4 p-3 rounded-md border border-border/50 bg-bg/40">
        <span className="text-xs text-muted shrink-0">System:</span>
        {editingSystem ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              ref={overrideInputRef}
              className="flex-1 px-2 py-1 text-sm bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg"
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              placeholder="Enter system name…"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSetOverride(); if (e.key === "Escape") setEditingSystem(false); }}
            />
            <button type="button" onClick={() => void handleSetOverride()} className="text-xs text-text px-2 py-1 rounded border border-border cursor-pointer bg-transparent hover:border-selection-bg">Set</button>
            <button type="button" onClick={() => setEditingSystem(false)} className="text-xs text-muted px-2 py-1 rounded border border-border/40 cursor-pointer bg-transparent hover:text-text">Cancel</button>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <span className={`flex-1 font-mono text-sm ${activeSystem ? "text-text" : "text-muted italic"}`}>
              {activeSystem || (autoSystem === null ? "detecting…" : "unknown")}
            </span>
            {systemOverride && (
              <span className="text-xs text-yellow-400/80 border border-yellow-400/30 rounded px-1.5 py-0.5">manual</span>
            )}
            {!systemOverride && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await window.efOverlay?.scout?.startWatching?.();
                    const sys = await window.efOverlay?.scout?.getCurrentSystem?.();
                    setAutoSystem(sys ?? null);
                  } catch { /* ignore */ }
                }}
                className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0.5"
                title="Re-scan chat log for current system"
              >
                ↺
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOverrideInput(activeSystem); setEditingSystem(true); }}
              className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0.5"
              title="Override system"
            >
              ✎
            </button>
            {systemOverride && (
              <button
                type="button"
                onClick={() => void handleClearOverride()}
                className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0.5"
                title="Reset to auto-detect"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* Visibility + Last Report */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs text-muted">Share:</span>
        {(["tribe", "alliance", "private"] as ScoutVisibility[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => void handleVisibilityChange(v)}
            className={filterPillCls(settings.defaultVisibility === v)}
          >
            {VISIBILITY_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Quick picker — one-click rift/anomaly toggle */}
      <div className="mb-4 p-3 rounded-md border border-border/40 bg-bg/20">
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          {activeSystem ? `Quick mark — ${activeSystem}` : "Quick mark"}
        </div>
        <ScoutQuickPicker
          system={activeSystem}
          entries={entries}
          defaultVisibility={settings.defaultVisibility}
          onAdd={(input) => void handleAddEntry(input)}
          onRemove={(id) => void handleRemoveEntry(id)}
        />
      </div>

      {/* Advanced: notes / resources / structures */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0 mb-2"
        >
          <span>{advancedOpen ? "▾" : "▸"}</span>
          <span>Advanced entry (notes, resources, structures…)</span>
        </button>
        {advancedOpen && (
          <div className="p-3 rounded-md border border-border/40 bg-bg/20">
            <ScoutAddEntryForm
              currentSystem={activeSystem}
              defaultVisibility={settings.defaultVisibility}
              onSubmit={(input) => void handleAddEntry(input)}
            />
          </div>
        )}
      </div>

      {/* Filter + entry list */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTER_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilterType(value)}
            className={filterPillCls(filterType === value)}
          >
            {label}
          </button>
        ))}
      </div>

      <ScoutEntryList
        entries={entries}
        filter={filterType}
        onMarkCleared={(id) => void handleMarkCleared(id)}
        onDelete={(id) => void handleDelete(id)}
      />

      {/* Activity log */}
      <div className="mt-5 border-t border-border/40 pt-3">
        <button
          type="button"
          onClick={async () => {
            const next = !logOpen;
            setLogOpen(next);
            if (next) await loadActivityLog();
          }}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0"
        >
          <span>{logOpen ? "▾" : "▸"}</span>
          <span>Activity log</span>
        </button>
        {logOpen && (
          <div className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
            {activityLog.length === 0 ? (
              <span className="text-xs text-muted italic">No activity yet.</span>
            ) : (
              activityLog.map((event) => (
                <div key={event.id} className="flex items-baseline gap-2 text-xs">
                  <span className={`shrink-0 font-semibold ${
                    event.action === "created" ? "text-green-400" :
                    event.action === "cleared" ? "text-yellow-400" :
                    "text-red-400/70"
                  }`}>
                    {event.action}
                  </span>
                  <span className="text-muted">{event.system}</span>
                  {event.subtype && <span className="text-text/80">{event.subtype}</span>}
                  {event.zone && <span className="text-muted/60">{event.zone}</span>}
                  <span className="text-muted/50 ml-auto shrink-0">{event.actor}</span>
                  <span className="text-muted/40 shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}

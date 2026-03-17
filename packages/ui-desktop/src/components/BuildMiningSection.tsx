import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { BuildPlan } from "@powerlay/core";
import {
  totalManufacturingTimeSeconds,
  buildProductionTree,
  getBaseMaterialsFromTrees,
  totalVolumeFromMaterials,
} from "@powerlay/core";
import type { GameData } from "../preload";
import { BuildPage } from "./BuildPage";

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const BUILDS_STORAGE_KEY = "powerlay-builds";
const TIMER_STORAGE_KEY = "powerlay-production-timer";
const MINING_MINED_KEY = "powerlay-mining-mined";
const MINING_MANUAL_KEY = "powerlay-mining-manual";
const MINING_NEEDED_OVERRIDE_KEY = "powerlay-mining-needed-override";
const SELECTED_BUILD_KEY = "powerlay-selected-build";

interface ProductionTimerState {
  buildId: string;
  status: "running" | "paused" | "finished";
  startedAt: number;
  pausedElapsedSeconds: number;
}

function loadTimerState(): Record<string, ProductionTimerState> {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    return typeof data === "object" && data !== null ? (data as Record<string, ProductionTimerState>) : {};
  } catch {
    return {};
  }
}

function saveTimerState(state: Record<string, ProductionTimerState>): void {
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
}

type MiningManualByType = Record<string, Record<number, number>>;

function loadMiningManual(): MiningManualByType {
  try {
    const raw = localStorage.getItem(MINING_MANUAL_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(MINING_MINED_KEY);
      if (legacy) {
        const data = JSON.parse(legacy) as unknown;
        if (typeof data === "object" && data !== null) {
          const obj = data as Record<string, unknown>;
          const hasOldFormat = Object.values(obj).some((v) => typeof v === "number");
          if (hasOldFormat) {
            localStorage.removeItem(MINING_MINED_KEY);
            return {};
          }
          localStorage.setItem(MINING_MANUAL_KEY, legacy);
          localStorage.removeItem(MINING_MINED_KEY);
          return obj as MiningManualByType;
        }
      }
      return {};
    }
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== "object" || data === null) return {};
    const obj = data as Record<string, unknown>;
    const hasOldFormat = Object.values(obj).some((v) => typeof v === "number");
    if (hasOldFormat) return {};
    return obj as MiningManualByType;
  } catch {
    return {};
  }
}

function saveMiningManual(state: MiningManualByType): void {
  localStorage.setItem(MINING_MANUAL_KEY, JSON.stringify(state));
}

function loadMiningNeededOverride(): MiningManualByType {
  try {
    const raw = localStorage.getItem(MINING_NEEDED_OVERRIDE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    return typeof data === "object" && data !== null ? (data as MiningManualByType) : {};
  } catch {
    return {};
  }
}

function saveMiningNeededOverride(state: MiningManualByType): void {
  localStorage.setItem(MINING_NEEDED_OVERRIDE_KEY, JSON.stringify(state));
}

function getBuildsApi() {
  if (typeof window === "undefined") return undefined;
  return window.efOverlay?.builds;
}

async function listBuilds(): Promise<BuildPlan[]> {
  const api = getBuildsApi();
  if (api) return api.list();
  try {
    const raw = localStorage.getItem(BUILDS_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveBuild(plan: BuildPlan): Promise<BuildPlan> {
  const api = getBuildsApi();
  const toSave = { ...plan, updatedAt: Date.now() };
  if (api) return api.save(toSave);
  const all = await listBuilds();
  const idx = all.findIndex((b) => b.id === plan.id);
  if (idx >= 0) all[idx] = toSave;
  else all.push(toSave);
  localStorage.setItem(BUILDS_STORAGE_KEY, JSON.stringify(all));
  return toSave;
}

async function removeBuild(id: string): Promise<boolean> {
  const api = getBuildsApi();
  if (api) return api.delete(id);
  const before = await listBuilds();
  const all = before.filter((b) => b.id !== id);
  if (all.length === before.length) return false;
  localStorage.setItem(BUILDS_STORAGE_KEY, JSON.stringify(all));
  return true;
}

/** Returns the next available "Build #N" number not used by existing builds. */
function getNextBuildNumber(builds: BuildPlan[]): number {
  const used = new Set<number>();
  const match = /^Build #(\d+)$/i;
  for (const b of builds) {
    const m = b.name?.trim().match(match);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function createNewBuild(builds: BuildPlan[]): BuildPlan {
  const n = getNextBuildNumber(builds);
  return {
    id: `build-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: `Build #${n}`,
    facilities: [],
    plannedItems: [],
    lasers: [],
    updatedAt: Date.now(),
  };
}

export function BuildMiningSection() {
  const [builds, setBuilds] = useState<BuildPlan[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<BuildPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [editingBuildId, setEditingBuildId] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<Record<string, ProductionTimerState>>(() => loadTimerState());
  const [miningMinedManual, setMiningMinedManual] = useState<MiningManualByType>(() => loadMiningManual());
  const [miningNeededOverride, setMiningNeededOverride] = useState<MiningManualByType>(() => loadMiningNeededOverride());
  const [miningMinedFromLog, setMiningMinedFromLog] = useState<Record<string, Record<number, number>>>({});
  const [miningErrors, setMiningErrors] = useState<{
    tailerTestError?: string;
    logReaderError?: string;
    trackingActive?: boolean;
  }>({});
  const [tick, setTick] = useState(0);
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleMiningManualChange = useCallback((buildId: string, typeID: number, mined: number) => {
    setMiningMinedManual((prev) => {
      const build = { ...(prev[buildId] ?? {}), [typeID]: mined };
      const next = { ...prev, [buildId]: build };
      saveMiningManual(next);
      return next;
    });
  }, []);

  const handleMiningNeededOverrideChange = useCallback((buildId: string, typeID: number, needed: number) => {
    setMiningNeededOverride((prev) => {
      const build = { ...(prev[buildId] ?? {}), [typeID]: needed };
      const next = { ...prev, [buildId]: build };
      saveMiningNeededOverride(next);
      return next;
    });
  }, []);

  useEffect(() => {
    window.efOverlay?.mining?.setSelectedBuild(selectedBuild?.id ?? null);
  }, [selectedBuild?.id]);

  useEffect(() => {
    const api = window.efOverlay?.mining;
    if (!api) return;
    const poll = () => {
      api.getState().then(setMiningMinedFromLog);
      api.getErrors().then(setMiningErrors);
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  const handleMiningStartTracking = useCallback(() => {
    if (!selectedBuild || !gameData?.types) {
      window.efOverlay?.mining?.startTracking();
      return;
    }
    const baseMats = computeBaseMaterials(selectedBuild);
    const plannedVolByTypeId: Record<number, number> = {};
    for (const m of baseMats) {
      const vol = (gameData.types[String(m.typeID)]?.volume ?? 0) * m.quantity;
      plannedVolByTypeId[m.typeID] =
        (plannedVolByTypeId[m.typeID] ?? 0) + vol;
    }
    window.efOverlay?.mining?.startTracking({
      buildId: selectedBuild.id,
      plannedVolByTypeId: Object.keys(plannedVolByTypeId).length > 0 ? plannedVolByTypeId : undefined,
    });
  }, [selectedBuild, gameData]);

  const handleMiningStopTracking = useCallback(() => {
    window.efOverlay?.mining?.stopTracking();
  }, []);

  const handleMiningReset = useCallback((buildId: string) => {
    setMiningMinedManual((prev) => {
      const next = { ...prev };
      delete next[buildId];
      saveMiningManual(next);
      return next;
    });
    setMiningNeededOverride((prev) => {
      const next = { ...prev };
      delete next[buildId];
      saveMiningNeededOverride(next);
      return next;
    });
    window.efOverlay?.mining?.resetBuild(buildId);
  }, []);

  const persistTimerState = useCallback((next: Record<string, ProductionTimerState>) => {
    setTimerState(next);
    saveTimerState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBuilds().then((list) => {
      if (cancelled) return;
      setBuilds(list);
      try {
        const savedId = localStorage.getItem(SELECTED_BUILD_KEY);
        const found = savedId ? list.find((b) => b.id === savedId) : null;
        setSelectedBuild(found ?? (list.length > 0 ? list[0] : null));
      } catch {
        setSelectedBuild(list.length > 0 ? list[0] : null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [gameDataError, setGameDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGameDataError(null);
    if (!window.efOverlay?.gameData?.get) {
      setGameDataError("Not in Electron: gameData API unavailable (browser or preload missing).");
      return;
    }
    window.efOverlay.gameData.get().then((data) => {
      if (cancelled) return;
      setGameData(data);
      if (data?.errors?.types || data?.errors?.blueprints) {
        const parts: string[] = [];
        if (data.errors.types) parts.push(`Types: ${data.errors.types}`);
        if (data.errors.blueprints) parts.push(`Blueprints: ${data.errors.blueprints}`);
        setGameDataError(parts.join(" | "));
      } else if (data && Object.keys(data.types).length === 0) {
        setGameDataError("Types loaded but empty. Ensure data/stripped/types.json exists (run pnpm strip-types first).");
      }
    }).catch((err) => {
      if (!cancelled) setGameDataError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddBuild = async () => {
    const plan = createNewBuild(builds);
    const saved = await saveBuild(plan);
    const list = await listBuilds();
    setBuilds(list);
    setSelectedBuild(list.find((b) => b.id === saved.id) ?? saved);
  };

  const handleSelectBuild = useCallback((build: BuildPlan) => {
    setSelectedBuild(build);
    try {
      localStorage.setItem(SELECTED_BUILD_KEY, build.id);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSaveBuild = useCallback(async (plan: BuildPlan) => {
    const saved = await saveBuild(plan);
    setBuilds((prev) => {
      const idx = prev.findIndex((b) => b.id === plan.id);
      const next = idx >= 0 ? [...prev] : [...prev, saved];
      if (idx >= 0) next[idx] = saved;
      return next;
    });
    setSelectedBuild((prev) => (prev?.id === plan.id ? saved : prev));
  }, []);

  const handleDeleteBuild = useCallback(async (id: string) => {
    await removeBuild(id);
    setMiningMinedManual((prev) => {
      const next = { ...prev };
      delete next[id];
      saveMiningManual(next);
      return next;
    });
    setMiningNeededOverride((prev) => {
      const next = { ...prev };
      delete next[id];
      saveMiningNeededOverride(next);
      return next;
    });
    window.efOverlay?.mining?.resetBuild(id);
    setTimerState((prev) => {
      const next = { ...prev };
      delete next[id];
      saveTimerState(next);
      return next;
    });
    const list = await listBuilds();
    setBuilds(list);
    setSelectedBuild((prev) => {
      let next: BuildPlan | null;
      if (prev?.id === id) next = list.length ? list[0] : null;
      else if (prev && list.some((b) => b.id === prev.id)) {
        next = list.find((b) => b.id === prev!.id) ?? prev;
      } else next = prev;
      try {
        localStorage.setItem(SELECTED_BUILD_KEY, next?.id ?? "");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const handleRenameBuild = useCallback(async (build: BuildPlan, newName: string) => {
    const trimmed = newName.trim() || "Unnamed";
    const updated = { ...build, name: trimmed, updatedAt: Date.now() };
    const saved = await saveBuild(updated);
    setBuilds((prev) => {
      const idx = prev.findIndex((b) => b.id === build.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    setSelectedBuild((prev) => (prev?.id === build.id ? saved : prev));
    setEditingBuildId(null);
  }, []);

  const startEditing = useCallback((id: string) => setEditingBuildId(id), []);

  /** Timer uses only final product manufacturing time (mining/refining will have separate logic later). */
  function computeTotalProductionTime(build: BuildPlan): number {
    if (!gameData?.types || !gameData?.blueprints) return 0;
    return totalManufacturingTimeSeconds(build.plannedItems, gameData.blueprints, gameData.types);
  }

  /** Total volume (m³) of base materials (ore) for mining progress. Matches cargo space. */
  function computeTotalOreVolume(build: BuildPlan): number {
    if (!gameData?.types || !gameData?.blueprints) return 0;
    const hasTypeIds = build.plannedItems.length > 0 && build.plannedItems.every((p) => p.typeID != null);
    if (!hasTypeIds) return 0;
    const typeIdItems = build.plannedItems
      .filter((p): p is typeof p & { typeID: number } => p.typeID != null)
      .map((p) => ({ typeID: p.typeID, quantity: p.quantity, blueprintTypeID: p.blueprintTypeID }));
    const trees = buildProductionTree(
      typeIdItems,
      gameData.blueprints,
      gameData.types,
      { overrides: build.intermediateBlueprintOverrides }
    );
    const baseList = getBaseMaterialsFromTrees(trees, gameData.types);
    const baseRecord = Object.fromEntries(baseList.map((m) => [m.typeID, m.quantity]));
    return totalVolumeFromMaterials(baseRecord, gameData.types);
  }

  function computeBaseMaterials(build: BuildPlan): Array<{ typeID: number; name: string; quantity: number }> {
    if (!gameData?.types || !gameData?.blueprints) return [];
    const hasTypeIds = build.plannedItems.length > 0 && build.plannedItems.every((p) => p.typeID != null);
    if (!hasTypeIds) return [];
    const typeIdItems = build.plannedItems
      .filter((p): p is typeof p & { typeID: number } => p.typeID != null)
      .map((p) => ({ typeID: p.typeID, quantity: p.quantity, blueprintTypeID: p.blueprintTypeID }));
    const trees = buildProductionTree(
      typeIdItems,
      gameData.blueprints,
      gameData.types,
      { overrides: build.intermediateBlueprintOverrides }
    );
    return getBaseMaterialsFromTrees(trees, gameData.types);
  }

  const handlePlayTimer = useCallback(
    (build: BuildPlan) => {
      const total = computeTotalProductionTime(build);
      if (total <= 0) return;
      setTimerState((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          if (next[id]?.status === "running") {
            const s = next[id]!;
            const elapsed = s.pausedElapsedSeconds + (Date.now() - s.startedAt) / 1000;
            next[id] = { ...s, status: "paused", pausedElapsedSeconds: elapsed, startedAt: 0 };
          }
        }
        next[build.id] = {
          buildId: build.id,
          status: "running",
          startedAt: Date.now(),
          pausedElapsedSeconds: prev[build.id]?.pausedElapsedSeconds ?? 0,
        };
        saveTimerState(next);
        return next;
      });
    },
    [gameData]
  );

  const handlePauseTimer = useCallback((buildId: string) => {
    setTimerState((prev) => {
      const s = prev[buildId];
      if (!s || s.status !== "running") return prev;
      const elapsed = s.pausedElapsedSeconds + (Date.now() - s.startedAt) / 1000;
      const next = { ...prev, [buildId]: { ...s, status: "paused", pausedElapsedSeconds: elapsed, startedAt: 0 } };
      saveTimerState(next);
      return next;
    });
  }, []);

  const handleResetTimer = useCallback((buildId: string) => {
    setTimerState((prev) => {
      if (!prev[buildId]) return prev;
      const next = { ...prev };
      delete next[buildId];
      saveTimerState(next);
      return next;
    });
  }, []);

  const runningCount = useMemo(
    () => Object.values(timerState).filter((s) => s.status === "running").length,
    [timerState]
  );

  useEffect(() => {
    if (runningCount === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [runningCount]);

  useEffect(() => {
    if (runningCount === 0) return;
    setTimerState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const build of builds) {
        const s = next[build.id];
        if (!s || s.status !== "running") continue;
        const total = computeTotalProductionTime(build);
        if (total <= 0) continue;
        const elapsed = s.pausedElapsedSeconds + (Date.now() - s.startedAt) / 1000;
        if (elapsed >= total) {
          next[build.id] = { ...s, status: "finished", pausedElapsedSeconds: total, startedAt: 0 };
          changed = true;
        }
      }
      if (changed) saveTimerState(next);
      return changed ? next : prev;
    });
  }, [builds, runningCount, gameData, tick]);

  useEffect(() => {
    if (editingBuildId) editInputRef.current?.focus();
  }, [editingBuildId]);

  useEffect(() => {
    const api = window.efOverlay?.overlay?.setBuilderState;
    if (!api || !selectedBuild) return;
    const ts = timerState[selectedBuild.id];
    const totalTime = computeTotalProductionTime(selectedBuild);
    const totalOre = computeTotalOreVolume(selectedBuild);
    const logByType = miningMinedFromLog[selectedBuild.id] ?? {};
    const manualByType = miningMinedManual[selectedBuild.id] ?? {};
    const neededOverride = miningNeededOverride[selectedBuild.id] ?? {};
    const baseMaterials = computeBaseMaterials(selectedBuild);
    const types = gameData?.types ?? {};
    let mined = 0;
    let effectiveTotal = 0;
    const miningOres =
      baseMaterials.length > 0 && totalOre > 0
        ? baseMaterials.map((m) => {
            const computedNeeded = (types[String(m.typeID)]?.volume ?? 0) * m.quantity;
            const neededVol = neededOverride[m.typeID] ?? computedNeeded;
            effectiveTotal += neededVol;
            const fromLog = logByType[m.typeID] ?? 0;
            const manual = manualByType[m.typeID] ?? 0;
            const minedVol = Math.min(Math.max(fromLog, manual), neededVol);
            mined += minedVol;
            return { name: m.name, minedVol, neededVol };
          })
        : undefined;
    if (effectiveTotal <= 0) effectiveTotal = totalOre;
    mined = Math.min(mined, effectiveTotal > 0 ? effectiveTotal : Infinity);
    let productionLeftSeconds = 0;
    if (totalTime > 0 && ts && (ts.status === "running" || ts.status === "paused")) {
      const elapsed =
        ts.status === "running"
          ? ts.pausedElapsedSeconds + (Date.now() - ts.startedAt) / 1000
          : ts.pausedElapsedSeconds;
      productionLeftSeconds = Math.max(0, totalTime - elapsed);
    }
    api({
      buildName: selectedBuild.name || "Unnamed",
      mined: totalOre > 0 ? mined : undefined,
      totalOre: totalOre > 0 ? totalOre : undefined,
      productionLeftSeconds: productionLeftSeconds > 0 ? productionLeftSeconds : undefined,
      miningOres,
    });
  }, [selectedBuild, timerState, miningMinedFromLog, miningMinedManual, miningNeededOverride, tick, gameData]);

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      <aside className="w-[280px] shrink-0 flex flex-col border-r border-border bg-surface-light">
        <div className="overflow-y-auto py-2 max-h-[min(60vh,400px)]">
          {builds.map((b) => {
            const ts = timerState[b.id];
            const totalTime = computeTotalProductionTime(b);
            const showProdBar = totalTime > 0 && (ts?.status === "running" || ts?.status === "paused");
            const prodElapsed =
              ts?.status === "running"
                ? ts.pausedElapsedSeconds + (Date.now() - ts.startedAt) / 1000
                : ts?.status === "paused"
                  ? ts.pausedElapsedSeconds
                  : 0;
            const prodProgress = totalTime > 0 ? Math.min(1, prodElapsed / totalTime) : 0;
            const isFinished = ts?.status === "finished" || (totalTime > 0 && prodElapsed >= totalTime);
            const totalOre = computeTotalOreVolume(b);
            const logByType = miningMinedFromLog[b.id] ?? {};
            const manualByType = miningMinedManual[b.id] ?? {};
            const neededOverride = miningNeededOverride[b.id] ?? {};
            const baseMats = computeBaseMaterials(b);
            const types = gameData?.types ?? {};
            let mined = 0;
            let effectiveTotal = 0;
            for (const m of baseMats) {
              const computedNeeded = (types[String(m.typeID)]?.volume ?? 0) * m.quantity;
              const needed = neededOverride[m.typeID] ?? computedNeeded;
              effectiveTotal += needed;
              const fromLog = logByType[m.typeID] ?? 0;
              const manual = manualByType[m.typeID] ?? 0;
              mined += Math.min(Math.max(fromLog, manual), needed);
            }
            if (effectiveTotal <= 0) effectiveTotal = totalOre;
            mined = Math.min(mined, effectiveTotal > 0 ? effectiveTotal : Infinity);
            const oreProgress = totalOre > 0 ? mined / totalOre : 0;
            const showOreBar = totalOre > 0;

            return (
              <div
                key={b.id}
                className={`flex flex-col w-full ${
                  selectedBuild?.id === b.id
                    ? "bg-selection-bg text-selection-text font-semibold"
                    : "hover:bg-surface"
                }`}
              >
                <div className="flex items-center w-full cursor-pointer min-h-[40px]">
                  {isFinished && (
                    <span className="shrink-0 w-8 h-8 flex items-center justify-center pl-1 text-green-500" title="Build finished">
                      <CheckIcon />
                    </span>
                  )}
                  {editingBuildId === b.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      className="flex-1 min-w-0 py-1.5 px-3 mx-1 text-sm border border-border rounded bg-bg text-text"
                      defaultValue={b.name || "Unnamed"}
                      placeholder="Build name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleRenameBuild(b, (e.target as HTMLInputElement).value);
                        }
                        if (e.key === "Escape") setEditingBuildId(null);
                      }}
                      onBlur={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        if (v !== (b.name || "Unnamed")) handleRenameBuild(b, v);
                        else setEditingBuildId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex-1 block w-0 min-w-0 py-2 px-4 text-left border-0 rounded-none bg-transparent text-sm cursor-pointer text-inherit truncate"
                      onClick={() => handleSelectBuild(b)}
                      title={b.name || "Unnamed"}
                    >
                      {b.name || "Unnamed"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded bg-bg text-text opacity-80 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(b.id);
                    }}
                    title="Rename build"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-muted hover:text-destructive hover:bg-bg opacity-80 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBuild(b.id);
                    }}
                    title="Delete build"
                  >
                    <CloseIcon />
                  </button>
                </div>
                {(showOreBar || showProdBar) && (
                  <div className="px-4 pb-2 space-y-1.5">
                    {showOreBar && (
                      <div className="h-1.5 rounded-full bg-amber-500/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${oreProgress * 100}%` }}
                        />
                      </div>
                    )}
                    {showProdBar && (
                      <div className="h-1.5 rounded-full bg-amber-500/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all duration-300"
                          style={{ width: `${prodProgress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="m-2 shrink-0 px-3 py-1.5 rounded-md border border-border bg-surface text-text text-sm hover:bg-border"
          onClick={handleAddBuild}
        >
          Add build
        </button>
      </aside>
      <div className="flex-1 min-w-0 min-h-[200px] overflow-y-auto px-6 py-4">
        {gameDataError && (
          <div
            className="py-3 px-4 mb-4 rounded-md text-sm break-words bg-destructive/15 border border-destructive text-destructive-muted"
            role="alert"
          >
            {gameDataError}
          </div>
        )}
        {loading ? (
          <p className="text-muted py-4">Loading…</p>
        ) : !selectedBuild ? (
          <p className="text-muted py-4">Select a build or add one.</p>
        ) : (
          <BuildPage
            key={selectedBuild.id}
            plan={selectedBuild}
            gameData={gameData}
            onSave={handleSaveBuild}
            onDelete={handleDeleteBuild}
            timerState={timerState}
            onPlayTimer={handlePlayTimer}
            onPauseTimer={handlePauseTimer}
            onResetTimer={handleResetTimer}
            miningMinedFromLog={miningMinedFromLog}
            miningMinedManual={miningMinedManual}
            miningNeededOverride={miningNeededOverride}
            onMiningManualChange={handleMiningManualChange}
            onMiningNeededOverrideChange={handleMiningNeededOverrideChange}
            onMiningReset={handleMiningReset}
            miningErrors={miningErrors}
            onMiningStartTracking={handleMiningStartTracking}
            onMiningStopTracking={handleMiningStopTracking}
            computeTotalProductionTime={computeTotalProductionTime}
            computeTotalOreVolume={computeTotalOreVolume}
            computeBaseMaterials={computeBaseMaterials}
          />
        )}
      </div>
    </div>
  );
}

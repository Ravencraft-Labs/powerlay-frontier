import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { BuildPlan, ProductionStage, ProductionStageItem, ProductionTreeNode } from "@powerlay/core";
import {
  totalManufacturingTimeSeconds,
  buildProductionTree,
  getBaseMaterialsFromTrees,
  totalVolumeFromMaterials,
  buildProductionStages,
  plannedItemsStage,
  jobBatchSize,
  isStageComplete,
  oreMiningProgress,
  activeTrackingStage,
} from "@powerlay/core";
import type { BuilderOverlayAction, BuilderOverlayState, GameData } from "../preload";
import { formatProductionTime } from "../utils/format";
import { effectiveCraftStep } from "../utils/craftStep";
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const BUILDS_STORAGE_KEY = "powerlay-builds";
const TIMER_STORAGE_KEY = "powerlay-production-timer";
const MINING_MINED_KEY = "powerlay-mining-mined";
const MINING_MANUAL_KEY = "powerlay-mining-manual";
const MINING_NEEDED_OVERRIDE_KEY = "powerlay-mining-needed-override";
const SELECTED_BUILD_KEY = "powerlay-selected-build";
const CRAFTED_KEY = "powerlay-crafting-made";
const STAGE_PIN_KEY = "powerlay-tracking-stage";
/** typeID -> the user's own ±N step (same for every build: it is how much they make at once). */
const CRAFT_STEP_KEY = "powerlay-crafting-step";
/** "off" = keep the step that is shown instead of moving on when it is done (all builds). */
const AUTO_ADVANCE_KEY = "powerlay-steps-auto";

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

/** buildId -> typeID -> units made (crafting is not in any game log, so this is entered by hand). */
type CraftedByType = Record<string, Record<number, number>>;
/** buildId -> tracking step picked by the user (0 = mining, 1.. = crafting stages). */
type StagePinByBuild = Record<string, number>;

function loadJsonObject<T>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? (JSON.parse(raw) as unknown) : null;
    return (typeof data === "object" && data !== null ? data : {}) as T;
  } catch {
    return {} as T;
  }
}

function saveJsonObject(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
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
  const [craftedMade, setCraftedMade] = useState<CraftedByType>(() => loadJsonObject<CraftedByType>(CRAFTED_KEY));
  const [stagePins, setStagePins] = useState<StagePinByBuild>(() => loadJsonObject<StagePinByBuild>(STAGE_PIN_KEY));
  const [craftSteps, setCraftSteps] = useState<Record<number, number>>(() => loadJsonObject<Record<number, number>>(CRAFT_STEP_KEY));
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_ADVANCE_KEY) !== "off";
    } catch {
      return true;
    }
  });

  const handleAutoAdvanceChange = useCallback((on: boolean) => {
    setAutoAdvance(on);
    try {
      localStorage.setItem(AUTO_ADVANCE_KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, []);

  /** Set the user's ±N step for an item; null or ≤ 0 goes back to the default from game data. */
  const handleCraftStepChange = useCallback((typeID: number, size: number | null) => {
    setCraftSteps((prev) => {
      const next = { ...prev };
      if (size == null || !(size > 0)) delete next[typeID];
      else next[typeID] = Math.floor(size);
      saveJsonObject(CRAFT_STEP_KEY, next);
      return next;
    });
  }, []);
  const [miningErrors, setMiningErrors] = useState<{
    tailerTestError?: string;
    logReaderError?: string;
    trackingActive?: boolean;
    trackingBuildId?: string | null;
  }>({});
  const [tick, setTick] = useState(0);
  const [buildsWithOverlayOpen, setBuildsWithOverlayOpen] = useState<Set<string>>(new Set());
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

  const handleCraftedChange = useCallback((buildId: string, typeID: number, made: number) => {
    setCraftedMade((prev) => {
      const next = { ...prev, [buildId]: { ...(prev[buildId] ?? {}), [typeID]: Math.max(0, made) } };
      saveJsonObject(CRAFTED_KEY, next);
      return next;
    });
  }, []);

  const handleStagePin = useCallback((buildId: string, stage: number | null) => {
    setStagePins((prev) => {
      const next = { ...prev };
      if (stage == null) delete next[buildId];
      else next[buildId] = stage;
      saveJsonObject(STAGE_PIN_KEY, next);
      return next;
    });
  }, []);

  const handleCraftingReset = useCallback((buildId: string) => {
    setCraftedMade((prev) => {
      const next = { ...prev };
      delete next[buildId];
      saveJsonObject(CRAFTED_KEY, next);
      return next;
    });
    handleStagePin(buildId, null);
  }, [handleStagePin]);

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

  useEffect(() => {
    const api = window.efOverlay?.overlay?.getVisibleBuilderIds;
    if (!api) return;
    const poll = async () => {
      try {
        const ids = await api();
        setBuildsWithOverlayOpen((prev) => {
          const next = new Set(ids ?? []);
          if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 500);
    return () => clearInterval(id);
  }, []);

  const handleToggleOverlay = useCallback(async (buildId: string) => {
    await window.efOverlay?.overlay?.toggleBuilder?.(buildId);
    try {
      const ids = await window.efOverlay?.overlay?.getVisibleBuilderIds?.();
      setBuildsWithOverlayOpen(new Set(ids ?? []));
    } catch {
      /* ignore */
    }
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

  // Latest builds, updated synchronously by overlay edits so quick clicks before a re-render add up.
  const buildsRef = useRef(builds);
  buildsRef.current = builds;

  /** Free build, overlay "needed" mode: change how many of an item are planned (never below 1). */
  const handleNeededDelta = useCallback((buildId: string, typeID: number, delta: number) => {
    const build = buildsRef.current.find((b) => b.id === buildId);
    if (!build?.freeTracking) return;
    const idx = build.plannedItems.findIndex((p) => p.typeID === typeID);
    if (idx < 0) return;
    const total = build.plannedItems.reduce((sum, p) => sum + (p.typeID === typeID ? p.quantity : 0), 0);
    const change = Math.max(1, total + delta) - total;
    if (change === 0) return;
    const plannedItems = build.plannedItems.map((p, i) =>
      i === idx ? { ...p, quantity: Math.max(0, p.quantity + change) } : p
    );
    const updated: BuildPlan = { ...build, plannedItems, updatedAt: Date.now() };
    const list = buildsRef.current.map((b) => (b.id === buildId ? updated : b));
    buildsRef.current = list;
    setBuilds(list);
    setSelectedBuild((prev) => (prev?.id === buildId ? updated : prev));
    // Not awaited into state: a slower earlier save must not roll back a later click.
    void saveBuild(updated);
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
    window.efOverlay?.overlay?.hideBuilder?.(id);
    setBuildsWithOverlayOpen((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
    handleCraftingReset(id);
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

  const oreGroupIDsSet = useMemo(
    () =>
      gameData?.oreGroupIDs?.length
        ? new Set(gameData.oreGroupIDs)
        : null,
    [gameData?.oreGroupIDs]
  );

  function filterToOreMaterials<T extends { typeID: number }>(
    materials: T[],
    types: Record<string, { groupID?: number }>
  ): T[] {
    if (!oreGroupIDsSet) return materials;
    return materials.filter((m) => {
      const t = types[String(m.typeID)];
      const groupID = t?.groupID;
      return groupID != null && oreGroupIDsSet.has(groupID);
    });
  }

  /** Production trees for a saved build; empty until game data loads, while items lack typeIDs, or for a free build (no ore to mine). */
  function computeTrees(build: BuildPlan): ProductionTreeNode[] {
    if (!gameData?.types || !gameData?.blueprints || build.freeTracking) return [];
    const hasTypeIds = build.plannedItems.length > 0 && build.plannedItems.every((p) => p.typeID != null);
    if (!hasTypeIds) return [];
    const typeIdItems = build.plannedItems
      .filter((p): p is typeof p & { typeID: number } => p.typeID != null)
      .map((p) => ({ typeID: p.typeID, quantity: p.quantity, blueprintTypeID: p.blueprintTypeID }));
    return buildProductionTree(
      typeIdItems,
      gameData.blueprints,
      gameData.types,
      { overrides: build.intermediateBlueprintOverrides }
    );
  }

  /** Total volume (m³) of base materials (ore only) for mining progress. Matches cargo space. */
  function computeTotalOreVolume(build: BuildPlan): number {
    if (!gameData?.types) return 0;
    const oreList = computeBaseMaterials(build);
    const baseRecord = Object.fromEntries(oreList.map((m) => [m.typeID, m.quantity]));
    return totalVolumeFromMaterials(baseRecord, gameData.types);
  }

  function computeBaseMaterials(build: BuildPlan): Array<{ typeID: number; name: string; quantity: number }> {
    if (!gameData?.types) return [];
    const baseList = getBaseMaterialsFromTrees(computeTrees(build), gameData.types);
    return filterToOreMaterials(baseList, gameData.types);
  }

  /** Step shown in Tracking and the overlay: 0 = mining, i = crafting stage i. */
  function computeTrackingStep(build: BuildPlan): { stages: ProductionStage[]; completed: boolean[]; active: number } {
    if (!gameData?.types) return { stages: [], completed: [], active: 0 };
    const stages = build.freeTracking
      ? plannedItemsStage(build.plannedItems, gameData.types)
      : buildProductionStages(computeTrees(build), gameData.types);
    const made = craftedMade[build.id] ?? {};
    const ore = oreMiningProgress(
      computeBaseMaterials(build),
      gameData.types,
      miningMinedFromLog[build.id] ?? {},
      miningMinedManual[build.id] ?? {},
      miningNeededOverride[build.id] ?? {}
    );
    const completed = [ore.needed <= 0 || ore.mined >= ore.needed, ...stages.map((s) => isStageComplete(s, made))];
    return { stages, completed, active: activeTrackingStage(completed, stagePins[build.id]) };
  }

  /** Overlay ±N buttons: units one facility job makes for this item (build's facility, else the smallest). */
  function batchFields(build: BuildPlan, item: ProductionStageItem): { batch?: number; batchTitle?: string } {
    if (!gameData?.types || !gameData?.blueprints) return {};
    const def = jobBatchSize(
      item.typeID,
      item.blueprintTypeID,
      gameData.blueprints,
      gameData.types,
      gameData.blueprintFacilityRuns ?? {},
      build.facilities.map((f) => f.type)
    );
    const step = effectiveCraftStep(def, craftSteps[item.typeID]);
    return step ? { batch: step.size, batchTitle: step.title } : {};
  }

  // Done/undone ticks from a build overlay; same effect as the checkboxes in Tracking.
  const applyOverlayActionRef = useRef<(buildId: string, action: BuilderOverlayAction) => void>(() => {});
  applyOverlayActionRef.current = (buildId, action) => {
    const build = builds.find((b) => b.id === buildId);
    if (!build || !gameData?.types) return;
    if (action.kind === "pick-step") {
      handleStagePin(buildId, action.step);
    } else if (action.kind === "needed-add") {
      handleNeededDelta(buildId, action.typeID, action.delta);
    } else if (action.kind === "set-auto") {
      handleAutoAdvanceChange(action.on);
    } else if (action.kind === "ore-done") {
      const ore = computeBaseMaterials(build).find((m) => m.typeID === action.typeID);
      if (!ore) return;
      const needed =
        miningNeededOverride[buildId]?.[ore.typeID] ?? (gameData.types[String(ore.typeID)]?.volume ?? 0) * ore.quantity;
      handleMiningManualChange(buildId, ore.typeID, action.done ? needed : 0);
    } else {
      const item = computeTrackingStep(build).stages.flatMap((s) => s.items).find((i) => i.typeID === action.typeID);
      if (!item) return;
      if (action.kind !== "item-add") {
        handleCraftedChange(buildId, item.typeID, action.done ? item.quantity : 0);
      } else {
        // Functional update: several quick clicks can arrive before the next render.
        const { delta } = action;
        setCraftedMade((prev) => {
          const made = prev[buildId]?.[item.typeID] ?? 0;
          const value = Math.min(item.quantity, Math.max(0, made + delta));
          const next = { ...prev, [buildId]: { ...(prev[buildId] ?? {}), [item.typeID]: value } };
          saveJsonObject(CRAFTED_KEY, next);
          return next;
        });
      }
    }
  };
  useEffect(() => {
    const subscribe = window.efOverlay?.overlay?.onBuilderAction;
    if (!subscribe) return;
    return subscribe((buildId, action) => applyOverlayActionRef.current(buildId, action));
  }, []);

  // Auto-advance on: finishing the step the user picked moves on (drop the pin when it turns complete).
  // Auto-advance off: hold whatever step is shown (pin it, so finishing it doesn't move on).
  const pinnedWasCompleteRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    for (const build of builds) {
      const pin = stagePins[build.id];
      if (!autoAdvance) {
        if (pin == null) {
          const step = computeTrackingStep(build);
          if (step.stages.length > 0) handleStagePin(build.id, step.active);
        }
        delete pinnedWasCompleteRef.current[build.id];
        continue;
      }
      if (pin == null) {
        delete pinnedWasCompleteRef.current[build.id];
        continue;
      }
      const done = computeTrackingStep(build).completed[pin] ?? false;
      const was = pinnedWasCompleteRef.current[build.id];
      pinnedWasCompleteRef.current[build.id] = done;
      if (was === false && done) handleStagePin(build.id, null);
    }
  }, [builds, stagePins, autoAdvance, craftedMade, miningMinedFromLog, miningMinedManual, miningNeededOverride, gameData]);

  const handlePlayTimer = useCallback(
    (build: BuildPlan) => {
      const total = computeTotalProductionTime(build);
      if (total <= 0) return;
      setTimerState((prev) => {
        const next = { ...prev };
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
    if (!api || buildsWithOverlayOpen.size === 0) return;
    const types = gameData?.types ?? {};
    const states: Record<string, BuilderOverlayState> = {};
    for (const buildId of buildsWithOverlayOpen) {
      const build = builds.find((b) => b.id === buildId);
      if (!build) continue;
      const ts = timerState[build.id];
      const totalTime = computeTotalProductionTime(build);
      const totalOre = computeTotalOreVolume(build);
      const logByType = miningMinedFromLog[build.id] ?? {};
      const manualByType = miningMinedManual[build.id] ?? {};
      const neededOverride = miningNeededOverride[build.id] ?? {};
      const baseMaterials = computeBaseMaterials(build);
      let mined = 0;
      let effectiveTotal = 0;
      const plannedVolByTypeId: Record<number, number> = {};
      const miningOres =
        baseMaterials.length > 0 && totalOre > 0
          ? baseMaterials.map((m) => {
              const computedNeeded = (types[String(m.typeID)]?.volume ?? 0) * m.quantity;
              const neededVol = neededOverride[m.typeID] ?? computedNeeded;
              plannedVolByTypeId[m.typeID] = (plannedVolByTypeId[m.typeID] ?? 0) + neededVol;
              effectiveTotal += neededVol;
              const fromLog = logByType[m.typeID] ?? 0;
              const manual = manualByType[m.typeID] ?? 0;
              const minedVol = Math.min(Math.max(fromLog, manual), neededVol);
              mined += minedVol;
              return { typeID: m.typeID, name: m.name, minedVol, neededVol, asteroids: types[String(m.typeID)]?.oreAsteroids };
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
      const step = computeTrackingStep(build);
      const madeByType = craftedMade[build.id] ?? {};
      const activeStage = step.active > 0 ? step.stages[step.active - 1] : undefined;
      states[buildId] = {
        buildName: build.name || "Unnamed",
        mined: totalOre > 0 ? mined : undefined,
        totalOre: totalOre > 0 ? totalOre : undefined,
        productionLeftSeconds: productionLeftSeconds > 0 ? productionLeftSeconds : undefined,
        miningOres,
        plannedVolByTypeId: Object.keys(plannedVolByTypeId).length > 0 ? plannedVolByTypeId : undefined,
        stage: activeStage && {
          index: step.active,
          count: step.stages.length,
          items: activeStage.items.map((i) => ({
            typeID: i.typeID,
            name: i.name,
            made: Math.min(madeByType[i.typeID] ?? 0, i.quantity),
            needed: i.quantity,
            ...batchFields(build, i),
            // Ores tracked as items (free build): where to mine them.
            asteroids: types[String(i.typeID)]?.oreAsteroids,
          })),
        },
        steps:
          step.stages.length > 0
            ? {
                active: step.active,
                // A free build has no mining step.
                first: build.freeTracking ? 1 : 0,
                last: step.stages.length,
                auto: autoAdvance,
              }
            : undefined,
      };
    }
    api(states);
  }, [builds, buildsWithOverlayOpen, timerState, miningMinedFromLog, miningMinedManual, miningNeededOverride, craftedMade, stagePins, craftSteps, autoAdvance, tick, gameData]);

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
                  <span
                    className="shrink-0 w-8 h-8 flex items-center justify-center"
                    title={isFinished ? "Build finished" : undefined}
                  >
                    {isFinished ? <CheckIcon className="text-green-500" /> : null}
                  </span>
                  <button
                    type="button"
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded bg-bg text-text opacity-80 hover:opacity-100 ${buildsWithOverlayOpen.has(b.id) ? "text-amber-500" : "text-muted"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleOverlay(b.id);
                    }}
                    title={buildsWithOverlayOpen.has(b.id) ? "Hide overlay" : "Show overlay"}
                  >
                    {buildsWithOverlayOpen.has(b.id) ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
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
                    <TrashIcon />
                  </button>
                </div>
                {(showOreBar || showProdBar) && (
                  <div className="px-4 pb-2 space-y-1.5">
                    {showProdBar && (
                      <p className="text-xs text-muted m-0">
                        {isFinished
                          ? "Done"
                          : formatProductionTime(Math.max(0, totalTime - prodElapsed)) + " left"}
                      </p>
                    )}
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
            overlayVisible={buildsWithOverlayOpen.has(selectedBuild.id)}
            onToggleOverlay={() => handleToggleOverlay(selectedBuild.id)}
            craftedMade={craftedMade}
            stagePins={stagePins}
            onCraftedChange={handleCraftedChange}
            onStagePin={handleStagePin}
            onCraftingReset={handleCraftingReset}
            craftSteps={craftSteps}
            onCraftStepChange={handleCraftStepChange}
            autoAdvance={autoAdvance}
            onAutoAdvanceChange={handleAutoAdvanceChange}
          />
        )}
      </div>
    </div>
  );
}

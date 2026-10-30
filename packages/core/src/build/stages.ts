import type { BlueprintsMap, TypesMap } from "./types.js";
import { getOptimizedBlueprintForProduct } from "./gameData.js";
import type { ProductionTreeNode } from "./gameData.js";

export interface ProductionStageItem {
  typeID: number;
  name: string;
  /** Units to make across the whole build. */
  quantity: number;
  /** Blueprint the build uses for it (first one met in the tree, or the planned item's pick). */
  blueprintTypeID?: number;
}

/** One crafting step: everything whose inputs are all ready once the previous steps are done. */
export interface ProductionStage {
  /** Height in the production tree: 1 = made directly from base materials. */
  level: number;
  items: ProductionStageItem[];
}

/**
 * Crafting stages above the base materials, in build order. An item's level is 1 + the highest
 * level among its inputs (base materials are 0), so a stage only needs what earlier stages made.
 * Quantities are summed per type over the whole tree; a type reached at different depths (via
 * per-path recipe overrides) sits at its highest level.
 */
export function buildProductionStages(trees: ProductionTreeNode[], types: TypesMap): ProductionStage[] {
  const levelByType = new Map<number, number>();
  const qtyByType = new Map<number, number>();
  const bpByType = new Map<number, number>();

  function walk(node: ProductionTreeNode): number {
    if (node.children.length === 0) return 0;
    const level = 1 + Math.max(...node.children.map(walk));
    levelByType.set(node.typeID, Math.max(levelByType.get(node.typeID) ?? 0, level));
    qtyByType.set(node.typeID, (qtyByType.get(node.typeID) ?? 0) + node.quantity);
    if (node.blueprintTypeID != null && !bpByType.has(node.typeID)) bpByType.set(node.typeID, node.blueprintTypeID);
    return level;
  }
  trees.forEach(walk);

  const byLevel = new Map<number, ProductionStageItem[]>();
  for (const [typeID, level] of levelByType) {
    const list = byLevel.get(level) ?? [];
    const blueprintTypeID = bpByType.get(typeID);
    list.push({
      typeID,
      name: types[String(typeID)]?.name ?? String(typeID),
      quantity: Math.round(qtyByType.get(typeID) ?? 0),
      ...(blueprintTypeID != null && { blueprintTypeID }),
    });
    byLevel.set(level, list);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, items]) => ({ level, items: items.sort((a, b) => a.name.localeCompare(b.name, "en")) }));
}

/** Free build: the planned items themselves as the only stage (quantities summed per type). */
export function plannedItemsStage(
  plannedItems: Array<{ typeID?: number; quantity: number; blueprintTypeID?: number }>,
  types: TypesMap
): ProductionStage[] {
  const qtyByType = new Map<number, number>();
  const bpByType = new Map<number, number>();
  for (const p of plannedItems) {
    if (p.typeID == null || p.quantity <= 0) continue;
    qtyByType.set(p.typeID, (qtyByType.get(p.typeID) ?? 0) + p.quantity);
    if (p.blueprintTypeID != null && !bpByType.has(p.typeID)) bpByType.set(p.typeID, p.blueprintTypeID);
  }
  if (qtyByType.size === 0) return [];
  const items = [...qtyByType].map(([typeID, quantity]) => {
    const blueprintTypeID = bpByType.get(typeID);
    return {
      typeID,
      name: types[String(typeID)]?.name ?? String(typeID),
      quantity,
      ...(blueprintTypeID != null && { blueprintTypeID }),
    };
  });
  return [{ level: 1, items }];
}

/** How many runs of a blueprint one job in a facility allows (industry_facilities maxOutputRuns). */
export interface FacilityRuns {
  facility: string;
  outputRuns: number;
}

/**
 * Default step for an item's ±N buttons, from the blueprint the build uses (else the optimized one):
 * - a run that makes several units (refining, e.g. 193 Tholin) -> one run;
 * - a run that makes one unit (printers) -> one full job, i.e. the facility's max output runs (e.g. 5).
 * A full refining job (e.g. 200 runs × 193) is far more than anyone tracks at once, hence the split.
 * The facility is one listed in the build, else the one with the smallest job. Null when no
 * facility runs the blueprint.
 */
export function jobBatchSize(
  typeID: number,
  blueprintTypeID: number | undefined,
  blueprints: BlueprintsMap,
  types: TypesMap,
  facilityRunsByBlueprint: Record<number, FacilityRuns[]>,
  buildFacilityTypes: string[]
): { size: number; facility: string; unit: "run" | "job" } | null {
  const bp =
    (blueprintTypeID != null ? blueprints[String(blueprintTypeID)] : undefined) ??
    getOptimizedBlueprintForProduct(typeID, blueprints, types);
  const perRun = bp?.activities?.manufacturing?.products?.find((p) => p.typeID === typeID)?.quantity ?? 0;
  const runs = bp ? facilityRunsByBlueprint[bp.blueprintTypeID] ?? [] : [];
  if (perRun <= 0 || runs.length === 0) return null;
  const owned = new Set(buildFacilityTypes.map((t) => t.toLowerCase()));
  const pick =
    runs.find((r) => owned.has(r.facility.toLowerCase())) ??
    runs.reduce((a, b) => (b.outputRuns < a.outputRuns ? b : a));
  if (perRun > 1) return { size: perRun, facility: pick.facility, unit: "run" };
  return pick.outputRuns > 0 ? { size: pick.outputRuns, facility: pick.facility, unit: "job" } : null;
}

/** True when every item in the stage has made >= quantity. */
export function isStageComplete(stage: ProductionStage, made: Record<number, number>): boolean {
  return stage.items.every((i) => (made[i.typeID] ?? 0) >= i.quantity);
}

/**
 * Ore mining progress in m³, as shown in Tracking: per ore min(max(log, manual), needed),
 * where needed is the override or volume × quantity.
 */
export function oreMiningProgress(
  ores: Array<{ typeID: number; quantity: number }>,
  types: TypesMap,
  minedFromLog: Record<number, number>,
  manualMined: Record<number, number>,
  neededOverride: Record<number, number>
): { mined: number; needed: number } {
  let mined = 0;
  let needed = 0;
  for (const o of ores) {
    const n = neededOverride[o.typeID] ?? (types[String(o.typeID)]?.volume ?? 0) * o.quantity;
    needed += n;
    mined += Math.min(Math.max(minedFromLog[o.typeID] ?? 0, manualMined[o.typeID] ?? 0), n);
  }
  return { mined, needed };
}

/**
 * Which tracking step to show, given completion of [mining, ...stages]: the pinned one (picked by
 * the user) if valid, else the first incomplete, else the last. Callers drop the pin when the pinned
 * step gets completed, so finishing a step moves on to the next.
 */
export function activeTrackingStage(completed: boolean[], pinned: number | null | undefined): number {
  if (completed.length === 0) return 0;
  if (pinned != null && pinned >= 0 && pinned < completed.length) return pinned;
  const firstOpen = completed.findIndex((c) => !c);
  return firstOpen >= 0 ? firstOpen : completed.length - 1;
}

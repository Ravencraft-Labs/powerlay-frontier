import type { TypesMap } from "./types.js";
import type { ProductionTreeNode } from "./gameData.js";

export interface ProductionStageItem {
  typeID: number;
  name: string;
  /** Units to make across the whole build. */
  quantity: number;
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

  function walk(node: ProductionTreeNode): number {
    if (node.children.length === 0) return 0;
    const level = 1 + Math.max(...node.children.map(walk));
    levelByType.set(node.typeID, Math.max(levelByType.get(node.typeID) ?? 0, level));
    qtyByType.set(node.typeID, (qtyByType.get(node.typeID) ?? 0) + node.quantity);
    return level;
  }
  trees.forEach(walk);

  const byLevel = new Map<number, ProductionStageItem[]>();
  for (const [typeID, level] of levelByType) {
    const list = byLevel.get(level) ?? [];
    list.push({
      typeID,
      name: types[String(typeID)]?.name ?? String(typeID),
      quantity: Math.round(qtyByType.get(typeID) ?? 0),
    });
    byLevel.set(level, list);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, items]) => ({ level, items: items.sort((a, b) => a.name.localeCompare(b.name, "en")) }));
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

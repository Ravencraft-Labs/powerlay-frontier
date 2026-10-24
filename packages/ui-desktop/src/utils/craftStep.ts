/** Default ±N step from game data (jobBatchSize). */
export interface DefaultStep {
  size: number;
  facility: string;
  unit: "run" | "job";
}

/** Step the ±N buttons use: the user's own value for the item if set, else the data default. */
export interface CraftStep {
  size: number;
  /** What N is, for tooltips (e.g. "One Refinery run"). */
  title: string;
}

export function effectiveCraftStep(def: DefaultStep | null, custom: number | undefined): CraftStep | null {
  if (custom != null && custom > 0) return { size: custom, title: "Your step for this item" };
  if (!def || def.size <= 1) return null;
  return { size: def.size, title: `One ${def.facility} ${def.unit}` };
}

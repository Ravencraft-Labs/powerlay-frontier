import type { BuildPlan, Facility, PlannedItem, Laser } from "./types.js";

export function validateBuildPlan(plan: unknown): plan is BuildPlan {
  if (plan == null || typeof plan !== "object") return false;
  const p = plan as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.name !== "string") return false;
  if (typeof p.updatedAt !== "number") return false;
  if (!Array.isArray(p.facilities) || !p.facilities.every(validateFacility)) return false;
  if (!Array.isArray(p.plannedItems) || !p.plannedItems.every(validatePlannedItem)) return false;
  if (!Array.isArray(p.lasers) || !p.lasers.every(validateLaser)) return false;
  if (p.starSystemId !== undefined && typeof p.starSystemId !== "string") return false;
  if (p.intermediateBlueprintOverrides !== undefined && !validateIntermediateBlueprintOverrides(p.intermediateBlueprintOverrides)) return false;
  return true;
}

function validateIntermediateBlueprintOverrides(o: unknown): o is Record<string, number> {
  if (o == null || typeof o !== "object") return false;
  const obj = o as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (typeof k !== "string" || typeof obj[k] !== "number") return false;
  }
  return true;
}

function validateFacility(f: unknown): f is Facility {
  if (f == null || typeof f !== "object") return false;
  const x = f as Record<string, unknown>;
  return (
    typeof x.type === "string" &&
    x.type.trim().length > 0 &&
    typeof x.count === "number" &&
    x.count >= 0
  );
}

function validatePlannedItem(p: unknown): p is PlannedItem {
  if (p == null || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  const hasId = typeof x.typeID === "number" || typeof x.itemId === "string";
  if (!hasId || typeof x.quantity !== "number" || x.quantity < 0) return false;
  if (x.blueprintTypeID !== undefined && typeof x.blueprintTypeID !== "number") return false;
  return true;
}

function validateLaser(l: unknown): l is Laser {
  if (l == null || typeof l !== "object") return false;
  const x = l as Record<string, unknown>;
  return (
    (x.type === "Small Cutting Laser" || x.type === "Medium Cutting Laser") &&
    typeof x.amount === "number" &&
    x.amount >= 0
  );
}

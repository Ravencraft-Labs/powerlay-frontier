import { app } from "electron";
import fs from "fs";
import path from "path";
import { validateBuildPlan } from "@powerlay/core";
import type { BuildPlan } from "@powerlay/core";

const FILENAME = "builds.json";

function getDataPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILENAME);
}

function loadBuilds(): BuildPlan[] {
  const filePath = getDataPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((b): b is BuildPlan => validateBuildPlan(b));
  } catch {
    return [];
  }
}

function saveBuilds(builds: BuildPlan[]): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(builds, null, 2), "utf-8");
}

export function getBuildStore() {
  return {
    list(): BuildPlan[] {
      return loadBuilds();
    },
    get(id: string): BuildPlan | null {
      return loadBuilds().find((b) => b.id === id) ?? null;
    },
    save(plan: BuildPlan): BuildPlan {
      if (!validateBuildPlan(plan)) {
        throw new Error("Invalid build plan");
      }
      const builds = loadBuilds();
      const idx = builds.findIndex((b) => b.id === plan.id);
      const toSave = { ...plan, updatedAt: Date.now() };
      if (idx >= 0) builds[idx] = toSave;
      else builds.push(toSave);
      saveBuilds(builds);
      return toSave;
    },
    delete(id: string): boolean {
      const builds = loadBuilds();
      const before = builds.length;
      const next = builds.filter((b) => b.id !== id);
      if (next.length === before) return false;
      saveBuilds(next);
      return true;
    },
  };
}

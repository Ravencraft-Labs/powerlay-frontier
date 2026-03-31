import { app } from "electron";
import fs from "fs";
import path from "path";
import { validateScoutEntry, createScoutEntry, updateScoutEntry } from "@powerlay/core";
import type { ScoutEntry, CreateScoutEntryInput, UpdateScoutEntryInput } from "@powerlay/core";

const FILENAME = "scout-entries.json";

function getDataPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILENAME);
}

function loadEntries(): ScoutEntry[] {
  const filePath = getDataPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is ScoutEntry => validateScoutEntry(e));
  } catch {
    return [];
  }
}

function saveEntries(entries: ScoutEntry[]): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(entries, null, 2), "utf-8");
}

function generateId(): string {
  return `scout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getScoutStore() {
  return {
    list(): ScoutEntry[] {
      return loadEntries();
    },
    get(id: string): ScoutEntry | null {
      return loadEntries().find((e) => e.id === id) ?? null;
    },
    create(input: CreateScoutEntryInput): ScoutEntry {
      const entries = loadEntries();
      const entry = createScoutEntry(input, generateId());
      entries.push(entry);
      saveEntries(entries);
      return entry;
    },
    update(id: string, patch: UpdateScoutEntryInput): ScoutEntry | null {
      const entries = loadEntries();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx < 0) return null;
      const updated = updateScoutEntry(entries[idx], patch);
      entries[idx] = updated;
      saveEntries(entries);
      return updated;
    },
    delete(id: string): boolean {
      const entries = loadEntries();
      const before = entries.length;
      const next = entries.filter((e) => e.id !== id);
      if (next.length === before) return false;
      saveEntries(next);
      return true;
    },
  };
}

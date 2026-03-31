/**
 * Remembers draft contract IDs per X-User-Id because GET /contracts?status=draft
 * (search) may return no rows while drafts still exist (discovery vs owner scope).
 */
import { app } from "electron";
import fs from "fs";
import path from "path";

const INDEX_FILE = "contracts-draft-index.json";
const MAX_IDS_PER_USER = 200;

interface IndexFile {
  version: 1;
  byUserId: Record<string, string[]>;
}

function userKey(userId: string): string {
  return userId.trim().toLowerCase();
}

function indexPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, INDEX_FILE);
}

function load(): IndexFile {
  try {
    const p = indexPath();
    if (!fs.existsSync(p)) return { version: 1, byUserId: {} };
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Partial<IndexFile>;
    if (data?.version !== 1 || typeof data.byUserId !== "object" || data.byUserId === null) {
      return { version: 1, byUserId: {} };
    }
    return { version: 1, byUserId: { ...data.byUserId } };
  } catch {
    return { version: 1, byUserId: {} };
  }
}

function save(data: IndexFile): void {
  try {
    fs.writeFileSync(indexPath(), JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[contracts] failed to save draft index", err);
  }
}

export function getRememberedDraftIds(userId: string): string[] {
  const k = userKey(userId);
  return load().byUserId[k] ?? [];
}

export function rememberContractDraft(userId: string, contractId: string): void {
  const k = userKey(userId);
  const id = contractId.trim();
  if (!id) return;
  const data = load();
  const cur = data.byUserId[k] ?? [];
  if (cur.includes(id)) return;
  const next = [id, ...cur.filter((x) => x !== id)].slice(0, MAX_IDS_PER_USER);
  data.byUserId[k] = next;
  save(data);
}

export function forgetContractDraft(userId: string, contractId: string): void {
  const k = userKey(userId);
  const id = contractId.trim();
  if (!id) return;
  const data = load();
  const cur = data.byUserId[k];
  if (!cur?.length) return;
  const next = cur.filter((x) => x !== id);
  if (next.length === cur.length) return;
  if (next.length === 0) {
    delete data.byUserId[k];
  } else {
    data.byUserId[k] = next;
  }
  save(data);
}

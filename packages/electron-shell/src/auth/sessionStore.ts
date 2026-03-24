/**
 * Session persistence for wallet auth.
 * Stores wallet address and optional metadata in userData/Powerlay/session.json.
 * Same pattern as settingsStore - JSON file, load/save/clear.
 */
import { app } from "electron";
import fs from "fs";
import path from "path";

const SESSION_FILE = "session.json";

function getSessionPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, SESSION_FILE);
}

export interface AppSession {
  walletAddress: string;
  sessionId?: string;
  /** Unix timestamp; optional for MVP. Future: check on startup. */
  expiresAt?: number;
  /** Tribe from chain/dev override for X-Tribe-Id. */
  tribeId?: string;
  tribeName?: string;
  tribeResolvedAt?: number;
}

export function loadSession(): AppSession | null {
  try {
    const p = getSessionPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as Partial<AppSession>;
    if (!data?.walletAddress || typeof data.walletAddress !== "string") return null;
    return {
      walletAddress: data.walletAddress,
      sessionId: data.sessionId,
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : undefined,
      tribeId: typeof data.tribeId === "string" ? data.tribeId : undefined,
      tribeName: typeof data.tribeName === "string" ? data.tribeName : undefined,
      tribeResolvedAt: typeof data.tribeResolvedAt === "number" ? data.tribeResolvedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: AppSession): void {
  try {
    const p = getSessionPath();
    fs.writeFileSync(p, JSON.stringify(session, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save session:", err);
  }
}

export function clearSession(): void {
  try {
    const p = getSessionPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.error("Failed to clear session:", err);
  }
}

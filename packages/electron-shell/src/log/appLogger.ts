import { app } from "electron";
import fs from "fs";
import path from "path";

const LOG_DIR = "Powerlay";
const LOG_FILE = "powerlay.log";

/** Max lines before trimming old entries. Single-file approach for user clarity. */
const MAX_LOG_LINES = 2000;
/** Lines to keep when trimming (leaves headroom to avoid immediate re-trim). */
const KEEP_LINES = 1500;

let logDir: string | null = null;
let logPath: string | null = null;

function ensureLogDir(): string {
  if (logDir) return logDir;
  const userData = app.getPath("userData");
  logDir = path.join(userData, LOG_DIR, "logs");
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    logDir = userData;
  }
  return logDir;
}

function getLogPath(): string {
  if (logPath) return logPath;
  logPath = path.join(ensureLogDir(), LOG_FILE);
  return logPath;
}

export function getAppLogDir(): string {
  return ensureLogDir();
}

function trimIfNeeded(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < MAX_LOG_LINES) return;
    const kept = lines.slice(-KEEP_LINES).join("\n") + (KEEP_LINES > 0 ? "\n" : "");
    fs.writeFileSync(filePath, kept, "utf-8");
  } catch {
    /* ignore trim failures */
  }
}

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, data?: unknown): void {
  try {
    const dir = ensureLogDir();
    const file = path.join(dir, LOG_FILE);
    trimIfNeeded(file);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data != null && data !== undefined ? { data } : {}),
    };
    fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8");
    if (!app.isPackaged) {
      const tag = `[app:${level}]`;
      if (data != null) {
        console.log(tag, message, data);
      } else {
        console.log(tag, message);
      }
    }
  } catch {
    // Silently fail - avoid crashing on log write errors
  }
}

export const appLog = {
  info: (message: string, data?: unknown) => write("info", message, data),
  warn: (message: string, data?: unknown) => write("warn", message, data),
  error: (message: string, data?: unknown) => write("error", message, data),
};

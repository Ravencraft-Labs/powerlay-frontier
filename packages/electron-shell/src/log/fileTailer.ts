import fs from "fs";
import path from "path";
import { appLog } from "./appLogger.js";

type Encoding = "utf8" | "utf16le";

interface TailerState {
  path: string | null;
  offset: number;
  pendingLine: string;
  encoding: Encoding;
  trailingByte: number | null;
}

const BOM_UTF16LE = Buffer.from([0xff, 0xfe]);
const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf]);

function detectEncoding(buf: Buffer): { encoding: Encoding; skip: number } {
  if (buf.length >= 2 && buf[0] === BOM_UTF16LE[0] && buf[1] === BOM_UTF16LE[1]) {
    return { encoding: "utf16le", skip: 2 };
  }
  if (buf.length >= 3 && buf[0] === BOM_UTF8[0] && buf[1] === BOM_UTF8[1] && buf[2] === BOM_UTF8[2]) {
    return { encoding: "utf8", skip: 3 };
  }
  return { encoding: "utf8", skip: 0 };
}

type DirCheckResult =
  | { ok: true; path: string }
  | { ok: false; reason: "missing"; resolvedPath: string }
  | { ok: false; reason: "not_directory"; resolvedPath: string }
  | { ok: false; reason: "no_txt_files"; resolvedPath: string; fileCount: number };

export function checkLogDir(dir: string): DirCheckResult {
  const resolved = path.resolve(dir);
  try {
    if (!fs.existsSync(resolved)) {
      return { ok: false, reason: "missing", resolvedPath: resolved };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, reason: "not_directory", resolvedPath: resolved };
    }
    const files = fs.readdirSync(resolved);
    const txtFiles = files.filter((f) => f.toLowerCase().endsWith(".txt"));
    let newest: { path: string; mtime: number } | null = null;
    for (const f of txtFiles) {
      const fp = path.join(resolved, f);
      try {
        const s = fs.statSync(fp);
        if (!s.isFile()) continue;
        if (!newest || s.mtimeMs > newest.mtime) {
          newest = { path: fp, mtime: s.mtimeMs };
        }
      } catch {
        continue;
      }
    }
    if (!newest) {
      return { ok: false, reason: "no_txt_files", resolvedPath: resolved, fileCount: files.length };
    }
    return { ok: true, path: newest.path };
  } catch (err) {
    return { ok: false, reason: "missing", resolvedPath: resolved };
  }
}

export function expandPath(p: string): string {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return p
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%HOME%/gi, home)
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"))
    .replace(/%APPDATA%/gi, process.env.APPDATA || path.join(home, "AppData", "Roaming"));
}

export interface FileTailerOptions {
  logDir: string;
  pollIntervalMs?: number;
  onLine: (line: string) => void;
  /** Called with error message when log dir is broken/empty; called with null to clear. */
  onError?: (err: string | null) => void;
}

export function createFileTailer(options: FileTailerOptions): { start: () => void; stop: () => void } {
  const { logDir: rawLogDir, pollIntervalMs = 1000, onLine, onError } = options;
  const logDir = expandPath(rawLogDir);

  const state: TailerState = {
    path: null,
    offset: 0,
    pendingLine: "",
    encoding: "utf8",
    trailingByte: null,
  };

  let intervalId: ReturnType<typeof setInterval> | null = null;

  function reset(newPath: string | null): void {
    state.path = newPath;
    state.offset = 0;
    state.pendingLine = "";
    state.encoding = "utf8";
    state.trailingByte = null;
  }

  function poll(): void {
    const check = checkLogDir(logDir);

    if (!check.ok) {
      const msg =
        check.reason === "missing"
          ? `Log directory not found: ${check.resolvedPath}`
          : check.reason === "not_directory"
            ? `Log path is not a directory: ${check.resolvedPath}`
            : `No .txt files in log directory (${check.fileCount} other files): ${check.resolvedPath}`;
      appLog.warn("fileTailer: cannot read logs", {
        reason: check.reason,
        resolvedPath: check.resolvedPath,
        ...(check.reason === "no_txt_files" && { fileCount: check.fileCount }),
      });
      onError?.(msg);
      if (state.path) reset(null);
      return;
    }

    const currentPath = check.path;

    if (state.path !== currentPath) {
      appLog.info("fileTailer: file rotation", { from: state.path, to: currentPath });
      reset(currentPath);
    }

    state.path = currentPath;
    onError?.(null);

    let fd: number | null = null;
    try {
      fd = fs.openSync(currentPath, "r");
      const stat = fs.statSync(currentPath);
      const fileSize = stat.size;

      if (fileSize < state.offset) {
        appLog.info("fileTailer: truncation detected", { path: currentPath });
        state.offset = 0;
        state.pendingLine = "";
      }

      if (fileSize === state.offset) {
        return;
      }

      const chunkSize = Math.min(64 * 1024, fileSize - state.offset);
      const buf = Buffer.alloc(chunkSize);
      const bytesRead = fs.readSync(fd, buf, 0, chunkSize, state.offset);
      state.offset += bytesRead;

      let text: string;
      if (state.offset === bytesRead && state.pendingLine === "" && state.trailingByte === null) {
        const { encoding, skip } = detectEncoding(buf);
        state.encoding = encoding;
        const slice = buf.subarray(skip);
        text = slice.toString(encoding as BufferEncoding);
      } else {
        let toDecode = buf;
        if (state.trailingByte !== null) {
          toDecode = Buffer.concat([Buffer.from([state.trailingByte]), buf]);
          state.trailingByte = null;
        }
        if (state.encoding === "utf16le" && toDecode.length % 2 !== 0) {
          state.trailingByte = toDecode[toDecode.length - 1];
          toDecode = toDecode.subarray(0, -1);
        }
        text = toDecode.toString(state.encoding as BufferEncoding);
      }

      const combined = state.pendingLine + text;
      const lines = combined.split(/\r?\n/);
      state.pendingLine = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) onLine(line);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appLog.warn("fileTailer: read error", { path: currentPath, error: msg });
      onError?.(msg);
    } finally {
      if (fd != null) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function start(): void {
    if (intervalId) return;
    intervalId = setInterval(poll, pollIntervalMs);
    poll();
  }

  function stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    reset(null);
  }

  return { start, stop };
}

// Dev only: mirrors every client LogLite message to TSV files for offline digging (same format as
// scripts/loglite/listen.mjs). Enabled by POWERLAY_LOGLITE_MIRROR: "1" writes to <repo>/data/loglite/live,
// any other value is the target directory. Rotates client.tsv → client.1.tsv … so the set stays under 1 GB.
import fs from "fs";
import path from "path";
import type { LogLiteMessage } from "@powerlay/core";
import { getDataRoot } from "../ipc/gameDataLoader.js";
import { appLog } from "./appLogger.js";

const FILE_LIMIT = 256 * 1024 * 1024;
/** Current file plus rotated ones: 4 × 256 MB = 1 GB. */
const FILE_COUNT = 4;

let dir: string | null = null;
let stream: fs.WriteStream | null = null;
let size = 0;

function mirrorDir(): string | null {
  const v = process.env.POWERLAY_LOGLITE_MIRROR?.trim();
  if (!v || v === "0") return null;
  return v === "1" ? path.join(getDataRoot(), "data", "loglite", "live") : path.resolve(v);
}

function filePath(i: number): string {
  return path.join(dir!, i === 0 ? "client.tsv" : `client.${i}.tsv`);
}

function open(): void {
  const p = filePath(0);
  size = fs.existsSync(p) ? fs.statSync(p).size : 0;
  stream = fs.createWriteStream(p, { flags: "a" });
}

function rotate(): void {
  stream?.end();
  for (let i = FILE_COUNT - 1; i > 0; i--) {
    const from = filePath(i - 1);
    if (fs.existsSync(from)) fs.renameSync(from, filePath(i));
  }
  open();
}

export function isLogLiteMirrorOn(): boolean {
  return mirrorDir() != null;
}

function write(line: string): void {
  if (!dir) {
    dir = mirrorDir();
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    open();
    appLog.info("logLite: mirroring client log", { dir });
  }
  if (size >= FILE_LIMIT) rotate();
  const buf = Buffer.from(line, "utf8");
  size += buf.length;
  stream!.write(buf);
}

const oneLine = (s: string) => s.replace(/\r?\n/g, "\\n").replace(/\t/g, " ");

export function mirrorLogLiteMessage(msg: LogLiteMessage): void {
  if (!isLogLiteMirrorOn()) return;
  write(`${msg.time.toISOString()}\t${msg.severity}\t${oneLine(msg.module)}\t${oneLine(msg.channel)}\t${oneLine(msg.message)}\n`);
}

/** Connection markers, so sessions are easy to find in the file. */
export function mirrorLogLiteNote(text: string): void {
  if (!isLogLiteMirrorOn()) return;
  write(`${new Date().toISOString()}\tNOTE\tpowerlay\t\t${oneLine(text)}\n`);
}

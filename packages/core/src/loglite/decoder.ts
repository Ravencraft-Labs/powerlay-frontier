// Decoder for the stream the EVE Frontier client sends to LogLite (TCP 3273).
// Wire format from https://github.com/ccpgames/EveLogLite src/logmodel.cpp: fixed-size frames,
// little-endian, C structs with natural alignment (union starts at offset 8).
import type { LogLiteConnection, LogLiteMessage, LogLiteSeverity } from "./types.js";

export const LOGLITE_PORT = 3273;
export const LOGLITE_FRAME_SIZE = 344;

const enum FrameType {
  Connection = 0,
  Simple = 1,
  Large = 2,
  Continuation = 3,
  ContinuationEnd = 4,
}

const SEVERITIES: LogLiteSeverity[] = ["INFO", "NOTICE", "WARN", "ERR"];
const U = 8; // union offset

const utf8 = new TextDecoder("utf-8");

/** Bytes up to the first NUL (or the whole field). */
function cbytes(frame: Uint8Array, off: number, len: number): Uint8Array {
  const field = frame.subarray(off, off + len);
  const z = field.indexOf(0);
  return z < 0 ? field : field.subarray(0, z);
}

const cstr = (frame: Uint8Array, off: number, len: number) => utf8.decode(cbytes(frame, off, len));

export interface LogLiteDecoder {
  /** Feed raw socket bytes; returns the messages completed by them. */
  push(chunk: Uint8Array): LogLiteMessage[];
  readonly connection: LogLiteConnection | null;
}

/** One decoder per client connection. */
export function createLogLiteDecoder(): LogLiteDecoder {
  let pending = new Uint8Array(0);
  let connection: LogLiteConnection | null = null;
  let head: Omit<LogLiteMessage, "message"> | null = null;
  let parts: Uint8Array[] = [];

  function onFrame(f: Uint8Array): LogLiteMessage | null {
    const v = new DataView(f.buffer, f.byteOffset, f.byteLength);
    const type = v.getUint32(0, true);
    if (type === FrameType.Connection) {
      connection = {
        version: v.getUint32(U, true),
        pid: Number(v.getBigUint64(U + 8, true)),
        machineName: cstr(f, U + 16, 32),
        executablePath: cstr(f, U + 48, 260),
      };
      return null;
    }
    if (!connection) return null;

    if (!head) {
      const ts = Number(v.getBigUint64(U, true));
      head = {
        time: new Date(connection.version === 1 ? ts * 1000 : ts),
        severity: SEVERITIES[v.getUint32(U + 8, true)] ?? "INFO",
        module: cstr(f, U + 12, 32),
        channel: cstr(f, U + 44, 32),
      };
    }
    // Join raw bytes before decoding: a multi-byte char may straddle two frames.
    parts.push(cbytes(f, U + 76, 256).slice());
    if (type !== FrameType.Simple && type !== FrameType.ContinuationEnd) return null;

    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
      bytes.set(p, off);
      off += p.length;
    }
    const msg = { ...head, message: utf8.decode(bytes) };
    head = null;
    parts = [];
    return msg;
  }

  return {
    get connection() {
      return connection;
    },
    push(chunk) {
      const buf = new Uint8Array(pending.length + chunk.length);
      buf.set(pending);
      buf.set(chunk, pending.length);
      const out: LogLiteMessage[] = [];
      let off = 0;
      for (; off + LOGLITE_FRAME_SIZE <= buf.length; off += LOGLITE_FRAME_SIZE) {
        const msg = onFrame(buf.subarray(off, off + LOGLITE_FRAME_SIZE));
        if (msg) out.push(msg);
      }
      pending = buf.slice(off);
      return out;
    },
  };
}

import { describe, expect, it } from "vitest";
import { createLogLiteDecoder, LOGLITE_FRAME_SIZE } from "./decoder.js";
import { parseLogLiteEvent } from "./events.js";
import type { LogLiteMessage } from "./types.js";

const enc = new TextEncoder();

function putStr(buf: Uint8Array, off: number, len: number, s: string | Uint8Array): void {
  const bytes = typeof s === "string" ? enc.encode(s) : s;
  buf.set(bytes.subarray(0, len), off);
}

function connectionFrame(version = 2): Uint8Array {
  const f = new Uint8Array(LOGLITE_FRAME_SIZE);
  const v = new DataView(f.buffer);
  v.setUint32(0, 0, true);
  v.setUint32(8, version, true);
  v.setBigUint64(16, 4242n, true);
  putStr(f, 24, 32, "my-mac");
  putStr(f, 56, 260, "/Applications/EVE Frontier.app/exefile");
  return f;
}

function textFrame(type: number, text: string | Uint8Array, opts: { ts?: number; severity?: number; module?: string; channel?: string } = {}): Uint8Array {
  const f = new Uint8Array(LOGLITE_FRAME_SIZE);
  const v = new DataView(f.buffer);
  v.setUint32(0, type, true);
  v.setBigUint64(8, BigInt(opts.ts ?? 1792700339072), true);
  v.setUint32(16, opts.severity ?? 1, true);
  putStr(f, 20, 32, opts.module ?? "svc");
  putStr(f, 52, 32, opts.channel ?? "gameui");
  putStr(f, 84, 256, text);
  return f;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("createLogLiteDecoder", () => {
  it("decodes a simple message after the connection frame", () => {
    const d = createLogLiteDecoder();
    const msgs = d.push(concat(connectionFrame(), textFrame(1, "hello", { severity: 2, module: "frontier", channel: "hud" })));
    expect(d.connection).toEqual({ version: 2, pid: 4242, machineName: "my-mac", executablePath: "/Applications/EVE Frontier.app/exefile" });
    expect(msgs).toEqual([
      { time: new Date(1792700339072), severity: "WARN", module: "frontier", channel: "hud", message: "hello" },
    ]);
  });

  it("buffers frames split across chunks", () => {
    const d = createLogLiteDecoder();
    const all = concat(connectionFrame(), textFrame(1, "split"));
    expect(d.push(all.subarray(0, 500))).toEqual([]);
    expect(d.push(all.subarray(500)).map((m) => m.message)).toEqual(["split"]);
  });

  it("joins large + continuation frames, including multi-byte chars split between frames", () => {
    const d = createLogLiteDecoder();
    const text = "a".repeat(255) + "ё" + "tail";
    const bytes = enc.encode(text);
    const msgs = d.push(
      concat(connectionFrame(), textFrame(2, bytes.subarray(0, 256)), textFrame(3, bytes.subarray(256, 257)), textFrame(4, bytes.subarray(257))),
    );
    expect(msgs.map((m) => m.message)).toEqual([text]);
  });

  it("treats protocol v1 timestamps as seconds", () => {
    const d = createLogLiteDecoder();
    const [m] = d.push(concat(connectionFrame(1), textFrame(1, "old", { ts: 1792700339 })));
    expect(m.time.getTime()).toBe(1792700339000);
  });

  it("ignores text frames before the connection frame", () => {
    const d = createLogLiteDecoder();
    expect(d.push(textFrame(1, "early"))).toEqual([]);
  });
});

function msg(module: string, channel: string, message: string): LogLiteMessage {
  return { time: new Date(0), severity: "NOTICE", module, channel, message };
}

describe("parseLogLiteEvent", () => {
  it("parses the first session change after login", () => {
    const ev = parseLogLiteEvent(
      msg(
        "svc",
        "gameui",
        "GameUI::OnSessionChanged:{'charid': (None, 2112115421), 'corpid': (None, 1000167), 'hqID': (None, 60000085), 'shipid': (None, 1000002649011), 'solarsystemid': (None, 30019771), 'regionid': (None, 10000198), 'constellationid': (None, 20001553), 'genderID': (None, False), 'solarsystemid2': (None, 30019771), 'locationid': (None, 30019771)} - Activating space view without a ego ball properly inserted into a proper ballpark.",
      ),
    );
    expect(ev).toEqual({ kind: "session", time: new Date(0), fromSystemId: null, systemId: 30019771, charId: 2112115421, shipId: 1000002649011 });
  });

  it("parses a session change caused by a jump", () => {
    const ev = parseLogLiteEvent(
      msg("svc", "gameui", "GameUI::OnSessionChanged:{'solarsystemid': (30019771, 30019772), 'solarsystemid2': (30019771, 30019772), 'locationid': (30019771, 30019772)} - Activating space view"),
    );
    expect(ev).toEqual({ kind: "session", time: new Date(0), fromSystemId: 30019771, systemId: 30019772, charId: null, shipId: null });
  });

  it("ignores session changes without a solar system", () => {
    expect(parseLogLiteEvent(msg("svc", "gameui", "GameUI::OnSessionChanged:{'shipid': (1, 2)}"))).toBeNull();
    expect(parseLogLiteEvent(msg("svc", "gameui", "GameUI::OnSessionChanged, Heading for character selection True <Session: ...>"))).toBeNull();
  });

  it("parses a stargate jump", () => {
    expect(parseLogLiteEvent(msg("svc", "menu", "Stargate Jump from 30019771 to 60011318"))).toEqual({
      kind: "jump",
      time: new Date(0),
      fromSystemId: 30019771,
      gateId: 60011318,
    });
  });

  it("parses warp start / stop", () => {
    expect(parseLogLiteEvent(msg("svc", "space", "StartWarpIndication"))).toEqual({ kind: "warp", time: new Date(0), state: "start" });
    expect(parseLogLiteEvent(msg("svc", "space", "StopWarpIndication"))).toEqual({ kind: "warp", time: new Date(0), state: "stop" });
  });

  it("returns null for noise", () => {
    expect(parseLogLiteEvent(msg("blue", "Manifest", "Stargate Jump from 1 to 2"))).toBeNull();
    expect(parseLogLiteEvent(msg("trinity", "Main", "whatever"))).toBeNull();
  });
});

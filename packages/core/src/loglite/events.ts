import type { LogLiteEvent, LogLiteMessage } from "./types.js";

// Session changes are logged as a Python dict of (old, new) pairs:
// GameUI::OnSessionChanged:{'solarsystemid': (30019771, 30019772), ...}
const SESSION_PREFIX = "GameUI::OnSessionChanged:{";
const JUMP_RE = /^Stargate Jump from (\d+) to (\d+)/;
const DEPLOYABLE_JUMP_RE = /^Jump through deployable stargate (\d+)/;

/** New value of an (old, new) pair in a session-change dict; null for `None`. */
function sessionPair(message: string, key: string): [number | null, number | null] | null {
  const m = new RegExp(`'${key}': \\((None|\\d+), (None|\\d+)\\)`).exec(message);
  if (!m) return null;
  const n = (s: string) => (s === "None" ? null : Number(s));
  return [n(m[1]), n(m[2])];
}

/** The few client log lines Powerlay cares about; everything else is null. */
export function parseLogLiteEvent(msg: LogLiteMessage): LogLiteEvent | null {
  if (msg.module !== "svc") return null;

  if (msg.channel === "gameui" && msg.message.startsWith(SESSION_PREFIX)) {
    const system = sessionPair(msg.message, "solarsystemid");
    if (!system || system[1] == null) return null;
    const ship = sessionPair(msg.message, "shipid");
    return {
      kind: "session",
      time: msg.time,
      fromSystemId: system[0],
      systemId: system[1],
      charId: sessionPair(msg.message, "charid")?.[1] ?? null,
      shipId: ship?.[1] ?? null,
      fromShipId: ship?.[0] ?? null,
    };
  }

  if (msg.channel === "menu") {
    const m = JUMP_RE.exec(msg.message);
    if (m) return { kind: "jump", time: msg.time, gate: "stargate", fromSystemId: Number(m[1]), gateId: Number(m[2]) };
    const d = DEPLOYABLE_JUMP_RE.exec(msg.message);
    if (d) return { kind: "jump", time: msg.time, gate: "deployable", fromSystemId: null, gateId: Number(d[1]) };
  }

  if (msg.channel === "space") {
    if (msg.message === "StartWarpIndication") return { kind: "warp", time: msg.time, state: "start" };
    if (msg.message === "StopWarpIndication") return { kind: "warp", time: msg.time, state: "stop" };
  }

  return null;
}

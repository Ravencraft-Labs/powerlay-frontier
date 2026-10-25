import type { LogLiteJumpEvent, LogLiteSessionEvent } from "./types.js";

/**
 * How the character got to the next system:
 * - "stargate": fixed NPC stargate
 * - "deployable-gate": anchored gate (player-built or server-placed); its owner is looked up separately
 * - "ship-jump": no gate line before the change — the ship's own jump
 * - "respawn": the ship changed with the system (death → new ship at the clone)
 */
export type TravelVia = "stargate" | "deployable-gate" | "ship-jump" | "respawn";

/**
 * Who a deployable gate belongs to, from the chain's gate objects (Mini / Heavy Gate).
 * "offchain": no such gate on chain — catapults and server-placed gates live only in the game server.
 * "unknown": the lookup failed (network); it is retried on the next read.
 */
export type GateOwner =
  | { kind: "offchain" }
  | { kind: "player"; characterName: string | null; tribeId: number | null; typeId: number | null; online: boolean }
  | { kind: "unknown"; error?: string };

export interface TravelHop {
  /** ISO time of arrival. */
  at: string;
  fromSystemId: number;
  toSystemId: number;
  via: TravelVia;
  gateId?: number;
  gateOwner?: GateOwner;
}

/** A gate jump waiting for its landing (the session change into the next system). */
export interface PendingJump {
  gate: LogLiteJumpEvent["gate"];
  gateId: number;
  /** System the jump started in: from the log line, else the system we were in. */
  fromSystemId: number | null;
  receivedAt: number;
}

/** Session change this soon after a gate jump is that jump landing. */
export const JUMP_LANDING_WINDOW_MS = 60_000;

/**
 * Turns a session change into a hop, or null when it isn't a move between systems (login, ship swap in place).
 * `pending` is the last gate jump seen before this change.
 */
export function classifyHop(session: LogLiteSessionEvent, pending: PendingJump | null, now: number, at: string): TravelHop | null {
  const from = session.fromSystemId;
  if (from == null || from === session.systemId) return null;
  const base = { at, fromSystemId: from, toSystemId: session.systemId };
  if (session.fromShipId != null && session.shipId != null && session.fromShipId !== session.shipId) {
    return { ...base, via: "respawn" };
  }
  const landed =
    pending != null && now - pending.receivedAt <= JUMP_LANDING_WINDOW_MS && (pending.fromSystemId == null || pending.fromSystemId === from);
  if (!landed) return { ...base, via: "ship-jump" };
  return { ...base, via: pending.gate === "stargate" ? "stargate" : "deployable-gate", gateId: pending.gateId };
}

/** Systems visited in order: the first hop's origin, then every arrival. */
export function travelPath(hops: TravelHop[]): number[] {
  if (hops.length === 0) return [];
  return [hops[0].fromSystemId, ...hops.map((h) => h.toSystemId)];
}

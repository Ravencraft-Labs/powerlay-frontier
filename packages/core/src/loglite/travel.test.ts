import { describe, expect, it } from "vitest";
import { classifyHop, travelPath, type PendingJump, type TravelHop } from "./travel.js";
import type { LogLiteSessionEvent } from "./types.js";

const AT = "2026-10-25T12:40:25.000Z";

function session(from: number | null, to: number, ship?: [number | null, number | null]): LogLiteSessionEvent {
  return { kind: "session", time: new Date(0), fromSystemId: from, systemId: to, charId: null, shipId: ship?.[1] ?? null, fromShipId: ship?.[0] ?? null };
}

const deployable: PendingJump = { gate: "deployable", gateId: 1000002872455, fromSystemId: null, receivedAt: 1000 };

describe("classifyHop", () => {
  it("ignores login and same-system changes", () => {
    expect(classifyHop(session(null, 1), null, 0, AT)).toBeNull();
    expect(classifyHop(session(1, 1), null, 0, AT)).toBeNull();
  });

  it("matches a deployable gate jump to the next system change", () => {
    expect(classifyHop(session(30019801, 30019802), deployable, 6000, AT)).toEqual({
      at: AT,
      fromSystemId: 30019801,
      toSystemId: 30019802,
      via: "deployable-gate",
      gateId: 1000002872455,
    });
  });

  it("matches a stargate jump only from the system it started in", () => {
    const pending: PendingJump = { gate: "stargate", gateId: 50000001, fromSystemId: 1, receivedAt: 0 };
    expect(classifyHop(session(1, 2), pending, 5000, AT)?.via).toBe("stargate");
    expect(classifyHop(session(3, 2), pending, 5000, AT)?.via).toBe("ship-jump");
  });

  it("treats a change without a recent gate jump as the ship's own jump", () => {
    expect(classifyHop(session(1, 2), null, 0, AT)?.via).toBe("ship-jump");
    expect(classifyHop(session(1, 2), deployable, 1000 + 61_000, AT)?.via).toBe("ship-jump");
  });

  it("detects a respawn by the ship changing", () => {
    expect(classifyHop(session(1, 2, [10, 11]), deployable, 2000, AT)?.via).toBe("respawn");
    // As logged after a self-destruct: 'shipid': (None, 1000003691913), 'solarsystemid': (30019798, 30019801)
    expect(classifyHop(session(30019798, 30019801, [null, 1000003691913]), null, 0, AT)?.via).toBe("respawn");
  });
});

describe("travelPath", () => {
  it("lists the origin then every arrival", () => {
    const hops: TravelHop[] = [
      { at: AT, fromSystemId: 1, toSystemId: 2, via: "stargate" },
      { at: AT, fromSystemId: 2, toSystemId: 3, via: "ship-jump" },
    ];
    expect(travelPath(hops)).toEqual([1, 2, 3]);
    expect(travelPath([])).toEqual([]);
  });
});

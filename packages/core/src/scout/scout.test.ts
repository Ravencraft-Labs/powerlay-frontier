import { describe, it, expect } from "vitest";
import { buildZoneCatalog, ZONE_CATALOG } from "./catalog";
import { validateScoutEntry } from "./validation";
import { createScoutEntry } from "./scoutEntry";

describe("buildZoneCatalog", () => {
  it("falls back to the built-in catalog without static data", () => {
    expect(buildZoneCatalog(null)).toBe(ZONE_CATALOG);
    expect(buildZoneCatalog([])).toBe(ZONE_CATALOG);
  });

  it("uses data-driven sites, keeps fallback for uncovered zones, orders by zone", () => {
    const catalog = buildZoneCatalog([
      { name: "Shale", zone: "OUTER" },
      { name: "Ossuary Mill", zone: "INNER", description: "Broken World - Inner Belt - Ossuary Mill" },
      { name: "Derelict Bay", zone: "INNER" },
    ]);
    expect(catalog.map((g) => g.zone)).toEqual(["RIFT", "INNER", "TROJAN", "FRINGE", "OUTER", "FERAL", "UNKNOWN"]);
    expect(catalog.find((g) => g.zone === "INNER")!.sites.map((s) => s.name)).toEqual(["Derelict Bay", "Ossuary Mill"]);
    expect(catalog.find((g) => g.zone === "OUTER")!.sites.map((s) => s.name)).toEqual(["Shale"]);
    expect(catalog.find((g) => g.zone === "FERAL")!.sites.map((s) => s.name)).toEqual(["Mooneater", "Xeroti"]);
  });
});

describe("system report entries", () => {
  const base = {
    system: "B1O|N11",
    type: "system" as const,
    reporter: "manual",
    visibility: "tribe" as const,
  };

  it("accepts a valid report", () => {
    const entry = createScoutEntry(
      { ...base, report: { planets: 4, spectralClass: "M6", transientMass: 3, infestationIndex: 6 } },
      "id-1"
    );
    expect(validateScoutEntry(entry)).toBe(true);
    expect(entry.report?.transientMass).toBe(3);
  });

  it("rejects out-of-range values", () => {
    expect(validateScoutEntry(createScoutEntry({ ...base, report: { transientMass: 6 } }, "a"))).toBe(false);
    expect(validateScoutEntry(createScoutEntry({ ...base, report: { infestationIndex: 0 } }, "b"))).toBe(false);
    expect(validateScoutEntry(createScoutEntry({ ...base, report: { planets: 2.5 } }, "c"))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { buildZoneCatalog, ZONE_CATALOG } from "./catalog";
import { validateScoutEntry } from "./validation";
import { createScoutEntry, findSystemReport, withReportField } from "./scoutEntry";

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

  it("finds the newest active report and edits single fields", () => {
    const old = createScoutEntry({ ...base, report: { planets: 3 } }, "old", "2026-10-01T00:00:00Z");
    const newer = createScoutEntry({ ...base, report: { transientMass: 2 } }, "new", "2026-10-02T00:00:00Z");
    const cleared = { ...createScoutEntry({ ...base }, "x", "2026-10-03T00:00:00Z"), status: "cleared" as const };
    const other = createScoutEntry({ ...base, system: "OTHER" }, "o", "2026-10-04T00:00:00Z");
    expect(findSystemReport([old, newer, cleared, other], "B1O|N11")?.id).toBe("new");
    expect(findSystemReport([other], "B1O|N11")).toBeNull();

    expect(withReportField({ transientMass: 2 }, "infestationIndex", 5)).toEqual({ transientMass: 2, infestationIndex: 5 });
    expect(withReportField({ transientMass: 2, planets: 4 }, "transientMass", undefined)).toEqual({ planets: 4 });
  });

  it("rejects out-of-range values", () => {
    expect(validateScoutEntry(createScoutEntry({ ...base, report: { transientMass: 6 } }, "a"))).toBe(false);
    expect(validateScoutEntry(createScoutEntry({ ...base, report: { infestationIndex: 0 } }, "b"))).toBe(false);
    expect(validateScoutEntry(createScoutEntry({ ...base, report: { planets: 2.5 } }, "c"))).toBe(false);
  });
});

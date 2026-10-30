import { describe, expect, it } from "vitest";
import { currentWorldPackage, FRONTIER_WORLDS, worldOfPackage, worldOfTypeRepr, worldPackagesOf } from "./worlds.js";

const stillness = FRONTIER_WORLDS.stillness;
const legacy = stillness.legacyWorldPackages[0];

describe("frontier worlds", () => {
  it("finds the server of current and legacy packages", () => {
    expect(worldOfPackage(stillness.worldPackage)).toEqual({ world: stillness, current: true });
    expect(worldOfPackage(legacy.toUpperCase().replace("0X", "0x"))).toEqual({ world: stillness, current: false });
    expect(worldOfPackage("0x1")).toBeNull();
    expect(worldOfTypeRepr(`${legacy}::character::PlayerProfile`)?.current).toBe(false);
  });

  it("moves a saved legacy package to the current one, keeps custom ones", () => {
    expect(currentWorldPackage(legacy)).toBe(stillness.worldPackage);
    expect(currentWorldPackage("0xabc")).toBe("0xabc");
    expect(currentWorldPackage("")).toBe(stillness.worldPackage);
  });

  it("lists current first", () => {
    expect(worldPackagesOf("stillness")[0]).toBe(stillness.worldPackage);
  });
});

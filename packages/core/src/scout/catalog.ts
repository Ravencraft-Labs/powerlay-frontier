import type { RiftZone, ScoutSiteDef } from "./types.js";

export const RIFT_ZONES: RiftZone[] = ["RIFT", "INNER", "TROJAN", "FRINGE", "OUTER", "FERAL", "UNKNOWN"];

export interface ZoneCatalogGroup {
  zone: RiftZone;
  sites: ScoutSiteDef[];
}

const site = (zone: RiftZone) => (name: string): ScoutSiteDef => ({ name, zone });

/**
 * Fallback quick-mark catalog, used when data/stripped/scout_sites.json is missing and for zones
 * static data does not cover (FERAL). Mirrors what strip-data derives from ecosystem.fsdbinary.
 */
export const ZONE_CATALOG: ZoneCatalogGroup[] = [
  {
    zone: "RIFT",
    sites: [
      "Rift 0020", "Rift 054E", "Rift 05D8", "Rift 0633", "Rift 0759",
      "Rift 07CF", "Rift F7B4", "Rift F8DA", "Rift F935", "Rift F9BF",
    ].map(site("RIFT")),
  },
  {
    zone: "INNER",
    sites: [
      "Ancient Cluster", "Derelict Bay", "Derelict Quarry", "Drifting Bastion", "Extraction Yard",
      "Graven Works", "Longwatch Redoubt", "Ossuary Mill", "Reliquary Husk", "Ruins", "Stone Cluster",
    ].map(site("INNER")),
  },
  { zone: "TROJAN", sites: ["Drifting Annex", "Garden"].map(site("TROJAN")) },
  { zone: "FRINGE", sites: ["Crossing", "Latticeway", "Tallyport"].map(site("FRINGE")) },
  {
    zone: "OUTER",
    sites: ["Abandoned Foundry", "Blue Drift", "Grove", "Shale", "Vestiges"].map(site("OUTER")),
  },
  { zone: "FERAL", sites: ["Mooneater", "Xeroti"].map(site("FERAL")) },
  { zone: "UNKNOWN", sites: ["Dustline Waystation", "Respite Anchorage"].map(site("UNKNOWN")) },
];

/**
 * Quick-mark catalog grouped by zone in RIFT_ZONES order. Sites from static data win;
 * zones with no data-driven sites (e.g. FERAL) keep the fallback list.
 */
export function buildZoneCatalog(sites: ScoutSiteDef[] | null | undefined): ZoneCatalogGroup[] {
  if (!sites?.length) return ZONE_CATALOG;
  return RIFT_ZONES.map((zone) => {
    const fromData = sites
      .filter((s) => s.zone === zone)
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    const fallback = ZONE_CATALOG.find((g) => g.zone === zone)?.sites ?? [];
    return { zone, sites: fromData.length > 0 ? fromData : fallback };
  }).filter((g) => g.sites.length > 0);
}

/** Tooltip text for a quick-mark site button. */
export function siteTooltip(s: ScoutSiteDef): string | undefined {
  const parts = [s.description, s.tags?.length ? `tags: ${s.tags.join(", ")}` : undefined].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : undefined;
}

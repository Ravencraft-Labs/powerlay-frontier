import type { RiftZone } from "./types.js";

export const RIFT_ZONES: RiftZone[] = ["RIFT", "INNER", "TROJAN", "FRINGE", "OUTER", "FERAL", "UNKNOWN"];

/**
 * Quick-mark site catalog grouped by zone. Names come from static data: Crude Rift (groupID 4872) and
 * Wreck, Ruin & Debris (4873), with the zone prefix ("Inner ", "Outer "...) stripped.
 * UNKNOWN = sites whose type name carries no zone prefix.
 */
export const ZONE_CATALOG: Array<{ zone: RiftZone; sites: string[] }> = [
  {
    zone: "RIFT",
    sites: [
      "Rift 0020", "Rift 054E", "Rift 05D8", "Rift 0633", "Rift 0759",
      "Rift 07CF", "Rift F7B4", "Rift F8DA", "Rift F935", "Rift F9BF",
    ],
  },
  {
    zone: "INNER",
    sites: [
      "Ancient Cluster", "Derelict Bay", "Derelict Quarry", "Drifting Bastion",
      "Extraction Yard", "Reliquary Husk", "Ruins", "Stone Cluster",
    ],
  },
  { zone: "TROJAN", sites: ["Drifting Annex", "Garden"] },
  { zone: "FRINGE", sites: ["Crossing", "Latticeway", "Tallyport"] },
  {
    zone: "OUTER",
    sites: ["Abandoned Foundry", "Blue Drift", "Grove", "Respite Anchorage", "Shale", "Vestiges"],
  },
  { zone: "FERAL", sites: ["Mooneater", "Xeroti"] },
  {
    zone: "UNKNOWN",
    sites: ["Dustline Waystation", "Graven Works", "Longwatch Redoubt", "Ossuary Mill"],
  },
];

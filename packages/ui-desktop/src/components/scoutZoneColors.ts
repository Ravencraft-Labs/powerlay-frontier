import type { RiftZone } from "@powerlay/core";

/** Tailwind classes for each rift zone badge. */
export const ZONE_COLORS: Record<RiftZone, string> = {
  RIFT:   "text-cyan-400   bg-cyan-400/10   border-cyan-400/40",
  INNER:  "text-blue-400   bg-blue-400/10   border-blue-400/40",
  TROJAN: "text-violet-400 bg-violet-400/10 border-violet-400/40",
  FRINGE: "text-orange-400 bg-orange-400/10 border-orange-400/40",
  OUTER:  "text-amber-400  bg-amber-400/10  border-amber-400/40",
  FERAL:  "text-red-400    bg-red-400/10    border-red-400/40",
};

/** Fallback colors for non-rift entry types. */
export const TYPE_FALLBACK_COLORS: Record<string, string> = {
  anomaly:   "text-yellow-400 bg-yellow-400/10 border-yellow-400/40",
  resource:  "text-green-400  bg-green-400/10  border-green-400/40",
  structure: "text-orange-400 bg-orange-400/10 border-orange-400/40",
  note:      "text-muted      bg-border/20      border-border/40",
};

export function entryBadgeColor(zone: RiftZone | undefined, type: string): string {
  if (zone && ZONE_COLORS[zone]) return ZONE_COLORS[zone];
  return TYPE_FALLBACK_COLORS[type] ?? "text-muted bg-border/20 border-border/40";
}

export function entryBadgeLabel(zone: RiftZone | undefined, type: string): string {
  return zone ?? type.toUpperCase();
}

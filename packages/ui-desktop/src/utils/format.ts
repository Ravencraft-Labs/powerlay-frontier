/**
 * Format a number with k (thousands) and M (millions) suffixes.
 * e.g. 11000 → "11k", 600 → "0.6k", 110058 → "0.11M"
 */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1e6) {
    const v = n / 1e6;
    const s = v >= 10 ? Math.round(v).toString() : v.toFixed(2).replace(/\.?0+$/, "");
    return s + "M";
  }
  if (n >= 1e3) {
    const v = n / 1e3;
    const s = v >= 10 ? Math.round(v).toString() : v.toFixed(2).replace(/\.?0+$/, "");
    return s + "k";
  }
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
}

/** Parse compact input like "20k", "1.5M", "500" to number. Returns NaN if invalid. */
export function parseCompactNumber(s: string): number {
  const trimmed = String(s).trim().replace(/,/g, "");
  if (!trimmed) return NaN;
  const m = trimmed.match(/^([\d.]+)\s*([kKmM])?$/);
  if (!m) return NaN;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return NaN;
  const suffix = m[2]?.toLowerCase();
  if (suffix === "k") n *= 1e3;
  else if (suffix === "m") n *= 1e6;
  return n;
}

/** Format number with thousands separator for tooltip (e.g. 3,899,111). */
export function formatWithThousandsSeparator(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Format seconds as "12h 10m" or "5m 30s" for production timer. */
export function formatProductionTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

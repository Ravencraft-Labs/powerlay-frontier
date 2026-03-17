/**
 * Parse a mining log line from EVE Frontier.
 * Stateless, pure function — no side effects, no file I/O.
 *
 * Example input:
 * [ 2026.02.16 22:31:05 ] (mining) <color=0x77ffffff>You mined <font size=12><color=0xffaaaa00>18<color=0x77ffffff><font size=10> units of <color=0xffffffff><font size=12>Hydrated Sulfide Matrix<color=0x77ffffff><font size=10>
 */
export interface MiningEvent {
  quantity: number;
  oreName: string;
}

export function parseMiningLine(line: string): MiningEvent | null {
  if (typeof line !== "string") return null;
  if (!line.includes("(mining)") || !line.includes("You mined")) return null;

  const stripped = line.replace(/<[^>]+>/g, "");
  const m = stripped.match(/You mined\s+(\d+)\s+units of\s+(.+)$/s);
  if (!m) return null;

  const quantity = parseInt(m[1], 10);
  const oreName = m[2].trim();
  if (!Number.isFinite(quantity) || quantity <= 0 || !oreName) return null;

  return { quantity, oreName };
}

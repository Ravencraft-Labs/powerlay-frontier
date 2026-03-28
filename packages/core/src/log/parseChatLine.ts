/**
 * Parse a chat log line from EVE Frontier to detect system changes.
 * Stateless, pure function — no side effects, no file I/O.
 *
 * Example input:
 * [ 2026.03.28 12:00:00 ] (notify) Channel changed to Local : I0S-KS5
 */
export interface ChatSystemEvent {
  system: string;
}

export function parseChatLine(line: string): ChatSystemEvent | null {
  if (typeof line !== "string") return null;
  if (!line.includes("(notify)") || !line.includes("Channel changed to Local :")) return null;

  const stripped = line.replace(/<[^>]+>/g, "");
  const m = stripped.match(/Channel changed to Local\s*:\s*(.+)$/);
  if (!m) return null;

  const system = m[1].trim();
  if (!system) return null;

  return { system };
}

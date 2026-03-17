/**
 * Parse the timestamp from an EVE Frontier log line.
 * Format: [ YYYY.MM.DD HH:MM:SS ]
 * Game writes timestamps in UTC; we parse as UTC to match Date.now() (epoch ms).
 * Returns milliseconds since epoch, or null if unparseable.
 */
export function parseLogLineTimestamp(line: string): number | null {
  if (typeof line !== "string") return null;
  const m = line.match(/\[\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\s*\]/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1; // 0-indexed
  const day = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const sec = parseInt(m[6], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!Number.isFinite(hour) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  const date = new Date(Date.UTC(year, month, day, hour, min, sec, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

import fs from "fs";
import os from "os";
import path from "path";
import { appLog } from "./appLogger.js";
import { createFileTailer } from "./fileTailer.js";

const SAMPLE_LINE =
  "[ 2026.02.16 22:31:05 ] (mining) <color=0x77ffffff>You mined <font size=12><color=0xffaaaa00>18<color=0x77ffffff><font size=10> units of <color=0xffffffff><font size=12>Hydrated Sulfide Matrix<color=0x77ffffff><font size=10>\n";

let tailerTestError: string | null = null;

export function getTailerTestError(): string | null {
  return tailerTestError;
}

export async function runTailerTest(): Promise<void> {
  tailerTestError = null;
  const tmpDir = os.tmpdir();
  const testDir = path.join(tmpDir, `powerlay-tailer-test-${Date.now()}`);
  const testFile = path.join(testDir, "test.txt");

  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, SAMPLE_LINE + SAMPLE_LINE + SAMPLE_LINE, "utf-8");

    const received: string[] = [];
    const tailer = createFileTailer({
      logDir: testDir,
      pollIntervalMs: 100,
      onLine: (line) => received.push(line),
    });

    tailer.start();
    await new Promise((r) => setTimeout(r, 150));
    tailer.stop();

    if (received.length !== 3) {
      tailerTestError = `Tailer test: expected 3 lines, got ${received.length}`;
      appLog.error("tailerTest failed", { expected: 3, got: received.length, received });
      return;
    }

    fs.appendFileSync(testFile, SAMPLE_LINE.slice(0, 50));
    const tailer2 = createFileTailer({
      logDir: testDir,
      pollIntervalMs: 50,
      onLine: (line) => received.push(line),
    });
    tailer2.start();
    await new Promise((r) => setTimeout(r, 60));
    if (received.length !== 3) {
      fs.appendFileSync(testFile, SAMPLE_LINE.slice(50));
      await new Promise((r) => setTimeout(r, 80));
    }
    tailer2.stop();

    const finalCount = received.length;
    if (finalCount < 4) {
      tailerTestError = `Tailer test: partial line handling failed (got ${finalCount} lines)`;
      appLog.error("tailerTest partial-line failed", { received: finalCount });
    }

    appLog.info("tailerTest passed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tailerTestError = `Tailer test: ${msg}`;
    appLog.error("tailerTest error", { error: msg });
  } finally {
    try {
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    } catch {
      /* ignore */
    }
  }
}

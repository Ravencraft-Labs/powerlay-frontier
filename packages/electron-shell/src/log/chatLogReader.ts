import fs from "fs";
import { parseChatLine } from "@powerlay/core";
import { appLog } from "./appLogger.js";
import { checkLogDir, createFileTailer, expandPath } from "./fileTailer.js";

export const DEFAULT_CHAT_LOG_DIR = "%USERPROFILE%\\Documents\\Frontier\\Logs\\Chatlogs";

/** Only watch Local_*.txt — ignore Corp, Alliance, etc. */
const LOCAL_FILE_FILTER = (filename: string) => filename.startsWith("Local_");

let currentSystem: string | null = null;
let chatLogError: string | null = null;
let tailerStop: (() => void) | null = null;

export function getCurrentSystem(): string | null {
  return currentSystem;
}

export function getChatLogError(): string | null {
  return chatLogError;
}

/** Scan the file in reverse to find the most recently logged system. */
function reverseScanlastSystem(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath);
    // Detect encoding from BOM
    let text: string;
    if (raw[0] === 0xff && raw[1] === 0xfe) {
      text = raw.slice(2).toString("utf16le");
    } else if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
      text = raw.slice(3).toString("utf8");
    } else {
      text = raw.toString("utf8");
    }
    const lines = text.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const event = parseChatLine(lines[i]);
      if (event) return event.system;
    }
  } catch (err) {
    appLog.warn("chatLogReader: reverse scan failed", { error: String(err) });
  }
  return null;
}

export function startChatLogReader(chatLogDir: string = DEFAULT_CHAT_LOG_DIR, pollIntervalMs = 1000): void {
  stopChatLogReader();
  chatLogError = null;

  const expandedDir = expandPath(chatLogDir);
  const check = checkLogDir(expandedDir, LOCAL_FILE_FILTER);
  if (check.ok) {
    const found = reverseScanlastSystem(check.path);
    if (found) {
      currentSystem = found;
      appLog.info("chatLogReader: initialized system from reverse scan", { system: found });
    }
  }

  const tailer = createFileTailer({
    logDir: chatLogDir,
    pollIntervalMs,
    fileFilter: LOCAL_FILE_FILTER,
    onLine: (line) => {
      const event = parseChatLine(line);
      if (event) {
        currentSystem = event.system;
        appLog.info("chatLogReader: system changed", { system: event.system });
      }
    },
    onError: (err) => {
      chatLogError = err;
      if (err) {
        appLog.warn("chatLogReader: log access issue", { error: err });
      }
    },
  });

  tailer.start();
  tailerStop = tailer.stop;
  appLog.info("chatLogReader started", { chatLogDir });
}

export function stopChatLogReader(): void {
  if (tailerStop) {
    tailerStop();
    tailerStop = null;
  }
  appLog.info("chatLogReader stopped");
}

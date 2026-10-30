// Stands in for CCP's LogLite: the game client connects to TCP 3273 and streams its debug log.
// Only one program can hold the port, so real LogLite can't run while this is on.
import net from "net";
import { createLogLiteDecoder, LOGLITE_PORT, parseLogLiteEvent, type LogLiteEvent } from "@powerlay/core";
import { appLog } from "./appLogger.js";
import { mirrorLogLiteMessage, mirrorLogLiteNote } from "./logLiteMirror.js";

export type LogLiteState = "off" | "listening" | "connected" | "error";

export interface LogLiteStatus {
  state: LogLiteState;
  error: string | null;
}

let server: net.Server | null = null;
const clients = new Set<net.Socket>();
let status: LogLiteStatus = { state: "off", error: null };

export function getLogLiteStatus(): LogLiteStatus {
  return status;
}

function refreshState(): void {
  if (server) status = { state: clients.size > 0 ? "connected" : "listening", error: null };
}

export interface LogLiteHandlers {
  onEvent: (event: LogLiteEvent) => void;
  onConnection: (connected: boolean) => void;
}

export function startLogLiteListener(handlers: LogLiteHandlers): void {
  if (server) return;
  const srv = net.createServer((socket) => {
    clients.add(socket);
    refreshState();
    handlers.onConnection(true);
    mirrorLogLiteNote("game client connected");
    const decoder = createLogLiteDecoder();
    socket.on("data", (chunk) => {
      for (const msg of decoder.push(chunk)) {
        mirrorLogLiteMessage(msg);
        const event = parseLogLiteEvent(msg);
        if (event) handlers.onEvent(event);
      }
    });
    socket.on("error", (err) => appLog.warn("logLite: client socket error", { error: String(err) }));
    socket.on("close", () => {
      clients.delete(socket);
      mirrorLogLiteNote("game client disconnected");
      refreshState();
      handlers.onConnection(false);
    });
  });
  srv.on("error", (err: Error & { code?: string }) => {
    const error = err.code === "EADDRINUSE" ? `Port ${LOGLITE_PORT} is busy — close LogLite and try again` : String(err);
    appLog.warn("logLite: server error", { error });
    stopLogLiteListener();
    status = { state: "error", error };
  });
  srv.listen(LOGLITE_PORT, () => {
    appLog.info("logLite: listening", { port: LOGLITE_PORT });
    refreshState();
  });
  server = srv;
  status = { state: "listening", error: null };
}

export function stopLogLiteListener(): void {
  for (const socket of clients) socket.destroy();
  clients.clear();
  server?.close();
  server = null;
  status = { state: "off", error: null };
}

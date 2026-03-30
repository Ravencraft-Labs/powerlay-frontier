/**
 * Local HTTP server for wallet auth bridge.
 * Listens on 127.0.0.1 only. Serves auth page and callback endpoint.
 * Runs for the whole app session - persistent, not start/stop per login.
 */
import http from "http";
import { appLog } from "../log/appLogger.js";
import { getAuthPage } from "./authPageHtml.js";
import { getSignTxPage } from "./signTxPageHtml.js";

const DEFAULT_PORT = 3847;

/** Params for the browser `/sign-tx` page when signing `connect_storage`. */
export interface ConnectStorageSignTxParams {
  kind: "connect_storage";
  storageUnitId: string;
  ownerCapId: string;
  tribeId: string;
  characterId?: string;
  worldPackageId?: string;
  powerlayPackageId: string;
}

/** Params for `/sign-tx` when signing `deliver_personal_to_owner_primary`. */
export interface ContractDeliverySignTxParams {
  kind: "contract_delivery";
  storageConfigObjectId: string;
  storageUnitId: string;
  characterId: string;
  delivererCharacterOwnerCapId: string;
  /** u64 as decimal string */
  typeId: string;
  quantity: number;
  worldPackageId: string;
  powerlayPackageId: string;
  useCharacterCapBorrow: boolean;
}

export type SignTxParams = ConnectStorageSignTxParams | ContractDeliverySignTxParams;

export interface AuthServerResult {
  port: number;
  baseUrl: string;
  registerPending: (sessionId: string, resolve: (data: { address: string }) => void, reject: (err: Error) => void) => void;
  resolvePending: (sessionId: string, data: { address: string }) => void;
  rejectPending: (sessionId: string, err: Error) => void;
  registerSignTx: (sessionId: string, params: SignTxParams, resolve: (digest: string) => void, reject: (err: Error) => void) => void;
  resolveSignTx: (sessionId: string, digest: string) => void;
  rejectSignTx: (sessionId: string, err: Error) => void;
}

const pendingLogins = new Map<string, { resolve: (data: { address: string }) => void; reject: (err: Error) => void }>();
const pendingSignTx = new Map<string, { params: SignTxParams; resolve: (digest: string) => void; reject: (err: Error) => void }>();

function registerPending(sessionId: string, resolve: (data: { address: string }) => void, reject: (err: Error) => void): void {
  pendingLogins.set(sessionId, { resolve, reject });
}

function resolvePending(sessionId: string, data: { address: string }): void {
  const entry = pendingLogins.get(sessionId);
  if (entry) {
    pendingLogins.delete(sessionId);
    entry.resolve(data);
  }
}

function rejectPending(sessionId: string, err: Error): void {
  const entry = pendingLogins.get(sessionId);
  if (entry) {
    pendingLogins.delete(sessionId);
    entry.reject(err);
  }
}

function registerSignTx(sessionId: string, params: SignTxParams, resolve: (digest: string) => void, reject: (err: Error) => void): void {
  pendingSignTx.set(sessionId, { params, resolve, reject });
}

function resolveSignTx(sessionId: string, digest: string): void {
  const entry = pendingSignTx.get(sessionId);
  if (entry) {
    pendingSignTx.delete(sessionId);
    entry.resolve(digest);
  }
}

function rejectSignTx(sessionId: string, err: Error): void {
  const entry = pendingSignTx.get(sessionId);
  if (entry) {
    pendingSignTx.delete(sessionId);
    entry.reject(err);
  }
}

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer(() => {});
    server.listen(startPort, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      findAvailablePort(startPort + 1).then(resolve);
    });
  });
}

export function startAuthServer(): Promise<AuthServerResult> {
  return findAvailablePort(DEFAULT_PORT).then((port) => {
    const baseUrl = `http://127.0.0.1:${port}`;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", baseUrl);
      const pathname = url.pathname;

      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (pathname === "/auth" && req.method === "GET") {
        const sessionId = url.searchParams.get("session") ?? "";
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "text/plain", ...corsHeaders });
          res.end("Missing session id");
          return;
        }
        const html = getAuthPage(sessionId, baseUrl);
        res.writeHead(200, { "Content-Type": "text/html", ...corsHeaders });
        res.end(html);
        return;
      }

      if (pathname === "/auth/cancel" && (req.method === "GET" || req.method === "POST")) {
        const sessionId = url.searchParams.get("session") ?? "";
        if (sessionId) {
          rejectPending(sessionId, new Error("Login cancelled"));
        }
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathname === "/sign-tx" && req.method === "GET") {
        const sessionId = url.searchParams.get("session") ?? "";
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "text/plain", ...corsHeaders });
          res.end("Missing session id");
          return;
        }
        const html = getSignTxPage(sessionId, baseUrl);
        res.writeHead(200, { "Content-Type": "text/html", ...corsHeaders });
        res.end(html);
        return;
      }

      if (pathname === "/sign-tx/log" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; if (body.length > 8192) body = body.slice(0, 8192); });
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as { events?: unknown[] };
            const events = Array.isArray(data?.events) ? data.events : [];
            for (const ev of events) {
              const e = ev as Record<string, unknown>;
              const code = typeof e.e === "string" ? e.e : "event";
              const { e: _code, ...rest } = e;
              const extra = Object.keys(rest).length ? rest : undefined;
              appLog.info(`[auth_storage_page] ${code}`, extra);
            }
          } catch {
            /* ignore malformed payloads */
          }
          res.writeHead(204, corsHeaders);
          res.end();
        });
        return;
      }

      if (pathname === "/sign-tx/params" && req.method === "GET") {
        const sessionId = url.searchParams.get("session") ?? "";
        const entry = pendingSignTx.get(sessionId);
        if (!entry) {
          res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders });
          res.end(JSON.stringify({ error: "Session not found" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify(entry.params));
        return;
      }

      if (pathname === "/sign-tx/callback" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as { sessionId?: string; digest?: string; error?: string };
            const sessionId = data?.sessionId;
            if (!sessionId) {
              res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
              res.end(JSON.stringify({ ok: false, error: "Missing sessionId" }));
              return;
            }
            if (data.error) {
              rejectSignTx(sessionId, new Error(data.error));
            } else if (data.digest) {
              resolveSignTx(sessionId, data.digest);
            } else {
              rejectSignTx(sessionId, new Error("Missing digest in callback"));
            }
            res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
            res.end(JSON.stringify({ ok: false, error: "Invalid request" }));
          }
        });
        return;
      }

      if (pathname === "/sign-tx/cancel" && (req.method === "GET" || req.method === "POST")) {
        const sessionId = url.searchParams.get("session") ?? "";
        if (sessionId) rejectSignTx(sessionId, new Error("Transaction signing cancelled"));
        res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathname === "/auth/callback" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as { sessionId?: string; address?: string; signature?: string };
            const sessionId = data?.sessionId;
            const address = data?.address;
            if (!sessionId || !address || typeof address !== "string") {
              res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
              res.end(JSON.stringify({ ok: false, error: "Missing sessionId or address" }));
              return;
            }
            resolvePending(sessionId, { address });
            res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
            res.end(JSON.stringify({ ok: false, error: "Invalid request" }));
          }
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain", ...corsHeaders });
      res.end("Not Found");
    });

    server.listen(port, "127.0.0.1", () => {
      // Server running
    });

    return {
      port,
      baseUrl,
      registerPending,
      resolvePending,
      rejectPending,
      registerSignTx,
      resolveSignTx,
      rejectSignTx,
    };
  });
}

/**
 * IPC handlers for auth session: get-session, login, logout.
 * Login orchestrates: create session, open browser, await callback, save session.
 */
import { randomUUID } from "crypto";
import { ipcMain, shell } from "electron";
import { loadSession, saveSession, clearSession } from "../auth/sessionStore.js";
import type { AuthServerResult } from "../auth/authServer.js";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let activeSessionId: string | null = null;

export function registerAuthHandlers(authServer: AuthServerResult, onLoginSuccess?: () => void): void {
  ipcMain.handle("auth:get-session", () => {
    return loadSession();
  });

  ipcMain.handle("auth:cancel", () => {
    if (activeSessionId) {
      authServer.rejectPending(activeSessionId, new Error("Login cancelled"));
      activeSessionId = null;
    }
  });

  ipcMain.handle("auth:login", async () => {
    const sessionId = randomUUID();
    activeSessionId = sessionId;
    const { baseUrl, registerPending, rejectPending } = authServer;

    const result = await new Promise<{ walletAddress: string } | { error: string }>((resolve) => {
      const timeout = setTimeout(() => {
        rejectPending(sessionId, new Error("Login timed out"));
        resolve({ error: "Login timed out. Please try again." });
      }, LOGIN_TIMEOUT_MS);

      registerPending(
        sessionId,
        (data) => {
          clearTimeout(timeout);
          activeSessionId = null;
          saveSession({ walletAddress: data.address, sessionId });
          onLoginSuccess?.();
          resolve({ walletAddress: data.address });
        },
        (err) => {
          clearTimeout(timeout);
          activeSessionId = null;
          resolve({ error: err?.message ?? "Login failed" });
        }
      );

      const authUrl = `${baseUrl}/auth?session=${encodeURIComponent(sessionId)}`;
      shell.openExternal(authUrl);
    });

    return result;
  });

  ipcMain.handle("auth:logout", () => {
    clearSession();
  });
}

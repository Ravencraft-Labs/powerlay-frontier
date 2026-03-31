/**
 * Auth context: session state and actions.
 * States: unauthenticated | authInProgress | authenticated | authExpired | authFailed.
 * Restores session on mount; exposes login/logout.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type AuthStatus = "unauthenticated" | "authInProgress" | "authenticated" | "authExpired" | "authFailed";

export interface AuthSession {
  walletAddress: string;
  sessionId?: string;
  expiresAt?: number;
  tribeId?: string;
  tribeName?: string;
  tribeResolvedAt?: number;
  /** Set after successful tribe/chain resolve (same session file the main process uses). */
  characterId?: string;
  characterName?: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  status: AuthStatus;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Re-read session.json (e.g. after tribe resolve updates character/tribe on disk). */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("unauthenticated");
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const s = await window.efOverlay?.auth?.getSession();
    if (s?.walletAddress) {
      setSession({
        walletAddress: s.walletAddress,
        sessionId: s.sessionId,
        expiresAt: s.expiresAt,
        tribeId: s.tribeId,
        tribeName: s.tribeName,
        tribeResolvedAt: s.tribeResolvedAt,
        characterId: s.characterId,
        characterName: s.characterName,
      });
      setStatus("authenticated");
      setError(null);
    } else {
      setSession(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const login = useCallback(async () => {
    if (!window.efOverlay?.auth?.login) return;
    setStatus("authInProgress");
    setError(null);
    try {
      const result = await window.efOverlay.auth.login();
      if ("walletAddress" in result) {
        await loadSession();
        setStatus("authenticated");
        setError(null);
      } else {
        setStatus("authFailed");
        setError(result.error ?? "Login failed");
      }
    } catch (err) {
      setStatus("authFailed");
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }, [loadSession]);

  const logout = useCallback(async () => {
    await window.efOverlay?.auth?.logout?.();
    setSession(null);
    setStatus("unauthenticated");
    setError(null);
  }, []);

  const cancel = useCallback(async () => {
    await window.efOverlay?.auth?.cancel?.();
    /* login() promise will resolve with error and set authFailed */
  }, []);

  const value: AuthContextValue = {
    session,
    status,
    error,
    login,
    logout,
    cancel,
    refreshSession: loadSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

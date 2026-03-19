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
}

interface AuthContextValue {
  session: AuthSession | null;
  status: AuthStatus;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  cancel: () => Promise<void>;
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
      setSession(s);
      setStatus("authenticated");
      setError(null);
    } else {
      setSession(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async () => {
    if (!window.efOverlay?.auth?.login) return;
    setStatus("authInProgress");
    setError(null);
    try {
      const result = await window.efOverlay.auth.login();
      if ("walletAddress" in result) {
        setSession({ walletAddress: result.walletAddress });
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
  }, []);

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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

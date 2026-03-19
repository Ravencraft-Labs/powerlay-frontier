/**
 * Wallet auth UI: Login button, connecting state, authenticated state, logout.
 * Delegates to AuthContext; no business logic.
 */
import React from "react";
import { useAuth } from "../context/AuthContext.js";

function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export function WalletLoginButton() {
  const { session, status, error, login, logout, cancel } = useAuth();

  if (status === "authInProgress") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Connecting...</span>
        <button
          type="button"
          className="px-3 py-1.5 text-sm border border-border rounded hover:bg-surface"
          onClick={cancel}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (status === "authenticated" && session) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{truncateAddress(session.walletAddress)}</span>
        <button
          type="button"
          className="px-3 py-1.5 text-sm border border-border rounded hover:bg-surface"
          onClick={logout}
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="px-4 py-2 text-sm font-medium border border-border rounded hover:bg-surface"
      onClick={login}
      title={error ?? undefined}
    >
      Login wallet
    </button>
  );
}

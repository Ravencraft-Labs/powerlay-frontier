/**
 * Wallet auth UI: Login button, connecting state, authenticated state, logout.
 * Delegates to AuthContext; no business logic.
 */
import React, { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext.js";

function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function WalletLoginButton() {
  const { session, status, error, login, logout, cancel } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!session?.walletAddress) return;
    const ok = await copyToClipboard(session.walletAddress);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [session?.walletAddress]);

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
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <span className="text-sm text-muted font-mono tabular-nums" title={session.walletAddress}>
          {truncateAddress(session.walletAddress)}
        </span>
        <button
          type="button"
          className="px-2 py-1.5 text-xs border border-border-input rounded hover:bg-surface text-muted hover:text-text"
          onClick={() => void copyAddress()}
          title="Copy full wallet address (for scripts / GraphQL debug)"
        >
          {copied ? "Copied" : "Copy address"}
        </button>
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

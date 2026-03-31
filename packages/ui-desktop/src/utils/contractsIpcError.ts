/**
 * Maps IPC/rejected errors from contracts:create-draft (and similar) into UI copy.
 * Main process throws Error(CONTRACTS_AUTH_REQUIRED) or JSON.stringify({ code, message }).
 */

/** Electron may wrap IPC failures so `error.message` is not pure JSON; extract `{...}` if needed. */
function tryParseContractsPayload(raw: string): { message?: string; code?: string; httpStatus?: number } | null {
  const s = raw.trim();
  try {
    return JSON.parse(s) as { message?: string; code?: string; httpStatus?: number };
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1)) as { message?: string; code?: string; httpStatus?: number };
      } catch {
        return null;
      }
    }
    return null;
  }
}

function looksLikeNetworkFailure(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("econnrefused") ||
    m.includes("enotfound") ||
    m.includes("network") ||
    m.includes("timed out") ||
    m.includes("aborted")
  );
}

export function contractsErrorForUi(e: unknown, authHint = "Sign in with your wallet to continue."): { auth: boolean; message: string } {
  if (!(e instanceof Error)) {
    return { auth: false, message: "Request failed." };
  }
  if (e.message === "CONTRACTS_AUTH_REQUIRED") {
    return { auth: true, message: authHint };
  }
  const j = tryParseContractsPayload(e.message);
  if (j) {
    if (j.code === "CONTRACT_NOT_VISIBLE" || j.code === "FORBIDDEN") {
      return {
        auth: false,
        message: j.message?.trim() || "This contract is not visible to you. It may require tribe access or be private.",
      };
    }
    let text = j.message ?? "Request failed.";
    if (typeof j.httpStatus === "number" && text.length < 200) {
      text = `${text} (HTTP ${j.httpStatus})`;
    }
    if (text.includes("Traceback") || text.length > 400) {
      text =
        j.code && j.code !== "UNKNOWN"
          ? `Server error (${j.code}). If the API is running, try again in a moment.`
          : "Server error. The API responded with an error; try again or check server logs.";
    }
    return { auth: false, message: text };
  }
  if (e.message.length > 0 && e.message.length < 400) {
    return {
      auth: false,
      message: looksLikeNetworkFailure(e.message)
        ? "Could not reach the Contracts service. Check your network or POWERLAY_API_BASE."
        : e.message,
    };
  }
  return {
    auth: false,
    message: looksLikeNetworkFailure(e.message)
      ? "Could not reach the Contracts service. Check your network or POWERLAY_API_BASE."
      : "The contracts request failed. If the API is running, try again; long errors are hidden in the UI.",
  };
}

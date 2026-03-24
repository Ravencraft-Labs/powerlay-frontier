import React, { useCallback, useEffect, useState } from "react";
import type { ContractBrowseSummary } from "@powerlay/core";
import { comparePriority } from "./contractsOverlayUtils";
import { OverlayFrame } from "../components/OverlayFrame";
import { useEfOverlay } from "../hooks/useEfOverlay";

function sortSummaries(list: ContractBrowseSummary[]): ContractBrowseSummary[] {
  return [...list].sort((a, b) => {
    const pr = comparePriority(a.contract.priority, b.contract.priority);
    if (pr !== 0) return pr;
    return b.contract.updatedAt - a.contract.updatedAt;
  });
}

export function ContractsOverlay() {
  const api = useEfOverlay();
  const [rows, setRows] = useState<ContractBrowseSummary[]>([]);
  const [backendOffline, setBackendOffline] = useState(false);

  const checkBackend = useCallback(async () => {
    const c = api?.contracts;
    if (!c?.getBackendStatus) {
      setBackendOffline(false);
      return;
    }
    try {
      const s = await c.getBackendStatus();
      setBackendOffline(s.mode === "http" && !s.connected);
    } catch {
      setBackendOffline(true);
    }
  }, [api?.contracts]);

  const load = useCallback(async () => {
    const c = api?.contracts;
    if (!c) {
      setRows([]);
      return;
    }
    try {
      const session = await api?.auth?.getSession?.().catch(() => null);
      const visibility = session?.tribeId ? [] : (["public"] as const);
      const list = await c.search({
        query: "",
        filterMode: "title",
        visibility,
        priority: "all",
      });
      setRows(sortSummaries(list).slice(0, 12));
    } catch (err) {
      console.error(err);
    }
  }, [api?.contracts, api?.auth]);

  useEffect(() => {
    void checkBackend();
    const id = setInterval(() => void checkBackend(), 30000);
    return () => clearInterval(id);
  }, [checkBackend]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const vis = (v: string) => (v === "tribe" ? "Tribe" : v === "alliance" ? "Alliance" : "Public");

  return (
    <OverlayFrame
      title={
        <>
          Contracts{" "}
          <span className="inline-flex items-center px-1.5 py-0.5 text-[0.65rem] rounded border border-border/70 bg-surface/80 text-muted select-none cursor-default" role="status">
            Overlay
          </span>
        </>
      }
    >
      {(locked) => (
        <>
          {backendOffline && (
            <div
              className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[0.7rem] text-text overlay-no-drag"
              role="alert"
            >
              <div className="font-medium">Cannot connect to the Powerlay backend</div>
            </div>
          )}
          <ul className="list-none p-0 m-0 max-h-[min(60vh,420px)] overflow-y-auto">
          {rows.length === 0 ? (
            <li className="py-1.5 text-muted italic text-[0.8rem]">No open contracts</li>
          ) : (
            rows.map(({ contract: c, progressPercent }) => (
              <li key={c.id} className="py-1.5 border-b border-border/50 last:border-b-0 text-[0.8rem] flex flex-col gap-0.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-medium text-text truncate">{c.title}</span>
                  <span className="shrink-0 text-muted">{progressPercent}%</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[0.65rem] text-muted">
                  <span className="px-1 rounded bg-border-input/80">{vis(c.visibility)}</span>
                  <span>{c.priority}</span>
                  <span className="truncate">{c.targetStarSystem}</span>
                </div>
                {!locked && api?.contracts && (
                  <div className="flex gap-1 pt-0.5">
                    <button
                      type="button"
                      className="overlay-no-drag px-2 py-0.5 text-[0.7rem] rounded border border-border-input bg-bg hover:bg-border"
                      onClick={() => api.contracts!.join(c.id).then(load)}
                    >
                      Join
                    </button>
                    <button
                      type="button"
                      className="overlay-no-drag px-2 py-0.5 text-[0.7rem] rounded border border-border-input bg-bg hover:bg-border text-muted"
                      onClick={() => api.contracts!.hide(c.id).then(load)}
                    >
                      Hide
                    </button>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
        </>
      )}
    </OverlayFrame>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import type { ContractBrowseSummary, ContractResourceLine } from "@powerlay/core";
import { OverlayFrame } from "../components/OverlayFrame";
import { useEfOverlay } from "../hooks/useEfOverlay";

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
}

function ResourceLineBar({ line }: { line: ContractResourceLine }) {
  const pct = line.requiredAmount > 0
    ? Math.min(1, line.deliveredAmount / line.requiredAmount)
    : 0;
  const done = pct >= 1;
  return (
    <div className="flex items-center gap-2 text-[0.75rem]">
      <span className={`min-w-[80px] truncate ${done ? "text-muted" : "text-text"}`}>
        {line.resourceName}
      </span>
      <div className="flex-1 min-w-0 h-1 rounded-full bg-border/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-muted" : "bg-blue-500"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-muted tabular-nums">
        {formatCompact(line.deliveredAmount)} / {formatCompact(line.requiredAmount)}
      </span>
    </div>
  );
}

function ContractProgressCard({ summary }: { summary: ContractBrowseSummary }) {
  const { contract: c, progressPercent } = summary;
  const statusLabel = c.status === "in_progress" ? "active" : c.status;
  return (
    <li className="py-1.5 border-b border-border/50 last:border-b-0 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[0.8rem]">
        <span className="min-w-0 font-medium text-text truncate">{c.title}</span>
        <span className="shrink-0 text-muted tabular-nums">{progressPercent}%</span>
      </div>
      <div className="flex items-center gap-1 text-[0.65rem] text-muted mb-0.5">
        <span className="px-1 rounded bg-border-input/80">{statusLabel}</span>
        <span className="truncate">{c.targetStarSystem || "—"}</span>
      </div>
      <div className="flex flex-col gap-1">
        {c.lines.map((line) => (
          <ResourceLineBar key={line.id} line={line} />
        ))}
      </div>
    </li>
  );
}

export function ContractsOverlay() {
  const api = useEfOverlay();
  const [joinedRows, setJoinedRows] = useState<ContractBrowseSummary[]>([]);
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
      setJoinedRows([]);
      return;
    }
    try {
      const joined = await c.listMyContracts?.("joined").catch(() => [] as ContractBrowseSummary[]);
      setJoinedRows(
        (joined ?? []).filter(
          (r) => r.contract.status === "published" || r.contract.status === "in_progress"
        )
      );
    } catch (err) {
      console.error(err);
    }
  }, [api?.contracts]);

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
      {() => (
        <>
          {backendOffline && (
            <div
              className="mb-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[0.7rem] text-text overlay-no-drag"
              role="alert"
            >
              <div className="font-medium">Cannot connect to the Powerlay backend</div>
            </div>
          )}
          {joinedRows.length === 0 ? (
            <p className="py-1.5 text-muted italic text-[0.8rem] m-0">
              No active joined contracts. Use the Contracts section to find and join contracts.
            </p>
          ) : (
            <ul className="list-none p-0 m-0">
              {joinedRows.map((row) => (
                <ContractProgressCard key={row.contract.id} summary={row} />
              ))}
            </ul>
          )}
        </>
      )}
    </OverlayFrame>
  );
}

import React from "react";
import type { ContractBrowseSummary } from "@powerlay/core";
import { comparePriority, statusLabel, visibilityLabel, walletMatches } from "../../utils/contractsUi";
import { ContractExpandedDetails } from "./ContractExpandedDetails";

export interface ContractCardRowProps {
  /** Find: Join/Hide on row. My: chevron + progress only (creator list). */
  variant?: "find" | "my";
  summary: ContractBrowseSummary;
  expanded: boolean;
  onToggleExpand: () => void;
  callsign: string;
  userWallet: string | null;
  onJoin: () => void;
  onHide: () => void;
  joining: boolean;
  assigneeMatch: boolean;
  /** Error loading detail (e.g. CONTRACT_NOT_VISIBLE). */
  detailError?: string;
  canFinish?: boolean;
  canCancel?: boolean;
  onFinish?: () => void;
  onCancel?: () => void;
  onStatistics?: () => void;
  onViewLogs?: () => void;
  actionBusy?: boolean;
  /** UI-only: auto-refresh state for polling. */
  autoRefresh?: boolean;
  onAutoRefreshToggle?: (next: boolean) => void;
  deliveryTxContext?: { ssuObjectId: string; connectTxDigest?: string } | null;
  onRefreshContractDetail?: () => Promise<void>;
  onRefreshBalance?: () => void;
}

export function ContractCardRow({
  variant = "find",
  summary,
  expanded,
  onToggleExpand,
  callsign,
  userWallet,
  onJoin,
  onHide,
  joining,
  assigneeMatch,
  detailError,
  canFinish,
  canCancel,
  onFinish,
  onCancel,
  onStatistics,
  onViewLogs,
  actionBusy,
  autoRefresh,
  onAutoRefreshToggle,
  deliveryTxContext,
  onRefreshContractDetail,
  onRefreshBalance,
}: ContractCardRowProps) {
  const c = summary.contract;
  const isParticipant = userWallet != null && c.participants.some((p) => walletMatches(p.walletAddress, userWallet));
  const isMy = variant === "my";

  const priorityColor =
    c.priority === "high" ? "text-destructive" : c.priority === "medium" ? "text-accent" : "text-emerald-400";

  const miniBtn =
    "cursor-pointer px-2 py-1 rounded border border-border-input bg-border text-text text-xs hover:bg-surface shrink-0";

  return (
    <li className="rounded-lg border border-border bg-surface/80 overflow-hidden">
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2 cursor-pointer hover:bg-border/30"
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span className={`font-medium text-sm min-w-0 truncate ${priorityColor}`}>{c.title}</span>
        <span className="text-[0.65rem] uppercase px-1.5 py-0.5 rounded border border-border/60 text-muted shrink-0">{visibilityLabel(c.visibility)}</span>
        <span className="text-[0.65rem] text-muted shrink-0">{c.priority} priority</span>
        <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-border-input shrink-0">{statusLabel(c.status)}</span>
        {assigneeMatch && <span className="text-[0.65rem] text-accent shrink-0">Assigned to you</span>}
        <span className="text-xs text-muted ml-auto shrink-0">{summary.progressPercent}%</span>
        {!isMy && (
          <>
            <button
              type="button"
              className={miniBtn}
              onClick={(e) => {
                e.stopPropagation();
                onJoin();
              }}
              disabled={joining || isParticipant || c.status === "completed" || c.status === "canceled"}
            >
              {isParticipant ? "Joined" : "Join"}
            </button>
            <button
              type="button"
              className={miniBtn}
              onClick={(e) => {
                e.stopPropagation();
                onHide();
              }}
            >
              Hide
            </button>
          </>
        )}
        <span className="text-muted text-xs">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded &&
        (detailError ? (
          <div className="px-3 py-2 border-t border-border/60 text-sm text-destructive" role="alert">
            {detailError}
          </div>
        ) : (
          <div className="px-3 pb-3">
            <ContractExpandedDetails
              summary={summary}
              mode={isMy ? "creator" : "participant"}
              callsign={callsign}
              userWallet={userWallet}
              isParticipant={isParticipant}
              assigneeMatch={assigneeMatch}
              onJoin={onJoin}
              onHide={onHide}
              joining={joining}
              canFinish={isMy ? canFinish : undefined}
              canCancel={isMy ? canCancel : undefined}
              onFinish={isMy ? onFinish : undefined}
              onCancel={isMy ? onCancel : undefined}
              onStatistics={isMy ? onStatistics : undefined}
              onViewLogs={isMy ? onViewLogs : undefined}
              actionBusy={isMy ? actionBusy : undefined}
              autoRefresh={autoRefresh}
              onAutoRefreshToggle={onAutoRefreshToggle}
              deliveryTxContext={deliveryTxContext}
              onRefreshContractDetail={onRefreshContractDetail}
              onRefreshBalance={onRefreshBalance}
            />
          </div>
        ))}
    </li>
  );
}

export function sortBrowseSummaries(list: ContractBrowseSummary[]): ContractBrowseSummary[] {
  return [...list].sort((a, b) => {
    const pr = comparePriority(a.contract.priority, b.contract.priority);
    if (pr !== 0) return pr;
    return b.contract.updatedAt - a.contract.updatedAt;
  });
}

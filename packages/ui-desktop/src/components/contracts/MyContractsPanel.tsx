import React, { useCallback, useEffect, useState } from "react";
import type { ContractBrowseSummary, LogisticsContract } from "@powerlay/core";
import type { ConnectedStorage, ContractLogEntry } from "../../preload";
import {
  contractProgressPercent,
  contractRewardCapTokens,
  contractRewardProgressTokens,
  lineProgressPercent,
  tokensForDeliveredAmount,
} from "@powerlay/core";
import type { ContractsClient } from "../../services/contracts/contractsClient";
import { useContractBackendPoll } from "../../hooks/contracts/useContractBackendPoll";
import { contractsErrorForUi } from "../../utils/contractsIpcError";
import { ContractCardRow, sortBrowseSummaries } from "./ContractCardRow";
import { loadStoredCallsign, saveStoredCallsign, callsignMatchesLine, walletMatches, loadAutoRefreshIds, saveAutoRefreshIds } from "../../utils/contractsUi";
import { formatWithThousandsSeparator } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";
import { DemoModal } from "../DemoModal";
import { ItemIcon } from "../ItemIcon";

const BUCKETS = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "published_by_me", label: "Published" },
  { id: "removed_by_me", label: "Canceled" },
  { id: "joined", label: "Joined" },
  { id: "hidden", label: "Hidden" },
] as const;

const btnCls =
  "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed";
const tabCls = (on: boolean) =>
  `px-2 py-1 text-xs font-medium rounded border ${
    on ? "border-selection-bg bg-selection-bg/15 text-text" : "border-transparent text-muted hover:text-text"
  }`;

const EVENT_BADGE: Record<string, string> = {
  status_change: "bg-border text-muted",
  contribution: "bg-emerald-900/40 text-emerald-300",
  mint: "bg-emerald-900/40 text-emerald-300",
  ssu_event: "bg-accent/15 text-accent",
  burn: "bg-amber-900/40 text-amber-300",
};

function resolveActor(entry: ContractLogEntry): string | null {
  if (entry.actorName) return entry.actorName;
  if (entry.actorWallet) return `${entry.actorWallet.slice(0, 10)}…`;
  if (entry.actorCharacterId) return `char ${entry.actorCharacterId.slice(0, 8)}…`;
  // last resort: scan the raw data blob for any wallet/nickname-like key
  const raw = entry.raw as Record<string, unknown> | null | undefined;
  if (raw && typeof raw === "object") {
    for (const key of ["sender_wallet", "actor_wallet", "wallet", "actor_nickname", "nickname"]) {
      const v = raw[key];
      if (typeof v === "string" && v.trim()) {
        return key.includes("wallet") ? `${v.trim().slice(0, 10)}…` : v.trim();
      }
    }
  }
  return null;
}

function ContractLogRow({ entry }: { entry: ContractLogEntry }) {
  const badgeCls = EVENT_BADGE[entry.eventType] ?? "bg-border text-muted";
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—";
  const actor = resolveActor(entry);

  return (
    <li className="flex gap-2 text-xs rounded-md border border-border/50 bg-bg px-3 py-2">
      <span className="text-muted shrink-0 tabular-nums w-36">{ts}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[0.65rem] font-medium ${badgeCls}`}>
        {entry.eventType}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
          {entry.description && <span className="text-text">{entry.description}</span>}
          {entry.fromStatus && entry.toStatus && (
            <span className="text-muted">{entry.fromStatus} → {entry.toStatus}</span>
          )}
          {entry.resourceName && (
            <span className="text-muted">
              {entry.resourceName}
              {entry.quantity != null && (
                <span className="tabular-nums ml-1">×{formatWithThousandsSeparator(Math.round(entry.quantity))}</span>
              )}
            </span>
          )}
        </span>
        {actor && (
          <span className="text-accent/80 font-medium">by {actor}</span>
        )}
        {!actor && (
          <span className="text-muted italic">actor unknown</span>
        )}
        {entry.txHash && (
          <span className="text-muted font-mono">{entry.txHash.slice(0, 12)}…</span>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Participant statistics helpers
// ---------------------------------------------------------------------------

const PARTICIPANT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

interface ParticipantStat {
  key: string;
  displayName: string;
  totalDelivered: number;
  byResource: Record<string, number>;
  color: string;
}

function buildParticipantStats(logs: ContractLogEntry[]): ParticipantStat[] {
  const map = new Map<string, Omit<ParticipantStat, "color">>();
  for (const entry of logs) {
    if (entry.eventType !== "contribution") continue;
    const qty = entry.quantity ?? 0;
    if (qty <= 0) continue;
    const key = entry.actorWallet ?? entry.actorName ?? "unknown";
    const name = entry.actorName
      || (entry.actorWallet ? `${entry.actorWallet.slice(0, 10)}…` : "Unknown");
    if (!map.has(key)) map.set(key, { key, displayName: name, totalDelivered: 0, byResource: {} });
    const ps = map.get(key)!;
    ps.totalDelivered += qty;
    const res = entry.resourceName ?? "?";
    ps.byResource[res] = (ps.byResource[res] ?? 0) + qty;
  }
  return [...map.values()]
    .sort((a, b) => b.totalDelivered - a.totalDelivered)
    .map((ps, i) => ({ ...ps, color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length] }));
}

function DeliveryPieChart({ stats }: { stats: ParticipantStat[] }) {
  const total = stats.reduce((s, p) => s + p.totalDelivered, 0);
  if (total === 0 || stats.length === 0) return null;

  const cx = 60, cy = 60, r = 52, innerR = 28;
  let angle = -Math.PI / 2;
  const slices = stats.map((p) => {
    const fraction = p.totalDelivered / total;
    const start = angle;
    const end = angle + fraction * 2 * Math.PI;
    angle = end;
    const cos1 = Math.cos(start), sin1 = Math.sin(start);
    const cos2 = Math.cos(end),   sin2 = Math.sin(end);
    const largeArc = fraction > 0.5 ? 1 : 0;
    const path = [
      `M ${cx + innerR * cos1} ${cy + innerR * sin1}`,
      `L ${cx + r * cos1} ${cy + r * sin1}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${cx + r * cos2} ${cy + r * sin2}`,
      `L ${cx + innerR * cos2} ${cy + innerR * sin2}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${cx + innerR * cos1} ${cy + innerR * sin1}`,
      "Z",
    ].join(" ");
    return { ...p, path, pct: Math.round(fraction * 100) };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        {slices.map((s) => (
          <path key={s.key} d={s.path} fill={s.color} />
        ))}
      </svg>
      <ul className="list-none m-0 p-0 flex flex-col gap-1 min-w-0">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-xs min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="truncate text-text">{s.displayName}</span>
            <span className="text-muted tabular-nums shrink-0">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface MyContractsPanelProps {
  client: ContractsClient;
  onRefreshBalance?: () => void;
}

function hasAnyDelivery(c: LogisticsContract): boolean {
  return c.lines.some((l) => l.deliveredAmount > 0);
}

export function MyContractsPanel({ client, onRefreshBalance }: MyContractsPanelProps) {
  const { session } = useAuth();
  const userWallet = session?.walletAddress ?? null;
  const [bucket, setBucket] = useState<string>("all");
  const [list, setList] = useState<ContractBrowseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [deliveryStatsFor, setDeliveryStatsFor] = useState<{
    id: string;
    title: string;
    summary: ContractBrowseSummary | null;
  } | null>(null);
  const [statsLogs, setStatsLogs] = useState<ContractLogEntry[]>([]);
  const [statsLogsLoading, setStatsLogsLoading] = useState(false);
  const [logsFor, setLogsFor] = useState<{ id: string; title: string } | null>(null);
  const [logEntries, setLogEntries] = useState<ContractLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [finishConfirmFor, setFinishConfirmFor] = useState<{ id: string; summary: ContractBrowseSummary } | null>(null);
  const [cancelConfirmFor, setCancelConfirmFor] = useState<{ id: string; summary: ContractBrowseSummary } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, ContractBrowseSummary["contract"]>>({});
  const [detailErrorById, setDetailErrorById] = useState<Record<string, string>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [callsign, setCallsign] = useState(loadStoredCallsign);
  const [autoRefreshIds, setAutoRefreshIds] = useState<Set<string>>(loadAutoRefreshIds);
  const [connectedStorages, setConnectedStorages] = useState<ConnectedStorage[]>([]);

  useEffect(() => {
    if (!window.efOverlay?.storage?.listConnected) return;
    void window.efOverlay.storage
      .listConnected()
      .then(setConnectedStorages)
      .catch(() => setConnectedStorages([]));
  }, [expandedId, bucket]);

  const setCallsignPersist = (v: string) => {
    setCallsign(v);
    saveStoredCallsign(v);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    setDetailById({});
    setDetailErrorById({});
    try {
      const raw = await client.listMyContracts(bucket === "all" ? undefined : bucket);
      setList(sortBrowseSummaries(raw));
    } catch (e) {
      console.error(e);
      setBanner(contractsErrorForUi(e).message);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [client, bucket]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!expandedId) return;
    let cancelled = false;
    setDetailErrorById((prev) => {
      const next = { ...prev };
      delete next[expandedId];
      return next;
    });
    client
      .get(expandedId)
      .then((c) => {
        if (cancelled) return;
        if (c) setDetailById((prev) => ({ ...prev, [expandedId]: c }));
      })
      .catch((e) => {
        if (cancelled) return;
        setDetailErrorById((prev) => ({ ...prev, [expandedId]: contractsErrorForUi(e).message }));
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId, client]);

  const expandedContract = expandedId
    ? detailById[expandedId] ?? list.find((x) => x.contract.id === expandedId)?.contract
    : null;
  const pollExpandedDetail =
    !!expandedId &&
    !!expandedContract &&
    (expandedContract.status === "published" || expandedContract.status === "in_progress") &&
    !!expandedContract.targetSsuId?.trim() &&
    autoRefreshIds.has(expandedId);

  useContractBackendPoll(client, expandedId, pollExpandedDetail, (c) => {
    setDetailById((prev) => ({ ...prev, [c.id]: c }));
  });

  const summaryForRow = (summary: ContractBrowseSummary): ContractBrowseSummary => {
    const full = detailById[summary.contract.id];
    if (!full) return summary;
    return {
      contract: full,
      progressPercent: contractProgressPercent(full),
      rewardProgressTokens: contractRewardProgressTokens(full),
      rewardCapTokens: contractRewardCapTokens(full),
    };
  };

  const toggleAutoRefresh = (id: string, on: boolean) => {
    setAutoRefreshIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      saveAutoRefreshIds(next);
      return next;
    });
  };

  const assigneeMatchFor = (contractId: string) => {
    const c = detailById[contractId] ?? list.find((x) => x.contract.id === contractId)?.contract;
    if (!c || !callsign.trim()) return false;
    return c.lines.some((l) => callsignMatchesLine(l.assigneeText, callsign));
  };

  const runFinish = async (id: string) => {
    setActionId(id);
    setBanner(null);
    try {
      await client.completeContract(id);
      toggleAutoRefresh(id, false);
      await load();
      onRefreshBalance?.();
    } catch (e) {
      console.error(e);
      setBanner(contractsErrorForUi(e).message);
    } finally {
      setActionId(null);
    }
  };

  const runCancel = async (id: string) => {
    setActionId(id);
    setBanner(null);
    try {
      await client.cancel(id);
      toggleAutoRefresh(id, false);
      await load();
      onRefreshBalance?.();
    } catch (e) {
      console.error(e);
      setBanner(contractsErrorForUi(e).message);
    } finally {
      setActionId(null);
    }
  };

  const handleJoin = async (contractId: string) => {
    setJoiningId(contractId);
    try {
      await client.join(contractId, callsign.trim() || undefined);
      setDetailById((d) => {
        const next = { ...d };
        delete next[contractId];
        return next;
      });
      await load();
      onRefreshBalance?.();
    } catch (e) {
      console.error(e);
    } finally {
      setJoiningId(null);
    }
  };

  const handleHide = async (contractId: string) => {
    try {
      await client.hide(contractId);
      setExpandedId((id) => (id === contractId ? null : id));
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const isCreatorBucket = ["all", "drafts", "published_by_me", "removed_by_me"].includes(bucket);
  const showCallsignHint = bucket === "joined" || bucket === "hidden" || bucket === "all";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted m-0 leading-relaxed">
        {isCreatorBucket
          ? "Contracts you created. Expand a row for full detail. Finish after delivery; Cancel only when nothing was delivered. SSU tracking can be toggled after publish."
          : bucket === "joined"
            ? "Contracts you joined as a participant."
            : bucket === "hidden"
              ? "Contracts you hid from discovery."
              : "Your contracts."}
      </p>

      <div className="flex flex-wrap gap-1 p-0.5 rounded-lg bg-border/40 border border-border/60 w-fit">
        {BUCKETS.map((b) => (
          <button key={b.id} type="button" className={tabCls(bucket === b.id)} onClick={() => setBucket(b.id)}>
            {b.label}
          </button>
        ))}
      </div>

      {showCallsignHint && (
        <label className="flex flex-col gap-1 flex-1 min-w-[160px] text-xs text-muted max-w-sm">
          Your callsign (optional — for Join / assignee match on non-owned contracts)
          <input
            className="px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted"
            value={callsign}
            onChange={(e) => setCallsignPersist(e.target.value)}
            placeholder="Match assignee text"
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className={btnCls} disabled={loading} onClick={() => load()}>
          Refresh
        </button>
      </div>

      {banner && <p className="text-sm text-destructive m-0">{banner}</p>}

      {loading ? (
        <p className="text-sm text-muted m-0">Loading your contracts…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted m-0">No contracts found for your account. Publish from Create contract or check the API.</p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {list.map((row) => {
            const c = row.contract;
            const merged = summaryForRow(row);
            const dc = merged.contract;
            const isCreator = Boolean(userWallet && walletMatches(dc.createdByWallet, userWallet));
            const pct = contractProgressPercent(dc);
            const delivered = hasAnyDelivery(dc);
            const active = dc.status === "published" || dc.status === "in_progress";
            const canFinish = isCreator && active && (delivered || pct >= 100);
            const canCancel = isCreator && active && !delivered && pct < 100;
            const busy = actionId === dc.id;

            const sid = dc.targetSsuId?.trim() ?? "";
            const hit = sid ? connectedStorages.find((s) => s.ssuObjectId === sid) : undefined;
            const connDigest = hit?.txHash?.trim();
            const deliveryTxContext = sid ? { ssuObjectId: sid, ...(connDigest ? { connectTxDigest: connDigest } : {}) } : null;

            return (
              <ContractCardRow
                key={c.id}
                variant={isCreator ? "my" : "find"}
                summary={merged}
                expanded={expandedId === c.id}
                onToggleExpand={() => setExpandedId((id) => (id === c.id ? null : c.id))}
                callsign={callsign}
                userWallet={userWallet}
                onJoin={() => handleJoin(c.id)}
                onHide={() => handleHide(c.id)}
                joining={joiningId === c.id}
                assigneeMatch={assigneeMatchFor(c.id)}
                detailError={detailErrorById[c.id]}
                autoRefresh={autoRefreshIds.has(c.id)}
                onAutoRefreshToggle={(next) => toggleAutoRefresh(c.id, next)}
                canFinish={isCreator ? canFinish : undefined}
                canCancel={isCreator ? canCancel : undefined}
                onFinish={isCreator ? () => setFinishConfirmFor({ id: dc.id, summary: merged }) : undefined}
                onCancel={isCreator ? () => setCancelConfirmFor({ id: dc.id, summary: merged }) : undefined}
                onStatistics={isCreator ? () => {
                  setDeliveryStatsFor({ id: dc.id, title: dc.title, summary: merged });
                  setStatsLogs([]);
                  setStatsLogsLoading(true);
                  client.getLogs(dc.id)
                    .then((entries) => setStatsLogs(entries))
                    .catch(console.error)
                    .finally(() => setStatsLogsLoading(false));
                } : undefined}
                onViewLogs={isCreator ? () => {
                  setLogsFor({ id: dc.id, title: dc.title });
                  setLogEntries([]);
                  setLogsLoading(true);
                  client.getLogs(dc.id).then((entries) => {
                    setLogEntries(entries);
                  }).catch((e) => {
                    console.error("[contract-logs]", e);
                  }).finally(() => {
                    setLogsLoading(false);
                  });
                } : undefined}
                actionBusy={isCreator ? busy : undefined}
                deliveryTxContext={deliveryTxContext}
                onRefreshContractDetail={async () => {
                  const fresh = await client.get(dc.id);
                  if (fresh) setDetailById((prev) => ({ ...prev, [dc.id]: fresh }));
                }}
                onRefreshBalance={onRefreshBalance}
              />
            );
          })}
        </ul>
      )}

      {finishConfirmFor && (() => {
        const { id, summary } = finishConfirmFor;
        const c = summary.contract;
        const earned = contractRewardProgressTokens(c);
        const cap = contractRewardCapTokens(c);
        const unearned = Math.max(0, cap - earned);
        const busy = actionId === id;
        return (
          <DemoModal
            title="Finish contract"
            titleId="finish-contract-confirm-title"
            onClose={() => setFinishConfirmFor(null)}
            panelClassName="max-w-md w-full"
            footer={
              <button
                type="button"
                className="cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={busy}
                onClick={() => {
                  setFinishConfirmFor(null);
                  void runFinish(id);
                }}
              >
                {busy ? "Working…" : "Confirm finish"}
              </button>
            }
          >
            <p className="text-xs text-muted m-0 mb-4">
              <span className="text-text font-medium">{c.title}</span>
            </p>
            <div className="rounded-md border border-border/60 overflow-hidden mb-4">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr className="border-b border-border/40">
                    <td className="px-3 py-2 text-muted">Tokens earned by deliverers</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-400 font-medium">
                      {formatWithThousandsSeparator(Math.round(earned))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted">Unearned tokens returned to you</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text font-medium">
                      {formatWithThousandsSeparator(Math.round(unearned))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted m-0">
              Undelivered lines will stop accepting contributions. This action cannot be undone.
            </p>
          </DemoModal>
        );
      })()}

      {cancelConfirmFor && (() => {
        const { id, summary } = cancelConfirmFor;
        const c = summary.contract;
        const cap = contractRewardCapTokens(c);
        const busy = actionId === id;
        return (
          <DemoModal
            title="Cancel listing"
            titleId="cancel-contract-confirm-title"
            onClose={() => setCancelConfirmFor(null)}
            panelClassName="max-w-md w-full"
            footer={
              <button
                type="button"
                className="cursor-pointer px-3 py-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={busy}
                onClick={() => {
                  setCancelConfirmFor(null);
                  void runCancel(id);
                }}
              >
                {busy ? "Working…" : "Cancel listing"}
              </button>
            }
          >
            <p className="text-xs text-muted m-0 mb-4">
              <span className="text-text font-medium">{c.title}</span>
            </p>
            <div className="rounded-md border border-border/60 overflow-hidden mb-4">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr className="border-b border-border/40">
                    <td className="px-3 py-2 text-muted">Reserved tokens returned to you</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text font-medium">
                      {formatWithThousandsSeparator(Math.round(cap))}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-muted">Tokens already paid to deliverers</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">0</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-destructive/80 m-0">
              Only cancel if nothing has been delivered. The listing will be permanently removed.
            </p>
          </DemoModal>
        );
      })()}

      {logsFor && (
        <DemoModal
          title="Event log"
          titleId="my-contract-event-log-title"
          onClose={() => setLogsFor(null)}
          panelClassName="max-w-2xl w-full"
        >
          <p className="text-xs text-muted m-0 mb-3">
            <span className="text-text font-medium">{logsFor.title}</span>
            <span className="text-muted">
              {" · "}
              {logsFor.id.length > 12 ? `${logsFor.id.slice(0, 8)}…` : logsFor.id}
            </span>
          </p>
          <div className="overflow-y-auto max-h-[55vh] pr-1">
            {logsLoading ? (
              <p className="text-sm text-muted m-0">Loading events…</p>
            ) : logEntries.length === 0 ? (
              <p className="text-sm text-muted m-0">No events recorded yet for this contract.</p>
            ) : (
              <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                {logEntries.map((entry) => (
                  <ContractLogRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </div>
        </DemoModal>
      )}

      {deliveryStatsFor && (() => {
        const sum = deliveryStatsFor.summary;
        const lines = sum?.contract.lines ?? [];
        const participantStats = buildParticipantStats(statsLogs);
        const totalDelivered = participantStats.reduce((s, p) => s + p.totalDelivered, 0);

        return (
          <DemoModal
            title="Delivery statistics"
            titleId="my-contract-delivery-stats-title"
            onClose={() => setDeliveryStatsFor(null)}
            panelClassName="max-w-2xl w-full"
          >
            <div className="overflow-y-auto max-h-[65vh] pr-1 flex flex-col gap-5">
              <p className="text-xs text-muted m-0">
                <span className="text-text font-medium">{deliveryStatsFor.title}</span>
                <span className="text-muted">
                  {" · "}
                  {deliveryStatsFor.id.length > 12 ? `${deliveryStatsFor.id.slice(0, 8)}…` : deliveryStatsFor.id}
                </span>
              </p>

              {/* Participant leaderboard + pie chart */}
              {statsLogsLoading ? (
                <p className="text-xs text-muted m-0">Loading participant data…</p>
              ) : participantStats.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold text-text uppercase tracking-wide m-0">Participant contributions</p>
                  <div className="flex flex-wrap gap-6 items-start">
                    <DeliveryPieChart stats={participantStats} />
                    <div className="flex-1 min-w-[200px] rounded-md border border-border/60 overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/60 bg-bg/30">
                            <th className="text-left font-medium text-muted px-3 py-2">#</th>
                            <th className="text-left font-medium text-muted px-3 py-2">Participant</th>
                            <th className="text-right font-medium text-muted px-3 py-2 tabular-nums">Delivered</th>
                            <th className="text-right font-medium text-muted px-3 py-2 tabular-nums">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {participantStats.map((p, i) => (
                            <tr key={p.key} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2 text-muted">{i + 1}</td>
                              <td className="px-3 py-2">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
                                  <span className="text-text truncate">{p.displayName}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted">
                                {formatWithThousandsSeparator(Math.round(p.totalDelivered))}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted">
                                {totalDelivered > 0 ? Math.round((p.totalDelivered / totalDelivered) * 100) : 0}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted m-0 italic">
                  No contribution events recorded yet — participant breakdown will appear once deliveries start.
                </p>
              )}

              {/* Per-resource line breakdown */}
              {(!sum || lines.length === 0) ? (
                <p className="text-sm text-muted m-0">
                  Expand the contract row first to load line data, then open Statistics again.
                </p>
              ) : (() => {
                const { rewardProgressTokens, rewardCapTokens } = sum;
                return (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-text uppercase tracking-wide m-0">Resource breakdown</p>
                    <div className="rounded-md border border-border/60 overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/60 bg-bg/30">
                            <th className="text-left font-medium text-muted px-3 py-2">Resource</th>
                            <th className="text-right font-medium text-muted px-3 py-2 tabular-nums">Delivered</th>
                            <th className="text-right font-medium text-muted px-3 py-2 tabular-nums">Required</th>
                            <th className="text-right font-medium text-muted px-3 py-2 tabular-nums">Tokens earned</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => {
                            const earned = tokensForDeliveredAmount(line, line.deliveredAmount);
                            const pct = lineProgressPercent(line);
                            return (
                              <tr key={line.id} className="border-b border-border/40 last:border-0 align-top">
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center gap-2 min-w-0">
                                    <ItemIcon typeID={line.typeID} size={18} className="rounded-sm shrink-0" />
                                    <span className="text-text truncate">{line.resourceName}</span>
                                  </span>
                                  <div className="mt-1 h-1.5 rounded bg-border overflow-hidden max-w-[200px]">
                                    <div className="h-full bg-accent/80" style={{ width: `${Math.min(100, pct)}%` }} />
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted">
                                  {formatWithThousandsSeparator(Math.round(line.deliveredAmount))}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted">
                                  {formatWithThousandsSeparator(Math.round(line.requiredAmount))}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted">
                                  {formatWithThousandsSeparator(Math.round(earned))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted m-0">
                      Reward progress:{" "}
                      <span className="text-text font-medium tabular-nums">
                        {formatWithThousandsSeparator(Math.round(rewardProgressTokens))}
                      </span>
                      {" / "}{formatWithThousandsSeparator(Math.round(rewardCapTokens))} tokens
                    </p>
                  </div>
                );
              })()}
            </div>
          </DemoModal>
        );
      })()}
    </div>
  );
}

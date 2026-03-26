import React, { useCallback, useEffect, useState } from "react";
import type { ContractBrowseSummary, LogisticsContract } from "@powerlay/core";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, ContractBrowseSummary["contract"]>>({});
  const [detailErrorById, setDetailErrorById] = useState<Record<string, string>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [callsign, setCallsign] = useState(loadStoredCallsign);
  const [autoRefreshIds, setAutoRefreshIds] = useState<Set<string>>(loadAutoRefreshIds);

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
    if (
      !window.confirm(
        "Finish this contract? Undelivered work will stop; any tokens still reserved for undelivered lines should return to your balance (per backend rules)."
      )
    ) {
      return;
    }
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
    if (
      !window.confirm(
        "Cancel this listing? Use this only when nothing has been delivered. Your full token reservation should be returned."
      )
    ) {
      return;
    }
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
                onFinish={isCreator ? () => void runFinish(c.id) : undefined}
                onCancel={isCreator ? () => void runCancel(c.id) : undefined}
                onStatistics={isCreator ? () => setDeliveryStatsFor({ id: dc.id, title: dc.title, summary: merged }) : undefined}
                actionBusy={isCreator ? busy : undefined}
              />
            );
          })}
        </ul>
      )}

      {deliveryStatsFor && (
        <DemoModal
          title="Delivery statistics"
          titleId="my-contract-delivery-stats-title"
          onClose={() => setDeliveryStatsFor(null)}
          panelClassName="max-w-lg w-full"
        >
          <p className="text-xs text-muted m-0 mb-3">
            <span className="text-text font-medium">{deliveryStatsFor.title}</span>
            <span className="text-muted">
              {" · "}
              {deliveryStatsFor.id.length > 12 ? `${deliveryStatsFor.id.slice(0, 8)}…` : deliveryStatsFor.id}
            </span>
          </p>
          {(() => {
            const sum = deliveryStatsFor.summary;
            const lines = sum?.contract.lines ?? [];
            if (!sum || lines.length === 0) {
              return (
                <p className="text-sm text-muted m-0">
                  Expand the contract row first to load line data from the server, then open Statistics again.
                </p>
              );
            }
            const { rewardProgressTokens, rewardCapTokens } = sum;
            return (
              <>
                <p className="text-xs text-muted m-0 mb-3">
                  Per-line delivery and rewards from the contract document returned by the backend (not raw chain events).
                </p>
                <div className="rounded-md border border-border/60 overflow-hidden mb-4">
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
                  Contract reward progress:{" "}
                  <span className="text-text font-medium tabular-nums">
                    {formatWithThousandsSeparator(Math.round(rewardProgressTokens))}
                  </span>{" "}
                  / {formatWithThousandsSeparator(Math.round(rewardCapTokens))} tokens
                </p>
              </>
            );
          })()}
        </DemoModal>
      )}
    </div>
  );
}

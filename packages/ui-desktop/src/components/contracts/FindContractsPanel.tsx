import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ContractBrowseSummary, ContractVisibility, SearchContractsParams } from "@powerlay/core";
import { contractProgressPercent, contractRewardCapTokens, contractRewardProgressTokens } from "@powerlay/core";
import type { ContractsClient } from "../../services/contracts/contractsClient";
import { loadStoredCallsign, saveStoredCallsign, callsignMatchesLine } from "../../utils/contractsUi";
import { contractsErrorForUi } from "../../utils/contractsIpcError";
import { useAuth } from "../../context/AuthContext";
import { useContractsAccess } from "../../context/ContractsAccessContext";
import { ContractCardRow, sortBrowseSummaries } from "./ContractCardRow";

const inputCls =
  "px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted";

export interface FindContractsPanelProps {
  client: ContractsClient;
  onRefreshBalance?: () => void;
}

export function FindContractsPanel({ client, onRefreshBalance }: FindContractsPanelProps) {
  const { session } = useAuth();
  const { buildSearchVisibility, allowTribeScopes } = useContractsAccess();
  const userWallet = session?.walletAddress ?? null;

  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<SearchContractsParams["filterMode"]>("title");
  const [priority, setPriority] = useState<SearchContractsParams["priority"]>("all");
  const [visTribe, setVisTribe] = useState(true);
  const [visPublic, setVisPublic] = useState(true);
  const [visAlliance, setVisAlliance] = useState(true);
  const [callsign, setCallsign] = useState(loadStoredCallsign);
  const [list, setList] = useState<Awaited<ReturnType<ContractsClient["search"]>>>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  /** Full contract from GET /contracts/{id} (list rows omit line items). */
  const [detailById, setDetailById] = useState<Record<string, ContractBrowseSummary["contract"]>>({});
  /** Error when fetching detail (e.g. CONTRACT_NOT_VISIBLE). */
  const [detailErrorById, setDetailErrorById] = useState<Record<string, string>>({});

  const userSelectedVisibility = useMemo((): ContractVisibility[] => {
    const v: ContractVisibility[] = [];
    if (visTribe) v.push("tribe");
    if (visPublic) v.push("public");
    if (visAlliance) v.push("alliance");
    return v;
  }, [visTribe, visPublic, visAlliance]);

  const visibilityFilter = useMemo(
    (): ContractVisibility[] => buildSearchVisibility(userSelectedVisibility),
    [buildSearchVisibility, userSelectedVisibility]
  );

  const searchParams = useMemo(
    (): SearchContractsParams => ({
      query,
      filterMode,
      visibility: visibilityFilter.length === 3 ? [] : visibilityFilter,
      priority,
    }),
    [query, filterMode, visibilityFilter, priority]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setDetailById({});
    setDetailErrorById({});
    try {
      const res = await client.search(searchParams);
      setList(sortBrowseSummaries(res));
    } finally {
      setLoading(false);
    }
  }, [client, searchParams]);

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

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setCallsignPersist = (v: string) => {
    setCallsign(v);
    saveStoredCallsign(v);
  };

  const assigneeMatchFor = (contractId: string) => {
    const c = detailById[contractId] ?? list.find((x) => x.contract.id === contractId)?.contract;
    if (!c || !callsign.trim()) return false;
    return c.lines.some((l) => callsignMatchesLine(l.assigneeText, callsign));
  };

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

  const handleJoin = async (contractId: string) => {
    setJoiningId(contractId);
    try {
      await client.join(contractId, callsign.trim() || undefined);
      setDetailById((d) => {
        const next = { ...d };
        delete next[contractId];
        return next;
      });
      await refresh();
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
      await refresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-end">
        <label className="flex flex-col gap-1 flex-1 min-w-[200px] text-xs text-muted">
          Search
          <input
            className={inputCls}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter list…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Match in
          <select
            className={inputCls}
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as SearchContractsParams["filterMode"])}
          >
            <option value="title">Contract name / description</option>
            <option value="resource">Resource name</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Priority
          <select
            className={inputCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value as SearchContractsParams["priority"])}
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[160px] text-xs text-muted">
          Your callsign (optional)
          <input
            className={inputCls}
            value={callsign}
            onChange={(e) => setCallsignPersist(e.target.value)}
            placeholder="Match assignee text"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3 items-center text-xs text-muted">
        <span className="font-medium text-text">Visibility</span>
        <label
          className={`inline-flex items-center gap-1.5 ${!allowTribeScopes ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
          title={!allowTribeScopes ? "Tribe requires a successful tribe lookup — sign in with your wallet and check Settings → Contracts & tribe (Sui GraphQL)" : undefined}
        >
          <input
            type="checkbox"
            checked={visTribe}
            disabled={!allowTribeScopes}
            onChange={(e) => setVisTribe(e.target.checked)}
          />
          Tribe
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={visPublic} onChange={(e) => setVisPublic(e.target.checked)} />
          Public
        </label>
        <label
          className={`inline-flex items-center gap-1.5 ${!allowTribeScopes ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
          title={!allowTribeScopes ? "Alliance uses the same tribe access as Tribe — resolve tribe first (Settings → Contracts & tribe)" : undefined}
        >
          <input
            type="checkbox"
            checked={visAlliance}
            disabled={!allowTribeScopes}
            onChange={(e) => setVisAlliance(e.target.checked)}
          />
          Alliance
        </label>
        <span className="text-[0.7rem]">All three on = show every visibility. Uncheck to narrow.</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted m-0">Loading contracts…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted m-0">No contracts match. Adjust filters or publish one in Create.</p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {list.map((summary) => (
            <ContractCardRow
              key={summary.contract.id}
              summary={summaryForRow(summary)}
              expanded={expandedId === summary.contract.id}
              onToggleExpand={() => setExpandedId((id) => (id === summary.contract.id ? null : summary.contract.id))}
              callsign={callsign}
              userWallet={userWallet}
              onJoin={() => handleJoin(summary.contract.id)}
              onHide={() => handleHide(summary.contract.id)}
              joining={joiningId === summary.contract.id}
              assigneeMatch={assigneeMatchFor(summary.contract.id)}
              detailError={detailErrorById[summary.contract.id]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

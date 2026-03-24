import React, { useCallback, useEffect, useState } from "react";
import type { ContractBrowseSummary, LogisticsContract } from "@powerlay/core";
import { contractProgressPercent } from "@powerlay/core";
import type { ContractsClient } from "../../services/contracts/contractsClient";
import { contractsErrorForUi } from "../../utils/contractsIpcError";
import { sortBrowseSummaries } from "./ContractCardRow";
import { statusLabel, visibilityLabel, walletMatches } from "../../utils/contractsUi";
import { useAuth } from "../../context/AuthContext";

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
const dangerCls =
  "cursor-pointer px-3 py-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed";
const primaryCls =
  "cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50 disabled:cursor-not-allowed";
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

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
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
      await load();
      onRefreshBalance?.();
    } catch (e) {
      console.error(e);
      setBanner(contractsErrorForUi(e).message);
    } finally {
      setActionId(null);
    }
  };

  const isCreatorBucket = ["all", "drafts", "published_by_me", "removed_by_me"].includes(bucket);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted m-0 leading-relaxed">
        {isCreatorBucket
          ? "Contracts you created. Finish after delivery; Cancel only when nothing was delivered."
          : bucket === "joined"
            ? "Contracts you joined as a participant."
            : bucket === "hidden"
              ? "Contracts you hid from discovery."
              : "Your contracts."}
      </p>

      <div className="flex flex-wrap gap-1 p-0.5 rounded-lg bg-border/40 border border-border/60 w-fit">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={tabCls(bucket === b.id)}
            onClick={() => setBucket(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

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
        <ul className="list-none m-0 p-0 flex flex-col gap-3">
          {list.map((row) => {
            const c = row.contract;
            const pct = contractProgressPercent(c);
            const delivered = hasAnyDelivery(c);
            const active = c.status === "published" || c.status === "in_progress";
            const isCreator = userWallet && walletMatches(c.createdByWallet, userWallet);
            const canFinish = isCreator && active && (delivered || pct >= 100);
            const canCancel = isCreator && active && !delivered && pct < 100;
            const busy = actionId === c.id;

            return (
              <li key={c.id} className="rounded-lg border border-border bg-surface/80 p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                  <span className="font-medium text-sm text-text">{c.title}</span>
                  <span className="text-[0.65rem] uppercase px-1.5 py-0.5 rounded border border-border/60 text-muted">{visibilityLabel(c.visibility)}</span>
                  <span className="text-[0.65rem] text-muted">{statusLabel(c.status)}</span>
                  <span className="text-xs text-muted ml-auto tabular-nums">{pct}% delivered</span>
                </div>
                <p className="text-xs text-muted m-0">
                  {c.targetStarSystem} · SSU {c.targetSsuId}
                </p>
                {c.status === "draft" && (
                  <p className="text-xs text-muted m-0">Edit and publish from the Create contract tab (Your drafts).</p>
                )}
                {active && (canFinish || canCancel) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canFinish && (
                      <button type="button" className={primaryCls} disabled={busy} onClick={() => runFinish(c.id)}>
                        {busy ? "Working…" : "Finish contract"}
                      </button>
                    )}
                    {canCancel && (
                      <button type="button" className={dangerCls} disabled={busy} onClick={() => runCancel(c.id)}>
                        {busy ? "Working…" : "Cancel listing"}
                      </button>
                    )}
                  </div>
                )}
                {(c.status === "completed" || c.status === "canceled") && (
                  <p className="text-xs text-muted m-0">This contract is closed.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import React from "react";
import type { ContractBrowseSummary } from "@powerlay/core";
import { lineProgressPercent, tokensForDeliveredAmount } from "@powerlay/core";
import { formatWithThousandsSeparator } from "../../utils/format";
import { statusLabel, visibilityLabel } from "../../utils/contractsUi";
import { ItemIcon } from "../ItemIcon";

export interface ContractExpandedDetailsProps {
  summary: ContractBrowseSummary;
  callsign: string;
  userWallet: string | null;
  isParticipant: boolean;
  assigneeMatch: boolean;
  onJoin: () => void;
  onHide: () => void;
  joining: boolean;
}

export function ContractExpandedDetails({
  summary,
  callsign,
  userWallet,
  isParticipant,
  assigneeMatch,
  onJoin,
  onHide,
  joining,
}: ContractExpandedDetailsProps) {
  const { contract: c, progressPercent, rewardProgressTokens, rewardCapTokens } = summary;
  const btnCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";

  return (
    <div className="mt-3 pl-3 border-l-2 border-border space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted text-xs">
        <span>
          System <span className="text-text">{c.targetStarSystem}</span>
        </span>
        <span>
          SSU <span className="text-text font-mono">{c.targetSsuId}</span>
        </span>
        <span>
          State <span className="text-text">{statusLabel(c.status)}</span>
        </span>
      </div>
      {c.description && <p className="text-muted text-xs m-0">{c.description}</p>}

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-border/40 text-left text-muted">
              <th className="p-2 font-medium">Resource</th>
              <th className="p-2 font-medium">Delivered / req</th>
              <th className="p-2 font-medium">Line %</th>
              <th className="p-2 font-medium">Reward progress</th>
              <th className="p-2 font-medium">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((line) => {
              const pct = lineProgressPercent(line);
              const earned = tokensForDeliveredAmount(line, line.deliveredAmount);
              return (
                <tr key={line.id} className="border-t border-border/80">
                  <td className="p-2">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <ItemIcon typeID={line.typeID} size={20} className="rounded-sm shrink-0" />
                      <span className="truncate">{line.resourceName}</span>
                    </span>
                  </td>
                  <td className="p-2 font-mono">
                    {formatWithThousandsSeparator(Math.round(line.deliveredAmount))} / {formatWithThousandsSeparator(Math.round(line.requiredAmount))}
                  </td>
                  <td className="p-2">{pct}%</td>
                  <td className="p-2">
                    {formatWithThousandsSeparator(Math.round(earned))} / {formatWithThousandsSeparator(Math.round(line.rewardTokensFullLine))} tok
                  </td>
                  <td className="p-2 text-muted">{line.assigneeText ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span>
          Contract progress: <span className="text-text font-medium">{progressPercent}%</span>
        </span>
        <span>
          Reward pool: <span className="text-text font-medium">{formatWithThousandsSeparator(Math.round(rewardProgressTokens))}</span> /{" "}
          {formatWithThousandsSeparator(Math.round(rewardCapTokens))} tokens
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border/70 bg-surface/60">{visibilityLabel(c.visibility)}</span>
      </div>

      <div>
        <div className="text-xs text-muted mb-1">Participants</div>
        {c.participants.length === 0 ? (
          <p className="text-xs text-muted m-0 italic">No one has joined yet.</p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-wrap gap-2">
            {c.participants.map((p) => (
              <li key={p.id} className="px-2 py-1 rounded-md border border-border bg-bg text-xs">
                {p.displayName}
                {userWallet && p.walletAddress?.toLowerCase() === userWallet.toLowerCase() ? (
                  <span className="text-accent ml-1">(you)</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(assigneeMatch || !callsign.trim()) && (
        <p className="text-[0.7rem] text-muted m-0">
          {assigneeMatch
            ? "Your callsign matches an assignee on this contract — you can accept to join the run."
            : "Set your callsign in the header to highlight when a line is assigned to you."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnCls} disabled={joining || isParticipant || c.status === "completed" || c.status === "canceled"} onClick={onJoin}>
          {isParticipant ? "Joined" : assigneeMatch ? "Accept / join" : "Join"}
        </button>
        <button type="button" className={btnCls} onClick={onHide}>
          Hide from my list
        </button>
      </div>
    </div>
  );
}

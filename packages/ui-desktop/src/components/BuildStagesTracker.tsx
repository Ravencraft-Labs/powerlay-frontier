import React from "react";
import type { ProductionStage } from "@powerlay/core";
import { ItemIcon } from "./ItemIcon";
import { HelpLabel } from "./HelpLabel";

interface Props {
  stages: ProductionStage[];
  /** Completion of [mining, ...stages]. */
  completed: boolean[];
  /** Step shown: 0 = mining, i = stages[i - 1]. */
  active: number;
  /** True when the user picked the step (else it follows progress). */
  pinned: boolean;
  miningPct: number;
  made: Record<number, number>;
  onMadeChange: (typeID: number, made: number) => void;
  /** Pick a step, or null to follow progress again. */
  onPick: (step: number | null) => void;
  onReset: () => void;
  fmt: (n: number) => string;
}

const tabCls = (active: boolean, done: boolean) =>
  `px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
    active
      ? "border-amber-500 text-amber-500 bg-amber-500/10"
      : done
        ? "border-border/60 text-muted hover:text-text bg-transparent"
        : "border-border text-text hover:bg-border bg-transparent"
  }`;

const HELP = (
  <>
    <p className="font-semibold mb-1">How to use</p>
    <p className="mb-2 text-muted text-xs">
      The build is split into steps from the production tree: <strong>Mining</strong>, then each crafting level up to the
      planned items. Crafting is not in the game logs, so enter what you made or tick <strong>done</strong>.
    </p>
    <p className="text-muted text-xs">
      The current step moves on by itself when everything in it is done. Click a step to look at it; click the
      highlighted step again to go back to following progress.
    </p>
  </>
);

/** Steps after mining: crafted items per production-tree level, with hand-entered progress. */
export function BuildStagesTracker({ stages, completed, active, pinned, miningPct, made, onMadeChange, onPick, onReset, fmt }: Props) {
  if (stages.length === 0) return null;
  const stage = active > 0 ? stages[active - 1] : undefined;
  const hasProgress = Object.keys(made).length > 0;

  return (
    <div className="rounded-md border border-border bg-bg px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-text m-0">Crafting steps</h4>
        <div className="flex items-center gap-2">
          {hasProgress && (
            <button
              type="button"
              className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0"
              onClick={onReset}
              title="Clear crafted amounts"
            >
              Reset
            </button>
          )}
          <HelpLabel content={HELP} size="sm" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {[-1, ...stages.map((_, i) => i)].map((i) => {
          const step = i + 1;
          const done = completed[step] ?? false;
          const label = step === 0 ? `Mining ${miningPct}%` : `Step ${step}`;
          return (
            <button
              key={step}
              type="button"
              className={tabCls(step === active, done)}
              onClick={() => onPick(step === active && pinned ? null : step)}
              title={step === active && pinned ? "Click to follow progress again" : undefined}
            >
              {done && "✓ "}
              {label}
              {step === active && pinned && " · pinned"}
            </button>
          );
        })}
      </div>

      {!stage ? (
        <p className="text-xs text-muted m-0">
          Mining is tracked in the block above. When all ores are in, tracking moves to step 1:{" "}
          {stages[0].items.map((i) => i.name).join(", ")}.
        </p>
      ) : (
        <div className="space-y-1.5">
          {stage.items.map((item) => {
            const value = made[item.typeID] ?? 0;
            const progress = item.quantity > 0 ? Math.min(1, value / item.quantity) : 0;
            const done = value >= item.quantity;
            return (
              <div key={item.typeID} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(e) => onMadeChange(item.typeID, e.target.checked ? item.quantity : 0)}
                  className="rounded border-border shrink-0"
                  title="Done"
                />
                <ItemIcon typeID={item.typeID} size={16} />
                <span className={`text-xs min-w-[120px] truncate ${done ? "text-muted" : "text-text"}`}>{item.name}</span>
                <div className="flex-1 min-w-0 h-1.5 rounded-full bg-amber-500/40 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
                <input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => onMadeChange(item.typeID, Number(e.target.value) || 0)}
                  className="w-16 px-1.5 py-0.5 rounded border border-border-input bg-bg text-text text-xs text-right focus:outline-none focus:border-muted"
                  title="Units made"
                />
                <span className="text-xs text-muted shrink-0">/ {fmt(item.quantity)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

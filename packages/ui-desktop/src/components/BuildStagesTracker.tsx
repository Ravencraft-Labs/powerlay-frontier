import React, { useState } from "react";
import type { ProductionStage } from "@powerlay/core";
import type { CraftStep } from "../utils/craftStep";
import { ItemIcon } from "./ItemIcon";
import { HelpLabel } from "./HelpLabel";

/**
 * Inline editor for an item's ±N step. Enter/blur saves (empty = back to default -> null),
 * Escape cancels (undefined).
 */
function StepSizeInput({ initial, onDone }: { initial?: number; onDone: (size: number | null | undefined) => void }) {
  const [text, setText] = useState(initial != null ? String(initial) : "");
  const commit = () => {
    const n = Math.floor(Number(text));
    onDone(text.trim() === "" ? null : n > 0 ? n : undefined);
  };
  return (
    <input
      type="number"
      min={1}
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone(undefined);
      }}
      placeholder="step"
      title="Your step for this item; leave empty for the default"
      className="w-16 px-1.5 py-0.5 rounded border border-amber-500/60 bg-bg text-text text-xs text-right focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

interface Props {
  stages: ProductionStage[];
  /** Completion of [mining, ...stages]. */
  completed: boolean[];
  /** Step shown: 0 = mining, i = stages[i - 1]. */
  active: number;
  miningPct: number;
  made: Record<number, number>;
  /** typeID -> ±N step (the user's own, or one run/job from game data). */
  batches?: Record<number, CraftStep>;
  /** Set the user's step for an item; null = back to the default. Enables right-click editing. */
  onStepChange?: (typeID: number, size: number | null) => void;
  /** Move to the next unfinished step when the shown one is done. */
  autoAdvance?: boolean;
  onAutoAdvanceChange?: (on: boolean) => void;
  onMadeChange: (typeID: number, made: number) => void;
  /** Show this step; it stays until everything in it is done, then the next unfinished one shows. */
  onPick: (step: number) => void;
  onReset: () => void;
  fmt: (n: number) => string;
  /** Free build: planned items only, no mining tab; the Mining block (with the overlay button) is hidden, so offer it here. */
  free?: boolean;
  overlayVisible?: boolean;
  onToggleOverlay?: () => void;
}

const tabCls = (active: boolean, done: boolean) =>
  `px-2.5 py-1 text-xs rounded border cursor-pointer whitespace-nowrap ${
    active
      ? "border-amber-500 text-amber-500 bg-amber-500/10"
      : done
        ? "border-border/60 text-muted hover:text-text bg-transparent"
        : "border-border text-text hover:bg-border bg-transparent"
  }`;

const stepBtnCls =
  "min-w-[2rem] px-1.5 py-0.5 text-xs rounded border border-border text-muted hover:text-text hover:bg-border bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent";

const HELP = (
  <>
    <p className="font-semibold mb-1">How to use</p>
    <p className="mb-2 text-muted text-xs">
      The build is split into steps from the production tree: <strong>Mining</strong>, then each crafting level up to the
      planned items. Crafting is not in the game logs, so enter what you made, use <strong>±1</strong> /{" "}
      <strong>±N</strong>, or tick <strong>done</strong>. N is one refining run, or one full printer job (hover to see
      which); right-click a ± button to set your own N for that item.
    </p>
    <p className="text-muted text-xs">
      With <strong>Auto-advance</strong> on, the current step moves on by itself when everything in it is done;
      turn it off to stay on the step you picked. Click a step to switch to it.
    </p>
  </>
);

/** Steps after mining: crafted items per production-tree level, with hand-entered progress. */
export function BuildStagesTracker({
  stages,
  completed,
  active,
  miningPct,
  made,
  batches = {},
  onStepChange,
  autoAdvance = true,
  onAutoAdvanceChange,
  onMadeChange,
  onPick,
  onReset,
  fmt,
  free = false,
  overlayVisible = false,
  onToggleOverlay,
}: Props) {
  const [editingStepFor, setEditingStepFor] = useState<number | null>(null);
  if (stages.length === 0) return null;
  const stage = active > 0 ? stages[active - 1] : undefined;
  const hasProgress = Object.keys(made).length > 0;

  return (
    <div className="rounded-md border border-border bg-bg px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-text m-0">{free ? "Tracked items" : "Crafting steps"}</h4>
        <div className="flex items-center gap-2">
          {free && onToggleOverlay && (
            <button
              type="button"
              className={`shrink-0 px-2 py-1 rounded text-xs border transition-colors cursor-pointer ${
                overlayVisible ? "border-amber-500 text-amber-500 bg-amber-500/10" : "border-border text-muted hover:text-text hover:bg-border bg-transparent"
              }`}
              onClick={onToggleOverlay}
              title={overlayVisible ? "Hide overlay" : "Show overlay"}
            >
              Overlay
            </button>
          )}
          {!free && onAutoAdvanceChange && (
            <label
              className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none"
              title="Move to the next unfinished step when the shown one is done"
            >
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => onAutoAdvanceChange(e.target.checked)}
                className="rounded border-border"
              />
              Auto-advance
            </label>
          )}
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

      {/* A free build has one step and no mining: no tabs. */}
      {!(free && stages.length === 1) && (
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[...(free ? [] : [-1]), ...stages.map((_, i) => i)].map((i) => {
          const step = i + 1;
          const done = completed[step] ?? false;
          const label = step === 0 ? `Mining ${miningPct}%` : `Step ${step}`;
          return (
            <button
              key={step}
              type="button"
              className={tabCls(step === active, done)}
              onClick={() => onPick(step)}
            >
              {done && "✓ "}
              {label}
            </button>
          );
        })}
      </div>
      )}

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
                {(() => {
                  const batch = batches[item.typeID];
                  const add = (delta: number) => onMadeChange(item.typeID, Math.min(item.quantity, Math.max(0, value + delta)));
                  const stepBtn = (delta: number, title: string) => (
                    <button
                      type="button"
                      className={stepBtnCls}
                      disabled={delta < 0 ? value <= 0 : value >= item.quantity}
                      onClick={() => add(delta)}
                      onContextMenu={(e) => {
                        if (!onStepChange) return;
                        e.preventDefault();
                        setEditingStepFor(item.typeID);
                      }}
                      title={title}
                    >
                      {delta > 0 ? `+${delta}` : `−${-delta}`}
                    </button>
                  );
                  const unitTitle = onStepChange ? "One unit (right-click to set your step)" : "One unit";
                  const stepTitle = batch ? (onStepChange ? `${batch.title} (right-click to change)` : batch.title) : "";
                  return (
                    <div className="flex items-center gap-1 shrink-0">
                      {batch && stepBtn(-batch.size, stepTitle)}
                      {stepBtn(-1, unitTitle)}
                      <input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) => onMadeChange(item.typeID, Number(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 rounded border border-border-input bg-bg text-text text-xs text-right focus:outline-none focus:border-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        title="Units made"
                      />
                      {stepBtn(1, unitTitle)}
                      {editingStepFor === item.typeID && onStepChange ? (
                        <StepSizeInput
                          initial={batch?.size}
                          onDone={(size) => {
                            if (size !== undefined) onStepChange(item.typeID, size);
                            setEditingStepFor(null);
                          }}
                        />
                      ) : (
                        batch && stepBtn(batch.size, stepTitle)
                      )}
                      <span className="text-xs text-muted ml-1">/ {fmt(item.quantity)}</span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

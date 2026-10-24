import React, { useState, useEffect, useCallback, useRef } from "react";
import type { BuilderOverlayState } from "./preload.d";
import { OverlayFrame } from "./components/OverlayFrame";
import { ItemIcon } from "./components/ItemIcon";
import { useEfOverlay } from "./hooks/useEfOverlay";

/**
 * One ore/item line: optional checkbox on the left; on the right the icon, name and `children`
 * (count, ± buttons), with the progress bar underneath spanning from the icon to the last button.
 */
function ItemRow({
  checkbox,
  typeID,
  name,
  progress,
  barMuted,
  below,
  className = "",
  children,
}: {
  checkbox?: React.ReactNode;
  typeID?: number;
  name: string;
  progress: number;
  barMuted: boolean;
  below?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      {checkbox && <span className="h-6 flex items-center">{checkbox}</span>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-h-6">
          {typeID != null && <ItemIcon typeID={typeID} />}
          <span className="flex-1 min-w-0 text-text truncate" title={name}>{name}</span>
          {children}
        </div>
        <div className="mt-0.5 h-1 rounded-full bg-amber-500/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barMuted ? "bg-muted" : "bg-blue-500"}`}
            style={{ width: `${Math.min(1, progress) * 100}%` }}
          />
        </div>
        {below}
      </div>
    </div>
  );
}

/** Overlay-wide preference: show "where to mine" under each ore (on by default). */
const ORE_HINTS_KEY = "powerlay-overlay-ore-hints";

function loadShowOreHints(): boolean {
  try {
    return localStorage.getItem(ORE_HINTS_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveShowOreHints(on: boolean): void {
  try {
    localStorage.setItem(ORE_HINTS_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

interface BuildTrackingOverlayProps {
  buildId: string | null;
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function formatProductionTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "k";
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
}

export function BuildTrackingOverlay({ buildId }: BuildTrackingOverlayProps) {
  const api = useEfOverlay();
  const [state, setState] = useState<BuilderOverlayState>({});
  const [trackingBuildId, setTrackingBuildId] = useState<string | null>(null);
  const [showOreHints, setShowOreHints] = useState(loadShowOreHints);

  const sendDone = useCallback(
    (kind: "ore-done" | "item-done", typeID: number, done: boolean) => {
      if (buildId) api?.overlay?.sendBuilderAction?.(buildId, { kind, typeID, done });
    },
    [api?.overlay, buildId]
  );

  const toggleOreHints = useCallback(() => {
    setShowOreHints((prev) => {
      saveShowOreHints(!prev);
      return !prev;
    });
  }, []);

  const load = useCallback(async () => {
    const getState = api?.overlay?.getBuilderState;
    if (!getState || !buildId) return;
    try {
      const s = await getState(buildId);
      setState(s ?? {});
    } catch (err) {
      console.error(err);
    }
  }, [api?.overlay?.getBuilderState, buildId]);

  // Step picked here but not yet confirmed by the desktop (state arrives by polling): arrows count from it,
  // so fast clicks don't resend the same step.
  const [pendingStep, setPendingStep] = useState<number | null>(null);

  const pickStep = useCallback(
    (step: number) => {
      if (!buildId) return;
      setPendingStep(step);
      api?.overlay?.sendBuilderAction?.(buildId, { kind: "pick-step", step });
      setTimeout(load, 150);
    },
    [api?.overlay, buildId, load]
  );

  // Free build: the ± buttons change "needed" instead of "made" while this is on.
  const [neededMode, setNeededMode] = useState(false);

  const addNeeded = useCallback(
    (typeID: number, delta: number) => {
      if (!buildId) return;
      api?.overlay?.sendBuilderAction?.(buildId, { kind: "needed-add", typeID, delta });
      setTimeout(load, 150);
    },
    [api?.overlay, buildId, load]
  );

  const setAuto = useCallback(
    (on: boolean) => {
      if (!buildId) return;
      api?.overlay?.sendBuilderAction?.(buildId, { kind: "set-auto", on });
      setTimeout(load, 150);
    },
    [api?.overlay, buildId, load]
  );

  const addMade = useCallback(
    (typeID: number, delta: number) => {
      if (!buildId) return;
      api?.overlay?.sendBuilderAction?.(buildId, { kind: "item-add", typeID, delta });
      setTimeout(load, 150);
    },
    [api?.overlay, buildId, load]
  );

  useEffect(() => {
    if (pendingStep == null) return;
    if (state.steps?.active === pendingStep) {
      setPendingStep(null);
      return;
    }
    const t = setTimeout(() => setPendingStep(null), 2000);
    return () => clearTimeout(t);
  }, [pendingStep, state.steps?.active]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 500);
    return () => clearInterval(id);
  }, [load]);

  const loadMiningErrors = useCallback(async () => {
    const getErrors = api?.mining?.getErrors;
    if (!getErrors) return;
    try {
      const err = await getErrors();
      setTrackingBuildId(err?.trackingBuildId ?? null);
    } catch {
      /* ignore */
    }
  }, [api?.mining?.getErrors]);

  useEffect(() => {
    loadMiningErrors();
    const id = setInterval(loadMiningErrors, 500);
    return () => clearInterval(id);
  }, [loadMiningErrors]);

  const handlePlayPause = useCallback(() => {
    if (trackingBuildId === buildId) {
      api?.mining?.stopTracking?.();
    } else if (buildId) {
      api?.mining?.startTracking?.({
        buildId,
        plannedVolByTypeId: state.plannedVolByTypeId,
      });
    }
  }, [trackingBuildId, api?.mining, buildId, state.plannedVolByTypeId]);

  const buildName = state.buildName ?? "—";
  const mined = state.mined ?? 0;
  const totalOre = state.totalOre ?? 0;
  const miningPct = totalOre > 0 ? Math.min(100, Math.round((mined / totalOre) * 100)) : 0;
  const productionLeft = state.productionLeftSeconds ?? 0;
  const miningOres = state.miningOres ?? [];
  const steps = state.steps;
  const hasStepSwitcher = !!steps && steps.last > steps.first;
  // A free build has no mining step (its steps start at 1).
  const isFreeBuild = steps?.first === 1;
  const activeStep = pendingStep ?? steps?.active ?? 0;
  // Until the desktop confirms a picked step, the lists below still belong to the previous one.
  const syncing = pendingStep != null && pendingStep !== steps?.active;
  const stage = syncing ? undefined : state.stage;

  const prevProgressRef = useRef<Record<string, number>>({});
  const [blinkingOres, setBlinkingOres] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const justCompleted: string[] = [];

    for (let i = 0; i < miningOres.length; i++) {
      const o = miningOres[i];
      const key = `${i}-${o.name}-${o.neededVol}`;
      const progress = o.neededVol > 0 ? o.minedVol / o.neededVol : 0;
      const prev = prevProgressRef.current[key] ?? 0;
      prevProgressRef.current[key] = progress;

      if (progress >= 1 && prev < 1) {
        justCompleted.push(key);
      }
    }

    if (justCompleted.length > 0) {
      setBlinkingOres(new Set(justCompleted));
      const t = setTimeout(() => setBlinkingOres(new Set()), 1000);
      return () => clearTimeout(t);
    }
  }, [miningOres]);

  if (!buildId) {
    return (
      <div className="p-4 text-muted text-sm">No build selected.</div>
    );
  }

  const titleWithDot = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="truncate">Build: {buildName}</span>
      {trackingBuildId === buildId && (
        <span
          className="w-2 h-2 rounded-full bg-red-500 shrink-0"
          title="This build is tracking"
          aria-hidden
        />
      )}
    </span>
  );

  // Shown on every step (not only Mining) so the preference stays reachable; hints render under the ore list.
  const hasOreHints =
    miningOres.some((o) => o.asteroids && o.asteroids.length > 0) ||
    !!state.stage?.items.some((i) => i.asteroids && i.asteroids.length > 0);
  const oreHintsButton = hasOreHints ? (
    <button
      type="button"
      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-colors ${
        showOreHints ? "text-amber-500 hover:bg-amber-500/20" : "text-muted hover:text-text hover:bg-border"
      }`}
      onClick={toggleOreHints}
      title={showOreHints ? "Hide where to mine each ore" : "Show where to mine each ore"}
    >
      ?
    </button>
  ) : undefined;
  // Free build only: its "needed" is the planned quantity, which the overlay may change.
  const neededButton =
    isFreeBuild && stage ? (
      <button
        type="button"
        className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
          neededMode ? "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20" : "text-muted hover:text-text hover:bg-border"
        }`}
        onClick={() => setNeededMode((v) => !v)}
        title={neededMode ? "Editing how many are needed — click to go back to counting made" : "Edit how many are needed"}
      >
        ✎
      </button>
    ) : undefined;

  return (
    <OverlayFrame
      title={titleWithDot}
      buildId={buildId}
      headerActions={
        <>
          {neededButton}
          {oreHintsButton}
        </>
      }
      // Rows hold ±N/±1 buttons around the count; keep in sync with the default width in electron-shell main.ts.
      widthClassName="min-w-[400px] max-w-[460px]"
    >
      {(locked) => (
      <div className="text-[0.8rem] text-muted space-y-1.5">
        {/* One row: log tracking on the left (not for a free build: no mining), step switcher on the right. */}
        {(steps?.first !== 1 || hasStepSwitcher) && (
          <div className="flex items-center gap-2 min-h-7">
            {steps?.first !== 1 && (
              <>
                {!locked && (
                  <button
                    type="button"
                    className={`shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors overlay-no-drag ${
                      trackingBuildId === buildId
                        ? "text-amber-500 hover:bg-amber-500/20"
                        : "text-green-500 hover:bg-green-500/20"
                    }`}
                    title={trackingBuildId === buildId ? "Stop tracking" : "Start tracking"}
                    onClick={handlePlayPause}
                  >
                    {trackingBuildId === buildId ? <PauseIcon /> : <PlayIcon />}
                  </button>
                )}
                <span className="min-w-0 truncate text-[0.75rem] text-muted">
                  {trackingBuildId === buildId ? "Tracking" : "Paused"}
                </span>
              </>
            )}
            {steps && hasStepSwitcher && (
              <div className="ml-auto shrink-0 flex items-center gap-1 overlay-no-drag">
                {!locked && (
                  <button
                    type="button"
                    disabled={activeStep <= steps.first}
                    onClick={() => pickStep(activeStep - 1)}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Previous step"
                  >
                    ◀
                  </button>
                )}
                <span className="text-text font-semibold whitespace-nowrap">
                  {activeStep === 0 ? `Mining ${miningPct}%` : `Step ${activeStep} of ${steps.last}`}
                </span>
                {!locked && (
                  <button
                    type="button"
                    disabled={activeStep >= steps.last}
                    onClick={() => pickStep(activeStep + 1)}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Next step"
                  >
                    ▶
                  </button>
                )}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setAuto(!steps.auto)}
                    className={`ml-1 px-1.5 h-6 text-[11px] rounded border transition-colors ${
                      steps.auto
                        ? "border-amber-500/60 text-amber-500 bg-amber-500/10"
                        : "border-border/60 text-muted hover:text-text hover:bg-border"
                    }`}
                    title={steps.auto ? "Auto-advance on: moves to the next step when this one is done" : "Auto-advance off: stays on this step"}
                  >
                    Auto
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {/* Builds without crafting steps keep the mining total as its own line. */}
        {!hasStepSwitcher && totalOre > 0 && (
          <div>
            Mining: {miningPct}% ({formatCompact(mined)} / {formatCompact(totalOre)} m³)
          </div>
        )}
        {stage && (
          <div className="space-y-2">
            {stage.items.map((item) => {
              const progress = item.needed > 0 ? Math.min(1, item.made / item.needed) : 0;
              const done = progress >= 1;
              return (
                <ItemRow
                  key={item.name}
                  className={done ? "ore-complete-gray" : ""}
                  checkbox={
                    !locked && item.typeID != null ? (
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={(e) => sendDone("item-done", item.typeID!, e.target.checked)}
                        className="shrink-0 overlay-no-drag cursor-pointer"
                        title="Made"
                      />
                    ) : undefined
                  }
                  typeID={item.typeID}
                  name={item.name}
                  progress={progress}
                  barMuted={done}
                  below={
                    showOreHints && !done && item.asteroids && item.asteroids.length > 0 ? (
                      <div className="text-[10px] text-muted/80 truncate">↳ {item.asteroids.join(", ")}</div>
                    ) : undefined
                  }
                >
                  {/* Minus buttons left of the count, plus buttons right of it, so they are hard to mix up. */}
                  {(() => {
                    const editable = !locked && item.typeID != null;
                    // "Needed" mode (free builds): the same buttons change how many are planned.
                    const editNeeded = editable && neededMode;
                    const stepBtn = (delta: number) => (
                      <button
                        key={delta}
                        type="button"
                        disabled={
                          editNeeded
                            ? delta < 0 && item.needed <= 1
                            : delta < 0 ? item.made <= 0 : item.made >= item.needed
                        }
                        onClick={() => (editNeeded ? addNeeded(item.typeID!, delta) : addMade(item.typeID!, delta))}
                        className={`min-w-[1.75rem] h-6 px-1.5 text-[11px] rounded border disabled:opacity-30 disabled:hover:bg-transparent ${
                          editNeeded
                            ? "border-amber-500/60 text-amber-500 hover:bg-amber-500/20"
                            : "border-border/60 text-muted hover:text-text hover:bg-border"
                        }`}
                        // Overlays can't take typing on Windows (non-focusable), so the step is set in the app.
                        title={
                          editNeeded
                            ? "Change how many are needed"
                            : Math.abs(delta) === 1
                              ? "One unit"
                              : `${item.batchTitle ?? "Your step"} (set your own in the app)`
                        }
                      >
                        {delta > 0 ? `+${delta}` : `−${-delta}`}
                      </button>
                    );
                    return (
                      <span className="flex items-center gap-1 shrink-0 overlay-no-drag">
                        {editable && item.batch != null && stepBtn(-item.batch)}
                        {editable && stepBtn(-1)}
                        <span className="px-1 text-center tabular-nums">
                          {formatCompact(item.made)} /{" "}
                          <span className={editNeeded ? "text-amber-500 font-semibold" : undefined}>
                            {formatCompact(item.needed)}
                          </span>
                        </span>
                        {editable && stepBtn(1)}
                        {editable && item.batch != null && stepBtn(item.batch)}
                      </span>
                    );
                  })()}
                </ItemRow>
              );
            })}
          </div>
        )}
        {!syncing && !stage && miningOres.length > 0 && (
          <div className="space-y-2">
            {miningOres.map((o, i) => {
              const progress = o.neededVol > 0 ? o.minedVol / o.neededVol : 0;
              const key = `${i}-${o.name}-${o.neededVol}`;
              const isComplete = progress >= 1;
              const isBlinking = blinkingOres.has(key);
              const isGray = isComplete && !isBlinking;
              const rowCls = [
                "transition-opacity duration-300",
                isBlinking && "ore-complete-blink",
                isGray && "ore-complete-gray",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <ItemRow
                  key={key}
                  className={rowCls}
                  checkbox={
                    !locked && o.typeID != null ? (
                      <input
                        type="checkbox"
                        checked={isComplete}
                        onChange={(e) => sendDone("ore-done", o.typeID!, e.target.checked)}
                        className="shrink-0 overlay-no-drag cursor-pointer"
                        title="All mined"
                      />
                    ) : undefined
                  }
                  typeID={o.typeID}
                  name={o.name}
                  progress={progress}
                  barMuted={isGray}
                  below={
                    showOreHints && !isComplete && o.asteroids && o.asteroids.length > 0 ? (
                      <div className="text-[10px] text-muted/80 truncate">↳ {o.asteroids.join(", ")}</div>
                    ) : undefined
                  }
                >
                  <span className="shrink-0 tabular-nums">
                    {formatCompact(o.minedVol)} / {formatCompact(o.neededVol)}
                  </span>
                </ItemRow>
              );
            })}
          </div>
        )}
        {productionLeft > 0 && (
          <div>
            Production: {formatProductionTime(productionLeft)} left
          </div>
        )}
        {totalOre <= 0 && productionLeft <= 0 && !stage && !syncing && (
          <div className="italic">Select a build and add items in the desktop app.</div>
        )}
      </div>
      )}
    </OverlayFrame>
  );
}

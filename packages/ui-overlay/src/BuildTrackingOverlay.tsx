import React, { useState, useEffect, useCallback, useRef } from "react";
import type { BuilderOverlayState } from "./preload.d";
import { OverlayFrame } from "./components/OverlayFrame";
import { useEfOverlay } from "./hooks/useEfOverlay";

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

  return (
    <OverlayFrame title={titleWithDot} buildId={buildId}>
      {(locked) => (
      <div className="text-[0.8rem] text-muted space-y-1.5">
        <div className="flex items-center gap-2 mb-1">
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
          <span className="text-[0.75rem] text-muted">
            {trackingBuildId === buildId ? "Tracking" : "Paused"}
          </span>
        </div>
        {totalOre > 0 && (
          <div>
            Mining: {miningPct}% ({formatCompact(mined)} / {formatCompact(totalOre)} m³)
          </div>
        )}
        {miningOres.length > 0 && (
          <div className="space-y-1">
            {miningOres.map((o, i) => {
              const progress = o.neededVol > 0 ? o.minedVol / o.neededVol : 0;
              const key = `${i}-${o.name}-${o.neededVol}`;
              const isComplete = progress >= 1;
              const isBlinking = blinkingOres.has(key);
              const isGray = isComplete && !isBlinking;
              const rowCls = [
                "flex items-center gap-2 transition-opacity duration-300",
                isBlinking && "ore-complete-blink",
                isGray && "ore-complete-gray",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={key} className={rowCls}>
                  <span className="text-text min-w-[100px] truncate">{o.name}</span>
                  <div className="flex-1 min-w-0 h-1 rounded-full bg-amber-500/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isGray ? "bg-muted" : "bg-blue-500"}`}
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0">
                    {formatCompact(o.minedVol)} / {formatCompact(o.neededVol)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {productionLeft > 0 && (
          <div>
            Production: {formatProductionTime(productionLeft)} left
          </div>
        )}
        {totalOre <= 0 && productionLeft <= 0 && (
          <div className="italic">Select a build and add items in the desktop app.</div>
        )}
      </div>
      )}
    </OverlayFrame>
  );
}

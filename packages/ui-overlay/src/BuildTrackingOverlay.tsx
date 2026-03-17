import React, { useState, useEffect, useCallback, useRef } from "react";
import type { BuilderOverlayState } from "./preload.d";
import { OverlayFrame } from "./components/OverlayFrame";
import { useEfOverlay } from "./hooks/useEfOverlay";

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

export function BuildTrackingOverlay() {
  const api = useEfOverlay();
  const [state, setState] = useState<BuilderOverlayState>({});

  const load = useCallback(async () => {
    const getState = api?.overlay?.getBuilderState;
    if (!getState) return;
    try {
      const s = await getState();
      setState(s ?? {});
    } catch (err) {
      console.error(err);
    }
  }, [api?.overlay?.getBuilderState]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, 500);
    return () => clearInterval(id);
  }, [load]);

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

  return (
    <OverlayFrame title={`Build: ${buildName}`}>
      <div className="text-[0.8rem] text-muted space-y-1.5">
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
    </OverlayFrame>
  );
}

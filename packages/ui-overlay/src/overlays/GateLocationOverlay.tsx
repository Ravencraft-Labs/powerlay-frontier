import React, { useCallback, useEffect, useState } from "react";
import { OverlayFrame } from "../components/OverlayFrame";
import { GateLocationPicker } from "../components/GateLocationPicker";
import { useEfOverlay } from "../hooks/useEfOverlay";
import type { PocGatePlacement } from "../preload.d";

const GATE_TYPE_NAMES: Record<number, string> = { 88086: "Mini Gate", 84955: "Heavy Gate", 95627: "Mini Catapult", 95677: "Heavy Catapult" };

/** How long the "saved" line stays before the prompt hides itself. */
const CLOSE_AFTER_MS = 1200;

/**
 * Mini-overlay: where does this one gate stand in its system ("P2L4")? Pops up after a jump through a deployable
 * gate or after scouting one (the main process opens it), hides itself once answered.
 */
export function GateLocationOverlay() {
  const api = useEfOverlay();
  const [placement, setPlacement] = useState<PocGatePlacement | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPlacement((await api?.pocMap?.getGatePlacement?.()) ?? null);
  }, [api]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 1000);
    return () => clearInterval(t);
  }, [load]);

  // A new gate to place: forget the previous "saved" line.
  useEffect(() => setSaved(null), [placement?.gateId]);

  const close = () => {
    void api?.pocMap?.dismissGatePlacement?.();
    void api?.overlay?.hide?.("gateloc");
  };

  const name = (id: number | null, known: string | null) => known ?? (id != null ? String(id) : "?");

  return (
    <OverlayFrame title="Gate location">
      <div className="overlay-no-drag flex flex-col gap-1.5 text-[11px]">
        {!placement ? (
          <span className="text-muted">No gate to place.</span>
        ) : (
          <>
            <div className="flex flex-col">
              <span className="text-text font-medium">
                {placement.typeId != null ? GATE_TYPE_NAMES[placement.typeId] ?? "Gate" : "Gate"}
                {placement.ownerName ? <span className="text-muted font-normal"> · {placement.ownerName}</span> : null}
              </span>
              <span className="text-muted">
                in <span className="text-text">{name(placement.systemId, placement.systemName)}</span>
                {placement.toSystemId != null && (
                  <>
                    {" "}→ <span className="text-text">{name(placement.toSystemId, placement.toSystemName)}</span>
                  </>
                )}
              </span>
            </div>
            <GateLocationPicker
              key={placement.gateId}
              location={saved ?? placement.location}
              onPick={async (location) => {
                await api?.pocMap?.setGateLocation?.(placement.gateId, placement.systemId, location);
                setSaved(location);
                setTimeout(close, CLOSE_AFTER_MS);
              }}
            />
            <div className="flex items-center gap-2">
              {saved && <span className="text-green-400">✓ Saved: {saved}</span>}
              <button type="button" className="ml-auto text-muted hover:text-text bg-transparent border-0 cursor-pointer" onClick={close}>
                {saved ? "close" : "skip"}
              </button>
            </div>
          </>
        )}
      </div>
    </OverlayFrame>
  );
}

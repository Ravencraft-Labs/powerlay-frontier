import React, { useState } from "react";

const pickBtn = (on: boolean) =>
  `min-w-[1.4rem] px-1 py-0.5 rounded border cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default ${
    on ? "text-accent border-accent/60 bg-accent/15" : "bg-transparent border-border/40 text-muted hover:border-border hover:text-text"
  }`;

/** "P2L4" → planet 2; anything else → null. */
function planetOf(location: string | null): number | null {
  const m = /^P(\d+)/.exec(location ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * Where a gate stands: planet, then Lagrange point ("P2L4"), or at the planet / star. Clicks only — overlays
 * take no typing. `location` is the current answer, highlighted.
 */
export function GateLocationPicker({ location, onPick }: { location: string | null; onPick: (location: string) => void }) {
  const [planet, setPlanet] = useState<number | null>(planetOf(location));
  const lagrange = /L(\d)$/.exec(location ?? "")?.[1];

  return (
    <div className="flex flex-col gap-1 text-[10px]">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="w-3 text-muted">P</span>
        {Array.from({ length: 8 }, (_, i) => i + 1).map((p) => (
          <button key={p} type="button" className={pickBtn(planet === p)} onClick={() => setPlanet(p)}>
            {p}
          </button>
        ))}
        <button type="button" className={pickBtn(location === "Star")} onClick={() => onPick("Star")} title="At the star">
          Star
        </button>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="w-3 text-muted">L</span>
        {Array.from({ length: 5 }, (_, i) => i + 1).map((l) => (
          <button
            key={l}
            type="button"
            className={pickBtn(planet === planetOf(location) && lagrange === String(l))}
            disabled={planet == null}
            onClick={() => onPick(`P${planet}L${l}`)}
          >
            {l}
          </button>
        ))}
        <button
          type="button"
          className={pickBtn(location != null && location === `P${planet}`)}
          disabled={planet == null}
          onClick={() => onPick(`P${planet}`)}
          title="At the planet itself"
        >
          planet
        </button>
      </div>
    </div>
  );
}

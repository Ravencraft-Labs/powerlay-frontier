// POC: dormant NPC stargates (Stargate Depot: "Dormant – restoration needed"), marked by hand. The depot window
// has nothing to copy but its title, so the destination is entered as a name, the title, or a pasted system link.
import React, { useState } from "react";
import { EDGE_COLORS, type MapData, type Pt } from "./useMapData";

const btnCls =
  "px-2 py-0.5 text-[11px] rounded-md border border-border/60 text-muted hover:text-text hover:border-border cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-default";
const inputCls = "w-full px-2 py-1 bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg";

export function DormantGatesPanel({ data, systemId, onFocus }: { data: MapData; systemId: number | null; onFocus: (p: Pt) => void }) {
  const { dormantGates, setDormantGates, byId, nameOf, linkById } = data;
  const [dest, setDest] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const label = (id: number) => {
    const p = byId.get(id);
    return p ? nameOf(p) : linkById.get(id)?.name ?? String(id);
  };
  const here = systemId == null ? [] : dormantGates.filter((g) => g.fromSystemId === systemId || g.toSystemId === systemId);

  async function add() {
    const res = await window.efOverlay?.pocMap?.addDormant?.(systemId, dest, note);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.gate) setDormantGates((prev) => [...prev, res.gate!]);
    setDest("");
    setNote("");
    setError(null);
  }

  return (
    <div className="p-3 rounded-md border border-border/50 bg-bg/40 text-xs text-muted flex flex-col gap-1.5">
      <div className="text-text font-medium">
        <span style={{ color: EDGE_COLORS.dormant }}>┄</span> Dormant NPC stargates
        {systemId != null && <span className="font-normal text-muted"> · {label(systemId)}</span>}
      </div>
      {systemId == null && <div>Select a system, or be in one, to mark its gates.</div>}
      {here.length > 0 && (
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
          {here.map((g) => {
            const otherId = g.fromSystemId === systemId ? g.toSystemId : g.fromSystemId;
            const other = otherId != null ? byId.get(otherId) : undefined;
            return (
              <div key={g.id} className="flex items-start gap-1.5">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer hover:text-text disabled:cursor-default"
                  onClick={() => other && onFocus(other)}
                  disabled={!other}
                >
                  <span className="text-text">
                    {g.fromSystemId === systemId ? "→" : "←"} {otherId != null ? label(otherId) : g.toName}
                  </span>
                  {g.toSystemId == null && <span> · ID unknown: copy a chat link to {g.toName}</span>}
                  {g.note && <div className="pl-3">{g.note}</div>}
                </button>
                <button
                  type="button"
                  className="text-muted hover:text-text bg-transparent border-0 p-0 cursor-pointer"
                  title="Remove (it is also removed when you jump through this gate)"
                  onClick={async () => {
                    await window.efOverlay?.pocMap?.removeDormant?.(g.id);
                    setDormantGates((prev) => prev.filter((x) => x.id !== g.id));
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      {systemId != null && (
        <>
          <input
            className={inputCls}
            placeholder="Destination: P9L|121, depot title or link"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
          />
          <input
            className={inputCls}
            placeholder="Note (optional): R-Type, materials…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
          />
          <button type="button" className={btnCls} disabled={!dest.trim()} onClick={() => void add()}>
            Mark dormant gate from {label(systemId)}
          </button>
        </>
      )}
      {error && <div className="text-amber-400">{error}</div>}
    </div>
  );
}

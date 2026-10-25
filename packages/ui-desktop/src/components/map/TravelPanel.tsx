// POC: travel journal of the current game session (from LogLite) — how each system change happened and,
// for deployable gates, whose gate it was (looked up on chain by the main process).
import React, { useEffect, useState } from "react";
import type { GateOwner, TravelHop, TravelVia } from "@powerlay/core";
import { TRAVEL_COLOR, type MapData, type Pt } from "./useMapData";

const VIA_LABEL: Record<TravelVia, string> = {
  stargate: "NPC stargate",
  "deployable-gate": "Deployable gate",
  "ship-jump": "Ship jump",
  respawn: "Respawn",
};

/** On-chain gate types (the only deployable gates the chain knows). */
const GATE_TYPE_NAMES: Record<number, string> = { 88086: "Mini Gate", 84955: "Heavy Gate" };

function ownerText(owner: GateOwner | undefined, myTribeId: number | null): string {
  if (!owner || owner.kind === "unknown") return owner?.error ? `owner lookup failed (${owner.error}), retrying` : "looking up owner…";
  if (owner.kind === "offchain") return "not on chain: catapult or server gate";
  const parts = [owner.typeId != null ? GATE_TYPE_NAMES[owner.typeId] ?? `type ${owner.typeId}` : "gate"];
  if (owner.characterName) parts.push(owner.characterName);
  if (owner.tribeId != null) parts.push(owner.tribeId === myTribeId ? "your tribe" : `tribe ${owner.tribeId}`);
  if (!owner.online) parts.push("offline now");
  return parts.join(" · ");
}

const btnCls =
  "px-2 py-0.5 text-[11px] rounded-md border border-border/60 text-muted hover:text-text hover:border-border cursor-pointer bg-transparent";

export function TravelPanel({ data, onFocus }: { data: MapData; onFocus: (p: Pt) => void }) {
  const { sessionHops, travel, setTravel, byId, nameOf, linkById, logLite } = data;
  const [myTribeId, setMyTribeId] = useState<number | null>(null);

  useEffect(() => {
    void window.efOverlay?.auth?.getSession().then((s) => {
      const t = Number(s?.tribeId);
      setMyTribeId(Number.isFinite(t) && t > 0 ? t : null);
    });
  }, []);

  const label = (id: number) => {
    const p = byId.get(id);
    return p ? nameOf(p) : linkById.get(id)?.name ?? String(id);
  };
  const systems = new Set(sessionHops.flatMap((h) => [h.fromSystemId, h.toSystemId])).size;
  const recent: TravelHop[] = [...sessionHops].reverse();

  return (
    <div className="p-3 rounded-md border border-border/50 bg-bg/40 text-xs text-muted flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-text font-medium">
          <span style={{ color: TRAVEL_COLOR }}>—</span> Travel this session
        </span>
        <button
          type="button"
          className={btnCls}
          title="Start the session path over (it also restarts when the game client reconnects)"
          onClick={async () => setTravel((await window.efOverlay?.pocMap?.clearTravel?.()) ?? null)}
        >
          Clear
        </button>
      </div>
      {logLite?.state === "off" && <div className="text-amber-400">Turn on "Read LogLite" above to record jumps.</div>}
      <div>
        {sessionHops.length} jump{sessionHops.length === 1 ? "" : "s"} · {systems} system{systems === 1 ? "" : "s"}
        {travel?.sessionStartedAt ? ` · since ${new Date(travel.sessionStartedAt).toLocaleTimeString()}` : ""}
      </div>
      <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
        {recent.map((h, i) => {
          const to = byId.get(h.toSystemId);
          return (
            <button
              key={`${h.at}-${i}`}
              type="button"
              className="text-left bg-transparent border-0 p-0 cursor-pointer hover:bg-border/40 rounded"
              onClick={() => to && onFocus(to)}
              disabled={!to}
              title={h.gateId != null ? `Gate ${h.gateId}` : undefined}
            >
              <div className="text-text">
                <span className="text-muted">{new Date(h.at).toLocaleTimeString()}</span> {label(h.fromSystemId)} → {label(h.toSystemId)}
              </div>
              <div className="pl-2">
                {VIA_LABEL[h.via]}
                {h.via === "deployable-gate" ? ` · ${ownerText(h.gateOwner, myTribeId)}` : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

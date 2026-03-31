import React, { useState } from "react";
import { DemoModal } from "./DemoModal";
import { demoBtnCls } from "./demoUi";

const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";

export function ScoutSection() {
  const [riftsOpen, setRiftsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  return (
    <section className={sectionCls}>
      <h2 className="m-0 text-base font-semibold text-text">Scout</h2>
      <p className="text-sm text-muted mt-2 mb-4 m-0 leading-relaxed max-w-2xl">
        Find rifts and rich resource pockets before you commit haulers. These controls are placeholders for a future scouting workflow.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={demoBtnCls} onClick={() => setRiftsOpen(true)}>
          Scout rifts (demo)
        </button>
        <button type="button" className={demoBtnCls} onClick={() => setResourcesOpen(true)}>
          Scout resources (demo)
        </button>
      </div>

      {riftsOpen && (
        <DemoModal title="Rift signatures (demo)" titleId="scout-rifts-title" onClose={() => setRiftsOpen(false)} panelClassName="max-w-lg w-full">
          <ul className="list-none m-0 p-0 space-y-2 text-sm text-muted">
            <li className="flex justify-between gap-4 border-b border-border/40 pb-2">
              <span>Fora · Belt cluster γ</span>
              <span className="text-text tabular-nums">Unstable · 2.4k km</span>
            </li>
            <li className="flex justify-between gap-4 border-b border-border/40 pb-2">
              <span>Hope · Deep scan</span>
              <span className="text-text tabular-nums">Quiet · 890 km</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Local · Anomaly echo</span>
              <span className="text-text tabular-nums">Unknown · —</span>
            </li>
          </ul>
          <p className="text-xs text-muted m-0 mt-3">Mock list — no live scan data.</p>
        </DemoModal>
      )}

      {resourcesOpen && (
        <DemoModal title="Resource prospects (demo)" titleId="scout-res-title" onClose={() => setResourcesOpen(false)} panelClassName="max-w-lg w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-border/50 bg-bg/40 px-3 py-2">
              <div className="text-xs text-muted">Hot spot</div>
              <div className="text-text">Silicates · dense</div>
              <div className="text-xs text-muted mt-1">Est. yield 18k / hr (mock)</div>
            </div>
            <div className="rounded border border-border/50 bg-bg/40 px-3 py-2">
              <div className="text-xs text-muted">Reserve</div>
              <div className="text-text">Tritanium · medium</div>
              <div className="text-xs text-muted mt-1">Est. yield 9k / hr (mock)</div>
            </div>
          </div>
          <p className="text-xs text-muted m-0 mt-3">Prospecting overlay is not connected.</p>
        </DemoModal>
      )}
    </section>
  );
}

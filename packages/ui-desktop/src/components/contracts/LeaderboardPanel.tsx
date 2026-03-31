import React from "react";

const sectionCls = "rounded-lg border border-border/60 bg-bg/30 overflow-hidden";
const thCls = "text-left text-xs font-medium text-muted px-3 py-2 border-b border-border/60";
const tdCls = "text-sm text-text px-3 py-2 border-b border-border/40";

const MEMBERS = [
  { name: "Raven.A", deliveries: 47, tokens: 12800, contractsJoined: 12 },
  { name: "Voidwalker", deliveries: 31, tokens: 9100, contractsJoined: 9 },
  { name: "0x7a3…c91", deliveries: 22, tokens: 5400, contractsJoined: 7 },
  { name: "NovaUnit", deliveries: 18, tokens: 4200, contractsJoined: 5 },
] as const;

const EFFORTS = [
  { title: "Storage restock — Forward base", role: "Creator", impact: "High", share: "38%" },
  { title: "Public ore run", role: "Participant", impact: "Medium", share: "22%" },
  { title: "Ice haul — Polar route", role: "Participant", impact: "Low", share: "9%" },
] as const;

export function LeaderboardPanel() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted m-0 leading-relaxed">
        Clan impact and contract efforts (demo data). Real rankings will sync from Powerlay when available.
      </p>

      <div>
        <h3 className="m-0 text-xs font-semibold text-text uppercase tracking-wide mb-2">Clan members</h3>
        <div className={sectionCls}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thCls}>Member</th>
                <th className={`${thCls} tabular-nums`}>Deliveries</th>
                <th className={`${thCls} tabular-nums`}>Tokens (est.)</th>
                <th className={`${thCls} tabular-nums`}>Contracts</th>
              </tr>
            </thead>
            <tbody>
              {MEMBERS.map((m) => (
                <tr key={m.name}>
                  <td className={tdCls}>{m.name}</td>
                  <td className={`${tdCls} tabular-nums text-muted`}>{m.deliveries}</td>
                  <td className={`${tdCls} tabular-nums text-muted`}>{m.tokens.toLocaleString()}</td>
                  <td className={`${tdCls} tabular-nums text-muted`}>{m.contractsJoined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="m-0 text-xs font-semibold text-text uppercase tracking-wide mb-2">Contract efforts</h3>
        <div className={sectionCls}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thCls}>Contract</th>
                <th className={thCls}>Your role</th>
                <th className={thCls}>Impact</th>
                <th className={`${thCls} tabular-nums`}>Clan share</th>
              </tr>
            </thead>
            <tbody>
              {EFFORTS.map((e) => (
                <tr key={e.title}>
                  <td className={tdCls}>{e.title}</td>
                  <td className={`${tdCls} text-muted`}>{e.role}</td>
                  <td className={`${tdCls} text-muted`}>{e.impact}</td>
                  <td className={`${tdCls} tabular-nums text-muted`}>{e.share}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

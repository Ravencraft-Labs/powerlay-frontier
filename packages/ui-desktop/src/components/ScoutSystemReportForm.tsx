import React, { useState } from "react";
import type { CreateScoutEntryInput, ScoutVisibility, SystemReport } from "@powerlay/core";

interface Props {
  currentSystem: string;
  defaultVisibility: ScoutVisibility;
  onSubmit: (input: CreateScoutEntryInput) => void;
}

const inputCls = "w-full px-2 py-1.5 text-sm bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg";
const labelCls = "block text-xs text-muted mb-1";
const pillCls = (on: boolean) =>
  `min-w-[2rem] px-2.5 py-1 text-xs font-medium rounded border cursor-pointer ${
    on
      ? "border-selection-bg bg-selection-bg/15 text-text"
      : "border-border/50 text-muted hover:text-text hover:border-border bg-transparent"
  }`;

/** Skip + 1..max buttons; null = skipped. */
function LevelPicker({ max, value, onChange }: { max: number; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={pillCls(value === null)} onClick={() => onChange(null)}>Skip</button>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={pillCls(value === n)} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

/** What a player reads off a system in game: planets, spectral class, transient mass, infestation index. */
export function ScoutSystemReportForm({ currentSystem, defaultVisibility, onSubmit }: Props) {
  const [planets, setPlanets] = useState("");
  const [spectralClass, setSpectralClass] = useState("");
  const [transientMass, setTransientMass] = useState<number | null>(null);
  const [infestationIndex, setInfestationIndex] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const planetsNum = planets.trim() === "" ? null : Number(planets);
  const planetsValid = planetsNum === null || (Number.isInteger(planetsNum) && planetsNum >= 0 && planetsNum <= 99);
  const report: SystemReport = {
    ...(planetsNum !== null && planetsValid && { planets: planetsNum }),
    ...(spectralClass.trim() && { spectralClass: spectralClass.trim().toUpperCase() }),
    ...(transientMass !== null && { transientMass }),
    ...(infestationIndex !== null && { infestationIndex }),
  };
  const canSubmit = !!currentSystem.trim() && planetsValid && Object.keys(report).length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      system: currentSystem.trim(),
      type: "system",
      visibility: defaultVisibility,
      reporter: "manual",
      report,
      ...(notes.trim() && { notes: notes.trim() }),
    });
    setPlanets("");
    setSpectralClass("");
    setTransientMass(null);
    setInfestationIndex(null);
    setNotes("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="w-28">
          <label className={labelCls}>Planets</label>
          <input
            className={`${inputCls} ${planetsValid ? "" : "border-red-400/60"}`}
            type="number"
            min={0}
            max={99}
            value={planets}
            onChange={(e) => setPlanets(e.target.value)}
            placeholder="Show Info"
          />
        </div>
        <div className="w-28">
          <label className={labelCls}>Spectral class</label>
          <input
            className={inputCls}
            type="text"
            value={spectralClass}
            onChange={(e) => setSpectralClass(e.target.value)}
            placeholder="e.g. M6"
            maxLength={8}
          />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Transient mass</label>
        <LevelPicker max={5} value={transientMass} onChange={setTransientMass} />
      </div>

      <div>
        <label className={labelCls}>Infestation index</label>
        <LevelPicker max={6} value={infestationIndex} onChange={setInfestationIndex} />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="self-start px-4 py-1.5 text-sm font-medium rounded-md bg-selection-bg text-bg hover:opacity-90 cursor-pointer border-0 disabled:opacity-40 disabled:cursor-default"
      >
        Save report
      </button>
    </form>
  );
}

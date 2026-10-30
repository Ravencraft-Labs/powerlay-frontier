import React, { useEffect, useState } from "react";
import { withReportField } from "@powerlay/core";
import type { SystemReport } from "@powerlay/core";

const inputCls = "w-full px-2 py-1.5 text-sm bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg";
const labelCls = "block text-xs text-muted mb-1";
const pillCls = (on: boolean) =>
  `min-w-[1.75rem] px-2 py-0.5 text-xs font-medium rounded border cursor-pointer disabled:opacity-40 disabled:cursor-default ${
    on
      ? "border-teal-400/60 bg-teal-400/15 text-teal-300"
      : "border-border/50 text-muted hover:text-text hover:border-border bg-transparent"
  }`;

/** 1..max buttons; clicking the selected one clears it. */
function LevelPicker({ max, value, disabled, onChange }: {
  max: number;
  value: number | undefined;
  disabled: boolean;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          className={pillCls(value === n)}
          onClick={() => onChange(value === n ? undefined : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

interface LevelsProps {
  system: string;
  report: SystemReport | undefined;
  onSave: (report: SystemReport) => void;
}

/** Transient mass + infestation index: always visible, one click saves to the system's report. */
export function ScoutReportLevels({ system, report, onSave }: LevelsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted w-24 text-right">Transient mass</span>
        <LevelPicker
          max={5}
          value={report?.transientMass}
          disabled={!system}
          onChange={(v) => onSave(withReportField(report, "transientMass", v))}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted w-24 text-right">Infestation</span>
        <LevelPicker
          max={6}
          value={report?.infestationIndex}
          disabled={!system}
          onChange={(v) => onSave(withReportField(report, "infestationIndex", v))}
        />
      </div>
    </div>
  );
}

interface FormProps {
  system: string;
  report: SystemReport | undefined;
  notes: string | undefined;
  onSave: (report: SystemReport, notes: string | undefined) => void;
}

/** Planets + spectral class + notes for the system's report (read from Show Info). */
export function ScoutSystemReportForm({ system, report, notes, onSave }: FormProps) {
  const [planets, setPlanets] = useState("");
  const [spectralClass, setSpectralClass] = useState("");
  const [notesText, setNotesText] = useState("");

  // Prefill from the saved report whenever the system or its report changes.
  useEffect(() => {
    setPlanets(report?.planets !== undefined ? String(report.planets) : "");
    setSpectralClass(report?.spectralClass ?? "");
    setNotesText(notes ?? "");
  }, [system, report?.planets, report?.spectralClass, notes]);

  const planetsNum = planets.trim() === "" ? undefined : Number(planets);
  const planetsValid = planetsNum === undefined || (Number.isInteger(planetsNum) && planetsNum >= 0 && planetsNum <= 99);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!system || !planetsValid) return;
    let next = withReportField(report, "planets", planetsNum);
    next = withReportField(next, "spectralClass", spectralClass.trim().toUpperCase() || undefined);
    onSave(next, notesText.trim() || undefined);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="w-24">
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
      <div className="w-24">
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
        <input className={inputCls} type="text" value={notesText} onChange={(e) => setNotesText(e.target.value)} />
      </div>
      <button
        type="submit"
        disabled={!system || !planetsValid}
        className="px-4 py-1.5 text-sm font-medium rounded-md bg-selection-bg text-bg hover:opacity-90 cursor-pointer border-0 disabled:opacity-40 disabled:cursor-default"
      >
        Save
      </button>
    </form>
  );
}

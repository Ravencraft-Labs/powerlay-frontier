import React, { useState } from "react";
import type { CreateScoutEntryInput, ScoutEntryType, RiftZone, ScoutVisibility } from "@powerlay/core";

const RIFT_ZONES: RiftZone[] = ["RIFT", "INNER", "TROJAN", "FRINGE", "OUTER", "FERAL"];
const VISIBILITY_LABELS: Record<ScoutVisibility, string> = {
  tribe: "Tribe",
  alliance: "Alliance",
  private: "Private",
};

const TYPE_SUBTYPES: Record<ScoutEntryType, string[]> = {
  rift: ["Rift 05D8", "Rift F935", "Rift 0633", "Rift F8DA", "Rift F9BF", "Rift 0769", "Rift 0020"],
  anomaly: ["Combat Site", "Data Site", "Relic Site", "Ore Site", "Ghost Site"],
  resource: ["Veldspar", "Scordite", "Pyroxeres", "Plagioclase", "Omber", "Kernite"],
  structure: ["Enemy Structure", "Neutral Structure", "Deployed Object", "Gate", "NPC Station"],
  note: [],
};

interface Props {
  currentSystem: string;
  defaultVisibility: ScoutVisibility;
  onSubmit: (input: CreateScoutEntryInput) => void;
}

const inputCls = "w-full px-2 py-1.5 text-sm bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg";
const selectCls = "w-full px-2 py-1.5 text-sm bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg";
const labelCls = "block text-xs text-muted mb-1";

export function ScoutAddEntryForm({ currentSystem, defaultVisibility, onSubmit }: Props) {
  const [type, setType] = useState<ScoutEntryType>("rift");
  const [subtype, setSubtype] = useState("");
  const [zone, setZone] = useState<RiftZone | "">("");
  const [stability, setStability] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<ScoutVisibility>(defaultVisibility);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentSystem.trim()) return;
    const input: CreateScoutEntryInput = {
      system: currentSystem.trim(),
      type,
      visibility,
      reporter: "manual",
      ...(subtype.trim() && { subtype: subtype.trim() }),
      ...(type === "rift" && zone && { zone: zone as RiftZone }),
      ...(type === "rift" && stability !== "" && Number.isFinite(Number(stability)) && {
        stability: Math.min(100, Math.max(0, Number(stability))),
      }),
      ...(notes.trim() && { notes: notes.trim() }),
    };
    onSubmit(input);
    setSubtype("");
    setZone("");
    setStability("");
    setNotes("");
  }

  const suggestedSubtypes = TYPE_SUBTYPES[type];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={labelCls}>Type</label>
          <select
            className={selectCls}
            value={type}
            onChange={(e) => { setType(e.target.value as ScoutEntryType); setSubtype(""); setZone(""); }}
          >
            <option value="rift">Rift</option>
            <option value="anomaly">Anomaly</option>
            <option value="resource">Resource</option>
            <option value="structure">Structure / POI</option>
            <option value="note">Note</option>
          </select>
        </div>
        <div className="flex-1">
          <label className={labelCls}>Visibility</label>
          <select
            className={selectCls}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ScoutVisibility)}
          >
            {(Object.entries(VISIBILITY_LABELS) as [ScoutVisibility, string][]).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className={labelCls}>
            {type === "rift" ? "Rift type" : type === "anomaly" ? "Site type" : type === "resource" ? "Ore / Resource" : type === "structure" ? "Object type" : "Subtype (optional)"}
          </label>
          {suggestedSubtypes.length > 0 ? (
            <select className={selectCls} value={subtype} onChange={(e) => setSubtype(e.target.value)}>
              <option value="">— select or type —</option>
              {suggestedSubtypes.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__custom">Custom…</option>
            </select>
          ) : (
            <input className={inputCls} type="text" value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="Optional" />
          )}
          {subtype === "__custom" && (
            <input className={`${inputCls} mt-1`} type="text" placeholder="Enter custom subtype" autoFocus
              onChange={(e) => setSubtype(e.target.value)} />
          )}
        </div>

        {type === "rift" && (
          <div className="flex-1">
            <label className={labelCls}>Zone</label>
            <select className={selectCls} value={zone} onChange={(e) => setZone(e.target.value as RiftZone | "")}>
              <option value="">— zone —</option>
              {RIFT_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        )}

        {type === "rift" && (
          <div className="w-24">
            <label className={labelCls}>Stability %</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              max={100}
              value={stability}
              onChange={(e) => setStability(e.target.value)}
              placeholder="0–100"
            />
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <input
          className={inputCls}
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional info…"
        />
      </div>

      <button
        type="submit"
        className="self-start px-4 py-1.5 text-sm font-medium rounded-md bg-selection-bg text-bg hover:opacity-90 cursor-pointer border-0"
      >
        Add entry
      </button>
    </form>
  );
}

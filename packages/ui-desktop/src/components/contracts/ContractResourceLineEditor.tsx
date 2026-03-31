import React from "react";
import type { ContractLineDraftInput } from "@powerlay/core";
import type { GameData } from "../../preload";
import { ResourceTypeSearch } from "./ResourceTypeSearch";

export interface ContractResourceLineEditorProps {
  line: ContractLineDraftInput;
  types: GameData["types"];
  oreGroupIDs?: number[];
  blueprints?: GameData["blueprints"];
  onChange: (next: ContractLineDraftInput) => void;
  onRemove: () => void;
}

export function ContractResourceLineEditor({ line, types, oreGroupIDs, blueprints, onChange, onRemove }: ContractResourceLineEditorProps) {
  const inputCls =
    "w-full min-w-0 px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_88px_88px_100px_auto] gap-2 items-center py-2 border-b border-border/80 last:border-b-0">
      <ResourceTypeSearch
        types={types}
        oreGroupIDs={oreGroupIDs}
        blueprints={blueprints}
        typeID={line.typeID > 0 ? line.typeID : undefined}
        onChange={(typeID, resourceName) => onChange({ ...line, typeID, resourceName })}
      />
      <input
        type="number"
        min={1}
        step={1}
        className={inputCls}
        value={line.requiredAmount || ""}
        onChange={(e) => onChange({ ...line, requiredAmount: Math.max(0, parseInt(e.target.value, 10) || 0) })}
        title="Required amount"
      />
      <input
        type="number"
        min={0}
        step={1}
        className={inputCls}
        value={line.rewardTokensFullLine || ""}
        onChange={(e) => onChange({ ...line, rewardTokensFullLine: Math.max(0, parseInt(e.target.value, 10) || 0) })}
        title="Tokens if full amount delivered"
      />
      <input
        className={inputCls}
        value={line.assigneeText ?? ""}
        onChange={(e) => onChange({ ...line, assigneeText: e.target.value || undefined })}
        placeholder="Assignee"
        title="Optional assignee callsign"
      />
      <button
        type="button"
        className="cursor-pointer px-2 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface shrink-0"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

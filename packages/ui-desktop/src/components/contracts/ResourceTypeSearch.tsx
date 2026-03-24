import React, { useEffect, useMemo, useState } from "react";
import { normalizeTypeDisplayName, searchTypesForContractResources } from "@powerlay/core";
import type { GameData } from "../../preload";
import { parseGamePaste } from "../../utils/format";
import { ItemIcon } from "../ItemIcon";

const MAX_RESULTS = 50;
/** Avoid listing ~10k alphabetically-first types on focus; builder-style pickers expect typing first. */
const MIN_QUERY_LEN = 2;

export interface ResourceTypeSearchProps {
  types: GameData["types"];
  /** Same ore `groupID` list as builder mining (`gameData.oreGroupIDs`); ores stay visible despite tiny volume. */
  oreGroupIDs?: number[];
  /** Industry blueprints (merged raw + structure recipes); when present, list is limited to ores + blueprint materials/products. */
  blueprints?: GameData["blueprints"];
  typeID: number | undefined;
  onChange: (typeID: number, name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ResourceTypeSearch({
  types,
  oreGroupIDs,
  blueprints,
  typeID,
  onChange,
  disabled,
  placeholder = "Search resource…",
}: ResourceTypeSearchProps) {
  const name = typeID != null ? types[String(typeID)]?.name ?? String(typeID) : "";
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(name);
  }, [name]);

  const selectedNormalized =
    typeID != null && typeID > 0 ? normalizeTypeDisplayName(types[String(typeID)]?.name ?? "") : "";
  const queryNormalized = normalizeTypeDisplayName(query);
  const isUnmodifiedSelection =
    typeID != null &&
    typeID > 0 &&
    selectedNormalized.length > 0 &&
    queryNormalized === selectedNormalized;

  const matches = useMemo(() => {
    if (isUnmodifiedSelection) return [];
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) return [];
    const all = searchTypesForContractResources(types, q, oreGroupIDs, blueprints);
    return all.slice(0, MAX_RESULTS);
  }, [types, query, oreGroupIDs, blueprints, isUnmodifiedSelection]);

  const hasTypes = Object.keys(types).length > 0;

  const pasteFromClipboard = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      setQuery(parseGamePaste(raw));
      setOpen(true);
    } catch {
      /* ignore */
    }
  };

  const showSelectedIcon = typeID != null && typeID > 0;

  return (
    <div className="relative min-w-[140px] flex-1">
      <div className="flex items-center gap-2 w-full rounded-md border border-border-input bg-bg focus-within:border-muted">
        {showSelectedIcon && (
          <span className="pl-2 shrink-0 flex items-center" aria-hidden>
            <ItemIcon typeID={typeID} size={20} className="rounded-sm" fallback="·" />
          </span>
        )}
        <input
          className={`flex-1 min-w-0 py-1.5 pr-2 rounded-md bg-transparent text-text text-sm focus:outline-none border-0 ${showSelectedIcon ? "pl-0" : "pl-2"}`}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            pasteFromClipboard();
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={hasTypes ? placeholder : "Load game data"}
        />
      </div>
      {open && hasTypes && !disabled && (
        <ul className="absolute top-full left-0 right-0 m-0 p-0 list-none bg-surface border border-border rounded-md max-h-[200px] overflow-y-auto z-20 shadow-lg">
          {matches.length > 0 ? (
            matches.map((m) => (
              <li
                key={m.typeID}
                className="flex items-center gap-2 py-1.5 px-3 cursor-pointer text-sm hover:bg-border"
                onMouseDown={() => {
                  onChange(m.typeID, m.name);
                  setQuery(m.name);
                  setOpen(false);
                }}
              >
                <ItemIcon typeID={m.typeID} size={20} className="rounded-sm shrink-0" fallback="·" />
                <span className="min-w-0 truncate">{m.name}</span>
              </li>
            ))
          ) : (
            <li className="py-1.5 px-3 text-muted text-sm">
              {isUnmodifiedSelection
                ? "Edit the name to search for a different resource…"
                : query.trim().length < MIN_QUERY_LEN
                  ? `Type at least ${MIN_QUERY_LEN} characters…`
                  : "No matches"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

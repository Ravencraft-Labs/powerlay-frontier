import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { BuildPlan, Facility, PlannedItem, Laser, ProductionTreeNode, ProductionNetworkGraph, BlueprintOption } from "@powerlay/core";
import {
  FACILITY_TYPES,
  PRODUCIBLE_ITEMS,
  LASER_TYPES,
  totalOreFromPlannedItems,
  oreMass,
  oreVolume,
  laserLensesNeeded,
  fuelNeededForOre,
  timeToMineOre,
  timeToRefineOre,
  searchTypesByName,
  getProducibleTypeIds,
  getBlueprintOptionsForProduct,
  totalMaterialsFromPlannedItems,
  totalMassFromMaterials,
  totalVolumeFromMaterials,
  buildProductionGraph,
  buildProductionTree,
  buildProductionNetworkGraph,
  getBaseMaterialsFromTrees,
  getAllMaterialsFromTrees,
  laserLensesNeededFromAmount,
  fuelNeededFromAmount,
  timeToMineFromAmount,
  timeToRefineFromAmount,
} from "@powerlay/core";
import type { GameData } from "../preload";
import { formatCompactNumber, formatWithThousandsSeparator, formatProductionTime, parseCompactNumber, parseGamePaste } from "../utils/format";
import { ItemIcon, useIconsBaseUrl } from "./ItemIcon";
import { HelpLabel } from "./HelpLabel";

const DEBOUNCE_MS = 500;
const TOOLTIP_DELAY_MS = 150;

/** Advanced building resources shown in Total frame (right side). */
const ADVANCED_BUILDING_RESOURCES = ["Reinforced Alloys", "Carbon Weave", "Thermal Composites"] as const;

/** Renders number: compact (11k, 0.11M + tooltip) when compact=true, else full with thousands separator. */
function CompactNumber({ value, compact = true }: { value: number; compact?: boolean }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(true), TOOLTIP_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }, []);

  if (!compact) {
    return <span className="cursor-default">{formatWithThousandsSeparator(value)}</span>;
  }

  return (
    <span
      className="cursor-default relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {formatCompactNumber(value)}
      {visible && (
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 px-2 py-1 rounded border border-border bg-surface text-text text-xs whitespace-nowrap shadow-lg pointer-events-none"
          role="tooltip"
        >
          {formatWithThousandsSeparator(value)}
        </span>
      )}
    </span>
  );
}

interface ProductionTimerState {
  buildId: string;
  status: "running" | "paused" | "finished";
  startedAt: number;
  pausedElapsedSeconds: number;
}

interface BuildPageProps {
  plan: BuildPlan;
  gameData: GameData | null;
  onSave: (plan: BuildPlan) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  timerState?: Record<string, ProductionTimerState>;
  onPlayTimer?: (plan: BuildPlan) => void;
  onPauseTimer?: (buildId: string) => void;
  onResetTimer?: (buildId: string) => void;
  miningMinedFromLog?: Record<string, Record<number, number>>;
  miningMinedManual?: Record<string, Record<number, number>>;
  miningNeededOverride?: Record<string, Record<number, number>>;
  onMiningManualChange?: (buildId: string, typeID: number, mined: number) => void;
  onMiningNeededOverrideChange?: (buildId: string, typeID: number, needed: number) => void;
  onMiningReset?: (buildId: string) => void;
  miningErrors?: { tailerTestError?: string; logReaderError?: string; trackingActive?: boolean; trackingBuildId?: string | null };
  onMiningStartTracking?: () => void;
  onMiningStopTracking?: () => void;
  computeTotalProductionTime?: (plan: BuildPlan) => number;
  computeTotalOreVolume?: (plan: BuildPlan) => number;
  computeBaseMaterials?: (plan: BuildPlan) => Array<{ typeID: number; name: string; quantity: number }>;
  overlayVisible?: boolean;
  onToggleOverlay?: () => void;
}

function normalizePlan(p: BuildPlan): BuildPlan {
  return {
    id: p.id,
    name: typeof p.name === "string" ? p.name : "Unnamed",
    starSystemId: p.starSystemId,
    facilities: Array.isArray(p.facilities) ? p.facilities : [],
    plannedItems: Array.isArray(p.plannedItems) ? p.plannedItems : [],
    lasers: Array.isArray(p.lasers) ? p.lasers : [],
    intermediateBlueprintOverrides:
      p.intermediateBlueprintOverrides && typeof p.intermediateBlueprintOverrides === "object"
        ? p.intermediateBlueprintOverrides
        : undefined,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
  };
}

function migratePlannedItems(
  items: PlannedItem[],
  types: GameData["types"]
): PlannedItem[] {
  let changed = false;
  const next = items.map((p) => {
    if (p.typeID != null) return p;
    const itemId = p.itemId;
    if (itemId == null) return p;
    let typeID: number | undefined;
    if (/^\d+$/.test(String(itemId))) {
      typeID = parseInt(String(itemId), 10);
    } else {
      const found = Object.values(types).find(
        (t) => t.name?.toLowerCase() === String(itemId).toLowerCase() && (t.volume ?? 0) > 0
      );
      typeID = found?.typeID;
    }
    if (typeID == null) return p;
    changed = true;
    return { ...p, typeID };
  });
  return changed ? next : items;
}

function formatOreLabel(value: number, shorten: boolean) {
  return shorten ? formatCompactNumber(value) : formatWithThousandsSeparator(value);
}

const MAX_INPUT_ICONS = 4;

function BlueprintOptionSelect({
  options,
  value,
  onChange,
  gameData,
  formatOreLabel,
  shortenNumbers,
  ariaLabel,
  className = "",
}: {
  options: BlueprintOption[];
  value: number | undefined;
  onChange: (blueprintTypeID: number | undefined) => void;
  gameData: GameData | null;
  formatOreLabel: (value: number, shorten: boolean) => string;
  shortenNumbers: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.blueprintTypeID === value) ?? options[0];
  const productName =
    selected && gameData?.types
      ? gameData.types[String(selected.productTypeID)]?.name ?? String(selected.productTypeID)
      : "";
  const isOverride = selected?.chainFull?.includes("(override)") ?? false;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const baseCls =
    "px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted inline-flex items-center gap-1.5 min-w-0";

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        className={`${baseCls} cursor-pointer text-left w-full max-w-[280px] flex items-center justify-between`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected ? (
          <>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-1 flex-shrink-0">
                {(selected.inputTypeIDs ?? []).slice(0, MAX_INPUT_ICONS).map((tid) => (
                  <ItemIcon
                    key={tid}
                    typeID={tid}
                    size={16}
                    fallback={gameData?.types ? gameData.types[String(tid)]?.name ?? String(tid) : String(tid)}
                  />
                ))}
                {(selected.inputTypeIDs?.length ?? 0) > MAX_INPUT_ICONS && (
                  <span className="text-xs text-muted">+{(selected.inputTypeIDs?.length ?? 0) - MAX_INPUT_ICONS}</span>
                )}
              </div>
              <span className="text-muted text-xs flex-shrink-0">→</span>
              <ItemIcon
                typeID={selected.productTypeID}
                size={18}
                fallback={isOverride ? `BP ${selected.blueprintTypeID}` : productName}
              />
              {!isOverride && (
                <span className="text-muted text-xs flex-shrink-0">
                  ({formatOreLabel(selected.baseOrePerUnit, shortenNumbers)} ore)
                </span>
              )}
              {selected.facility && (
                <span
                  className="text-xs px-1 py-0.5 rounded bg-surface text-muted min-w-0 truncate max-w-[200px]"
                  title={selected.facility}
                >
                  {selected.facility}
                </span>
              )}
            </div>
            <span className={`text-muted text-xs flex-shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="inline-block">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </>
        ) : (
          <>
            <span className="text-muted flex-1">—</span>
            <span className="text-muted text-xs flex-shrink-0 ml-1" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="inline-block">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </>
        )}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 min-w-[320px] max-w-[420px] max-h-[320px] overflow-y-auto rounded-md border border-border-input bg-bg shadow-lg py-1"
          aria-label={ariaLabel}
        >
          {options.map((opt) => {
            const optProductName =
              gameData?.types
                ? gameData.types[String(opt.productTypeID)]?.name ?? String(opt.productTypeID)
                : "";
            const optIsOverride = opt.chainFull?.includes("(override)") ?? false;
            const isSelected = opt.blueprintTypeID === value;
            const visibleInputs = (opt.inputTypeIDs ?? []).slice(0, MAX_INPUT_ICONS);
            const extraCount = (opt.inputTypeIDs?.length ?? 0) - MAX_INPUT_ICONS;
            const inputFallback = (tid: number) =>
              gameData?.types ? gameData.types[String(tid)]?.name ?? String(tid) : String(tid);

            return (
              <li
                key={opt.blueprintTypeID}
                role="option"
                aria-selected={isSelected}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-surface text-text text-sm ${
                  isSelected ? "bg-surface" : ""
                }`}
                onClick={() => {
                  onChange(opt.blueprintTypeID);
                  setOpen(false);
                }}
                title={opt.chainFull + (optIsOverride ? "" : ` (${formatOreLabel(opt.baseOrePerUnit, shortenNumbers)} ore/unit)`)}
              >
                <div className="flex items-center gap-1 flex-shrink-0">
                  {visibleInputs.map((tid) => (
                    <ItemIcon key={tid} typeID={tid} size={16} fallback={inputFallback(tid)} />
                  ))}
                  {extraCount > 0 && (
                    <span className="text-xs text-muted">+{extraCount}</span>
                  )}
                </div>
                <span className="text-muted text-xs flex-shrink-0">→</span>
                <ItemIcon
                  typeID={opt.productTypeID}
                  size={20}
                  fallback={optIsOverride ? `BP ${opt.blueprintTypeID}` : optProductName}
                />
                {!optIsOverride && (
                  <span className="text-muted text-xs flex-shrink-0">
                    {formatOreLabel(opt.baseOrePerUnit, shortenNumbers)} ore
                  </span>
                )}
                {opt.facility && (
                  <span
                    className="text-xs px-1 py-0.5 rounded bg-surface text-muted min-w-0 truncate max-w-[260px]"
                    title={opt.facility}
                  >
                    {opt.facility}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProductionTreeNodeRow({
  node,
  depth,
  isLast,
  pathPrefix,
  gameData,
  overrides,
  onBlueprintOverride,
  shortenNumbers,
  filterByFacilities,
  addedFacilityNames,
  collapsedPaths,
  onToggleCollapse,
}: {
  node: ProductionTreeNode;
  depth: number;
  isLast: boolean;
  pathPrefix: string;
  gameData: GameData | null;
  overrides: Record<string, number> | undefined;
  onBlueprintOverride: (path: string, blueprintTypeID: number | undefined) => void;
  shortenNumbers: boolean;
  filterByFacilities: boolean;
  addedFacilityNames: Set<string>;
  collapsedPaths: Set<string>;
  onToggleCollapse: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedPaths.has(pathPrefix);
  const isCollapsible = hasChildren && (depth === 0 || depth === 1);
  const blueprintToFacilityNames = gameData?.blueprintToFacilityNames ?? {};
  const allOptions =
    gameData?.blueprints && gameData?.types
      ? getBlueprintOptionsForProduct(node.typeID, gameData.blueprints, gameData.types, {
          blueprintToFacilityNames,
        })
      : [];
  const options =
    filterByFacilities && addedFacilityNames.size > 0
      ? filterOptionsByFacilities(allOptions, addedFacilityNames)
      : allOptions;
  const showDropdown = options.length > 1;
  const effectiveBpId =
    overrides?.[pathPrefix] ?? options.find((o) => o.isOptimized)?.blueprintTypeID;
  const overrideNotInOptions =
    effectiveBpId != null && !options.some((o) => o.blueprintTypeID === effectiveBpId);
  const optionsForSelect =
    overrideNotInOptions && effectiveBpId != null
      ? [
          ...options,
          {
            blueprintTypeID: effectiveBpId,
            chainAbbrev: `Blueprint ${effectiveBpId} (override)`,
            chainFull: `Blueprint ${effectiveBpId} (override)`,
            baseOrePerUnit: 0,
            isOptimized: false,
            productTypeID: node.typeID,
            inputTypeIDs: [],
          } as BlueprintOption,
        ]
      : options;

  return (
    <li className="builder-tree-node text-text text-sm" data-depth={depth} data-last={isLast}>
      <span className="inline-flex items-center gap-1.5">
        {isCollapsible && (
          <button
            type="button"
            className="w-5 h-5 flex items-center justify-center rounded border-0 bg-transparent text-muted hover:text-text cursor-pointer p-0 shrink-0"
            onClick={() => onToggleCollapse(pathPrefix)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            <span className={`inline-block transition-transform ${isCollapsed ? "" : "rotate-90"}`}>
              ▶
            </span>
          </button>
        )}
        <ItemIcon typeID={node.typeID} size={20} />
        <CompactNumber value={node.quantity} compact={shortenNumbers} />× {node.name}
      </span>
      {showDropdown && (
        <div className="ml-2 mb-2" onClick={(e) => e.stopPropagation()}>
          <BlueprintOptionSelect
            options={optionsForSelect}
            value={effectiveBpId ?? undefined}
            onChange={(num) => onBlueprintOverride(pathPrefix, num)}
            gameData={gameData}
            formatOreLabel={formatOreLabel}
            shortenNumbers={shortenNumbers}
            ariaLabel={`Blueprint for ${node.name}`}
            className="ml-0"
          />
        </div>
      )}
      {hasChildren && !isCollapsed && (
        <ul className="builder-tree-children" aria-hidden>
          {node.children.map((child, i) => (
            <ProductionTreeNodeRow
              key={`${child.typeID}-${i}`}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              pathPrefix={`${pathPrefix}/${child.typeID}`}
              gameData={gameData}
              overrides={overrides}
              onBlueprintOverride={onBlueprintOverride}
              shortenNumbers={shortenNumbers}
              filterByFacilities={filterByFacilities}
              addedFacilityNames={addedFacilityNames}
              collapsedPaths={collapsedPaths}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function collectCollapsiblePaths(trees: ProductionTreeNode[], prefix = ""): string[] {
  const paths: string[] = [];
  trees.forEach((node, i) => {
    const path = prefix ? `${prefix}/${node.typeID}` : `${i}/${node.typeID}`;
    if (node.children.length > 0) {
      const depth = path.split("/").length - 2;
      if (depth <= 1) paths.push(path);
      paths.push(...collectCollapsiblePaths(node.children, path));
    }
  });
  return paths;
}

function ProductionTreeList({
  trees,
  gameData,
  overrides,
  onBlueprintOverride,
  shortenNumbers,
  filterByFacilities,
  addedFacilityNames,
}: {
  trees: ProductionTreeNode[];
  gameData: GameData | null;
  overrides: Record<string, number> | undefined;
  onBlueprintOverride: (path: string, blueprintTypeID: number | undefined) => void;
  shortenNumbers: boolean;
  filterByFacilities: boolean;
  addedFacilityNames: Set<string>;
}) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapsiblePaths = useMemo(() => collectCollapsiblePaths(trees), [trees]);
  const expandAll = useCallback(() => setCollapsedPaths(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedPaths(new Set(collapsiblePaths)),
    [collapsiblePaths]
  );

  return (
    <div>
      {collapsiblePaths.length > 0 && (
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-border-input bg-surface text-text hover:bg-border cursor-pointer"
            onClick={expandAll}
          >
            Expand all
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-border-input bg-surface text-text hover:bg-border cursor-pointer"
            onClick={collapseAll}
          >
            Collapse all
          </button>
        </div>
      )}
    <ul className="builder-tree-list list-none m-0 p-0 text-sm">
      {trees.map((node, i) => (
        <ProductionTreeNodeRow
          key={`${node.typeID}-${i}`}
          node={node}
          depth={0}
          isLast={i === trees.length - 1 && node.children.length === 0}
          pathPrefix={`${i}/${node.typeID}`}
          gameData={gameData}
          overrides={overrides}
          onBlueprintOverride={onBlueprintOverride}
          shortenNumbers={shortenNumbers}
          filterByFacilities={filterByFacilities}
          addedFacilityNames={addedFacilityNames}
          collapsedPaths={collapsedPaths}
          onToggleCollapse={toggleCollapse}
        />
      ))}
    </ul>
    </div>
  );
}

/** Filter blueprint options to only those producible in added facilities. When facilities empty, returns all. */
function filterOptionsByFacilities(
  options: BlueprintOption[],
  addedFacilityNames: Set<string>
): BlueprintOption[] {
  if (addedFacilityNames.size === 0) return options;
  return options.filter((opt) => {
    if (!opt.facility) return false;
    const facilityParts = opt.facility.split(", ").map((s) => s.trim());
    return facilityParts.some((f) => addedFacilityNames.has(f));
  });
}

function columnLabel(colIndex: number, totalColumns: number): string {
  if (colIndex === 0) return "Mine";
  if (colIndex === 1) return "Refine";
  if (colIndex === totalColumns - 1) return "Products";
  return `Step ${colIndex + 1}`;
}

function ProductionNetworkGraphView({
  graph,
  shortenNumbers,
}: {
  graph: ProductionNetworkGraph;
  shortenNumbers: boolean;
}) {
  const { columns, edges } = graph;
  if (columns.length === 0) return <p className="m-0 text-muted text-sm">No nodes.</p>;

  return (
    <div className="flex flex-nowrap gap-3 overflow-x-auto min-h-[120px] items-start">
      {columns.map((nodes, colIndex) => (
        <React.Fragment key={colIndex}>
          <div className="flex-shrink-0 flex flex-col gap-2 min-w-[140px]">
            <div className="text-muted text-xs font-medium border-b border-border pb-1">
              {columnLabel(colIndex, columns.length)}
            </div>
            <div className="flex flex-col gap-1">
              {nodes.map((node) => (
                <div
                  key={node.typeID}
                  className="px-2 py-1.5 rounded border border-border bg-surface text-text text-sm flex items-center gap-1.5"
                >
                  <ItemIcon typeID={node.typeID} size={20} />
                  <span className="font-medium">{node.name}</span>
                  <span className="text-muted ml-1">
                    × <CompactNumber value={node.quantity} compact={shortenNumbers} />
                  </span>
                </div>
              ))}
            </div>
          </div>
          {colIndex < columns.length - 1 && (
            <div className="flex-shrink-0 flex flex-col justify-center gap-0.5 min-w-[100px] text-text text-sm font-medium py-2">
              {edges
                .filter((e) => e.fromColumn === colIndex && e.toColumn === colIndex + 1)
                .map((e, i) => {
                  const fromNode = columns[e.fromColumn].find((n) => n.typeID === e.fromTypeID);
                  const toNode = columns[e.toColumn].find((n) => n.typeID === e.toTypeID);
                  return (
                    <div key={i} className="whitespace-nowrap">
                      {fromNode?.name ?? e.fromTypeID} (<CompactNumber value={e.quantity} compact={shortenNumbers} />) → {toNode?.name ?? e.toTypeID}
                    </div>
                  );
                })}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function firstOverrideNotInOptionsMessage(
  trees: ProductionTreeNode[],
  overrides: Record<string, number> | undefined,
  gameData: GameData | null
): string | null {
  if (!overrides || !gameData?.blueprints || !gameData?.types) return null;
  const overridesMap = overrides;
  const gd = gameData;
  function walk(nodes: ProductionTreeNode[], parentPath: string | null): string | null {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const prefix =
        parentPath === null ? `${i}/${node.typeID}` : `${parentPath}/${node.typeID}`;
      const overrideBpId = overridesMap[prefix];
      if (overrideBpId != null) {
        const options = getBlueprintOptionsForProduct(
          node.typeID,
          gd.blueprints!,
          gd.types!,
          { blueprintToFacilityNames: gd.blueprintToFacilityNames ?? {} }
        );
        if (!options.some((o) => o.blueprintTypeID === overrideBpId)) {
          return `Blueprint override for ${node.name} not found in data`;
        }
      }
      const msg = walk(node.children, prefix);
      if (msg) return msg;
    }
    return null;
  }
  return walk(trees, null);
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

const MINING_HELP = (
  <>
    <p className="mb-2 font-medium">How to use</p>
    <p className="mb-3">
      Set the game log folder in Settings. Click <strong>Start tracking</strong> to read mining lines from the EVE Frontier log. If log parsing isn&apos;t available, use <strong>Add</strong> with amounts like <code className="text-muted">5k</code> or <code className="text-muted">1.2M</code> (m³) to manually record mined ore.
    </p>
    <p className="mb-2 font-medium">How to read</p>
    <p>
      Each bar shows mined vs needed volume (m³). Blue fill = progress. At the bottom, <em>total</em> is total mined, <em>left</em> is remaining to mine.
    </p>
  </>
);

const PRODUCTION_HELP = (
  <>
    <p className="mb-2 font-medium">Manual timer</p>
    <p className="mb-3 text-muted text-xs">
      This is a manual timer — not connected to the game yet. You control it yourself.
    </p>
    <p className="mb-2 font-medium">How to use</p>
    <p className="mb-3">
      Click <strong>Play</strong> when you start production in-game. <strong>Pause</strong> when you stop. <strong>Reset</strong> when done. The timer counts down from the total production time.
    </p>
    <p className="mb-2 font-medium">How to read</p>
    <p>
      &quot;X left&quot; shows remaining time. Start the timer when your factory begins so it stays in sync with in-game production.
    </p>
  </>
);

const TOTAL_HELP = (
  <>
    <p className="mb-2 font-medium">How to use</p>
    <p className="mb-3">
      Add planned items above to see totals. Volume is the summed cargo space for all materials.
    </p>
    <p className="mb-2 font-medium">How to read</p>
    <p className="mb-3">
      <strong>Left:</strong> Ores to mine (raw materials) and building resources (refined/crafted). <strong>Right:</strong> Calculations (laser lenses, fuel, mining and refining time).
    </p>
    <p>
      Volume (m³) tells you total cargo needs.
    </p>
  </>
);

const PRODUCTION_GRAPH_HELP = (
  <>
    <p className="mb-2 font-medium">How to use</p>
    <p className="mb-3">
      Use the tree list to see items, quantities, and ore costs. <strong>Important:</strong> carefully verify the blueprints you use in-game match what&apos;s shown here — recipe data can differ.
    </p>
    <p className="mb-2 font-medium">How to read</p>
    <p>
      Each node shows item, quantity, and ore cost. Arrows show dependencies: product ← inputs. Top-down = what you make → what you need.
    </p>
  </>
);

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function OreEditPopover({
  mined,
  needed,
  onSave,
  onClose,
  inputCls,
}: {
  typeID: number;
  mined: number;
  needed: number;
  computedNeeded: number;
  onSave: (mined: number, needed: number) => void;
  onClose: () => void;
  inputCls: string;
}) {
  const [minedVal, setMinedVal] = useState(String(mined));
  const [neededVal, setNeededVal] = useState(String(needed));
  const containerRef = useRef<HTMLDivElement>(null);
  const minedInputRef = useRef<HTMLInputElement>(null);
  const neededInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    minedInputRef.current?.focus();
    minedInputRef.current?.select();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const m = parseFloat(minedVal);
        const n = parseFloat(neededVal);
        const finalMined = Number.isFinite(m) && m >= 0 ? m : mined;
        const finalNeeded = Number.isFinite(n) && n > 0 ? n : needed;
        onSave(Math.min(finalMined, finalNeeded), finalNeeded);
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [minedVal, neededVal, mined, needed, onSave, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.target === minedInputRef.current) {
        neededInputRef.current?.focus();
        neededInputRef.current?.select();
      } else {
        minedInputRef.current?.focus();
        minedInputRef.current?.select();
      }
    }
  };

  const oreInputCls = `${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  return (
    <div ref={containerRef} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-2 py-1 rounded border border-border bg-surface shadow-lg">
      <input
        ref={minedInputRef}
        type="number"
        min={0}
        step={1}
        className={oreInputCls}
        value={minedVal}
        onChange={(e) => setMinedVal(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleKeyDown}
      />
      <span className="text-muted">/</span>
      <input
        ref={neededInputRef}
        type="number"
        min={0}
        step={1}
        className={oreInputCls}
        value={neededVal}
        onChange={(e) => setNeededVal(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleKeyDown}
      />
      <span className="text-muted text-xs">m³</span>
    </div>
  );
}

function LockClosedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function LockOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function MiningTrackingSubFrame({
  buildId,
  baseMaterials,
  types,
  minedFromLog,
  manualMined,
  neededOverride,
  totalOre,
  errors,
  trackingBuildId,
  onStartTracking,
  onStopTracking,
  onManualChange,
  onNeededOverrideChange,
  onReset,
  inputNumCls,
  btnCls,
  formatCompactNumber,
  shortenNumbers = true,
  overlayVisible = false,
  onToggleOverlay,
}: {
  buildId: string;
  baseMaterials: Array<{ typeID: number; name: string; quantity: number }>;
  types: Record<string, { typeID: number; name?: string; volume?: number }>;
  minedFromLog: Record<number, number>;
  manualMined: Record<number, number>;
  neededOverride: Record<number, number>;
  totalOre: number;
  errors: { tailerTestError?: string; logReaderError?: string };
  trackingBuildId?: string | null;
  onStartTracking?: () => void;
  onStopTracking?: () => void;
  onManualChange?: (typeID: number, mined: number) => void;
  onNeededOverrideChange?: (typeID: number, needed: number) => void;
  onReset: () => void;
  inputNumCls: string;
  btnCls: string;
  formatCompactNumber: (n: number) => string;
  shortenNumbers?: boolean;
  overlayVisible?: boolean;
  onToggleOverlay?: () => void;
}) {
  const fmt = (n: number) => shortenNumbers ? formatCompactNumber(n) : formatWithThousandsSeparator(n);
  const [fillAllChecked, setFillAllChecked] = useState(false);
  const [snapshotBeforeFillAll, setSnapshotBeforeFillAll] = useState<Record<number, number> | null>(null);
  const [filledOres, setFilledOres] = useState<Set<number>>(() => new Set());
  const [snapshotPerOre, setSnapshotPerOre] = useState<Record<number, number>>({});
  const [editingOre, setEditingOre] = useState<number | null>(null);
  const [overlayLocked, setOverlayLocked] = useState(false);
  const prevHadDataRef = useRef(false);

  const loadOverlayLockState = useCallback(async () => {
    const locked = await window.efOverlay?.overlay?.getLockState?.("builder", buildId);
    if (typeof locked === "boolean") setOverlayLocked(locked);
  }, [buildId]);

  useEffect(() => {
    if (!window.efOverlay?.overlay?.getLockState) return;
    loadOverlayLockState();
    const id = setInterval(loadOverlayLockState, 500);
    return () => clearInterval(id);
  }, [loadOverlayLockState]);

  const handleToggleOverlayLock = useCallback(async () => {
    const newLocked = await window.efOverlay?.overlay?.toggleLock?.("builder", buildId);
    if (typeof newLocked === "boolean") setOverlayLocked(newLocked);
  }, [buildId]);

  useEffect(() => {
    const hasData = Object.keys(manualMined).length > 0 || Object.keys(neededOverride).length > 0;
    if (prevHadDataRef.current && !hasData) {
      setFillAllChecked(false);
      setSnapshotBeforeFillAll(null);
      setFilledOres(new Set());
      setSnapshotPerOre({});
      setEditingOre(null);
    }
    prevHadDataRef.current = hasData;
  }, [manualMined, neededOverride]);

  const errorMsg = errors.tailerTestError ?? errors.logReaderError;
  const isThisBuildTracking = trackingBuildId === buildId;
  const inputCls = "w-14 px-1.5 py-0.5 rounded border border-border-input bg-bg text-text text-xs focus:outline-none focus:border-muted";

  const getEffectiveNeeded = useCallback(
    (typeID: number, computedNeeded: number) => neededOverride[typeID] ?? computedNeeded,
    [neededOverride]
  );

  const getEffectiveMined = useCallback(
    (typeID: number, computedNeeded: number) => {
      const needed = getEffectiveNeeded(typeID, computedNeeded);
      const fromLog = minedFromLog[typeID] ?? 0;
      const manual = manualMined[typeID] ?? 0;
      const base = Math.max(fromLog, manual);
      if (fillAllChecked) return needed;
      if (filledOres.has(typeID)) return needed;
      return Math.min(base, needed);
    },
    [minedFromLog, manualMined, fillAllChecked, filledOres, getEffectiveNeeded]
  );

  let totalMined = 0;
  let effectiveTotal = 0;
  for (const m of baseMaterials) {
    const computedNeeded = (types[String(m.typeID)]?.volume ?? 0) * m.quantity;
    const needed = getEffectiveNeeded(m.typeID, computedNeeded);
    effectiveTotal += needed;
    totalMined += getEffectiveMined(m.typeID, computedNeeded);
  }
  if (effectiveTotal <= 0) effectiveTotal = totalOre;
  totalMined = Math.min(totalMined, effectiveTotal > 0 ? effectiveTotal : Infinity);
  const hasAnyManual = Object.keys(manualMined).length > 0 || Object.keys(neededOverride).length > 0;
  const logTotal = Object.values(minedFromLog).reduce((a, v) => a + v, 0);
  const showReset = logTotal > 0 || hasAnyManual;

  const handleFillAllChange = (checked: boolean) => {
    if (checked) {
      const snap: Record<number, number> = {};
      for (const m of baseMaterials) {
        const computedNeeded = (types[String(m.typeID)]?.volume ?? 0) * m.quantity;
        const needed = getEffectiveNeeded(m.typeID, computedNeeded);
        const fromLog = minedFromLog[m.typeID] ?? 0;
        const manual = manualMined[m.typeID] ?? 0;
        snap[m.typeID] = Math.max(fromLog, manual);
        onManualChange?.(m.typeID, needed);
      }
      setSnapshotBeforeFillAll(snap);
      setFillAllChecked(true);
    } else {
      for (const [typeID, val] of Object.entries(snapshotBeforeFillAll ?? {})) {
        onManualChange?.(Number(typeID), val);
      }
      setFillAllChecked(false);
      setSnapshotBeforeFillAll(null);
    }
  };

  const handlePerOreChange = (typeID: number, checked: boolean) => {
    if (checked) {
      const m = baseMaterials.find((x) => x.typeID === typeID);
      const computedNeeded = m ? (types[String(typeID)]?.volume ?? 0) * m.quantity : 0;
      const needed = getEffectiveNeeded(typeID, computedNeeded);
      const fromLog = minedFromLog[typeID] ?? 0;
      const manual = manualMined[typeID] ?? 0;
      setSnapshotPerOre((prev) => ({ ...prev, [typeID]: Math.max(fromLog, manual) }));
      setFilledOres((prev) => new Set(prev).add(typeID));
      onManualChange?.(typeID, needed);
    } else {
      setFilledOres((prev) => {
        const next = new Set(prev);
        next.delete(typeID);
        return next;
      });
      const snap = snapshotPerOre[typeID];
      if (snap != null && onManualChange) onManualChange(typeID, snap);
      setSnapshotPerOre((prev) => {
        const next = { ...prev };
        delete next[typeID];
        return next;
      });
    }
  };

  const miningHelp = (
    <>
      <p className="font-semibold mb-1">How to use</p>
      <p className="mb-2 text-muted text-xs">
        Set the game log folder in Settings, then click <strong>Start tracking</strong> to read mining lines from the EF log.
        Use <strong>Fill all</strong> or per-ore checkboxes to mark ores as complete, or click the pen icon to edit mined/needed values manually.
      </p>
      <p className="font-semibold mb-1">How to read</p>
      <p className="text-muted text-xs">
        Each ore bar shows <strong>mined / needed</strong> volume (m³). Blue fill = progress. &quot;Total&quot; and &quot;left&quot; show overall status.
      </p>
    </>
  );

  return (
    <div className="rounded-md border border-border bg-bg px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-text m-0 flex items-center gap-2">
          Mining
          {isThisBuildTracking && (
            <span
              className="w-2 h-2 rounded-full bg-red-500 shrink-0"
              title="This build is tracking"
              aria-hidden
            />
          )}
        </h4>
        <HelpLabel content={miningHelp} size="sm" />
      </div>
      {errorMsg && (
        <div className="mb-2 px-2 py-1.5 rounded text-xs bg-destructive/15 text-destructive-muted border border-destructive/50">
          {errorMsg}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={fillAllChecked}
            onChange={(e) => handleFillAllChange(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-xs text-muted">Fill all</span>
        </label>
        <button
          type="button"
          className={`shrink-0 w-8 h-8 flex items-center justify-center rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${
            isThisBuildTracking
              ? "text-amber-500 hover:bg-amber-500/20"
              : "text-green-500 hover:bg-green-500/20"
          }`}
          disabled={!!errorMsg}
          title={
            errorMsg
              ? `${errorMsg} — Check settings.`
              : isThisBuildTracking
                ? "Stop tracking"
                : "Start tracking"
          }
          onClick={() => (isThisBuildTracking ? onStopTracking?.() : onStartTracking?.())}
        >
          {isThisBuildTracking ? <PauseIcon /> : <PlayIcon />}
        </button>
        {showReset && (
          <button
            type="button"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border transition-colors"
            onClick={onReset}
            title="Reset mined amount"
          >
            <ResetIcon />
          </button>
        )}
        {onToggleOverlay && (
          <button
            type="button"
            className={`shrink-0 px-2 py-1 rounded text-xs border transition-colors ${overlayVisible ? "border-amber-500 text-amber-500 bg-amber-500/10" : "border-border text-muted hover:text-text hover:bg-border"}`}
            onClick={onToggleOverlay}
            title={overlayVisible ? "Hide overlay" : "Show overlay"}
          >
            Overlay
          </button>
        )}
        {window.efOverlay?.overlay?.toggleLock && (
          <button
            type="button"
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border transition-colors ${overlayLocked ? "text-amber-500" : ""}`}
            onClick={handleToggleOverlayLock}
            title={overlayLocked ? "Overlay locked (click-through)" : "Unlock overlay to move it"}
          >
            {overlayLocked ? <LockClosedIcon /> : <LockOpenIcon />}
          </button>
        )}
      </div>
      {baseMaterials.length > 0 && totalOre > 0 && (
        <div className="space-y-1.5 mb-2">
          {baseMaterials.map((m) => {
            const computedNeeded = (types[String(m.typeID)]?.volume ?? 0) * m.quantity;
            const neededVol = getEffectiveNeeded(m.typeID, computedNeeded);
            const minedVol = getEffectiveMined(m.typeID, computedNeeded);
            const progress = neededVol > 0 ? minedVol / neededVol : 0;
            const isFilled = fillAllChecked || filledOres.has(m.typeID);
            return (
              <div key={m.typeID} className="flex items-center gap-2 relative">
                <label className="flex items-center shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFilled}
                    onChange={(e) => {
                      if (fillAllChecked) return;
                      handlePerOreChange(m.typeID, e.target.checked);
                    }}
                    disabled={fillAllChecked}
                    className="rounded border-border"
                  />
                </label>
                <ItemIcon typeID={m.typeID} size={16} />
                <span className="text-xs text-text min-w-[120px] truncate">{m.name}</span>
                <div className="flex-1 min-w-0 h-1.5 rounded-full bg-amber-500/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted shrink-0 flex items-center gap-1">
                  {fmt(minedVol)} / {fmt(neededVol)} m³
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-border text-muted hover:text-text transition-colors"
                    onClick={() => setEditingOre(editingOre === m.typeID ? null : m.typeID)}
                    title="Edit mined/needed"
                  >
                    <PenIcon className="w-3 h-3" />
                  </button>
                </span>
                {editingOre === m.typeID && (
                  <OreEditPopover
                    typeID={m.typeID}
                    mined={minedVol}
                    needed={neededVol}
                    computedNeeded={computedNeeded}
                    inputCls={inputCls}
                    onSave={(mined, needed) => {
                      onManualChange?.(m.typeID, mined);
                      onNeededOverrideChange?.(m.typeID, needed);
                      setEditingOre(null);
                    }}
                    onClose={() => setEditingOre(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {totalOre > 0 ? (
        <p className="text-xs text-muted">
          {fmt(totalMined)} m³ total / {fmt(Math.max(0, totalOre - totalMined))} m³ left
        </p>
      ) : (
        <p className="text-xs text-muted">Add planned items to see ore progress.</p>
      )}
    </div>
  );
}

export function BuildPage({
  plan,
  gameData,
  onSave,
  onDelete,
  timerState = {},
  onPlayTimer,
  onPauseTimer,
  onResetTimer,
  miningMinedFromLog = {},
  miningMinedManual = {},
  miningNeededOverride = {},
  onMiningManualChange,
  onMiningNeededOverrideChange,
  onMiningReset,
  miningErrors = {},
  onMiningStartTracking,
  onMiningStopTracking,
  computeTotalProductionTime = () => 0,
  computeTotalOreVolume = () => 0,
  computeBaseMaterials = () => [],
  overlayVisible = false,
  onToggleOverlay,
}: BuildPageProps) {
  const normalizedPlan = normalizePlan(plan);
  const [local, setLocal] = useState<BuildPlan>(() => normalizedPlan);
  const [shortenNumbers, setShortenNumbers] = useState(true);
  const [productionView, setProductionView] = useState<"tree" | "network">("tree");
  const [filterByFacilities, setFilterByFacilities] = useState(false);
  const [blueprintOverrideError, setBlueprintOverrideError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(normalizePlan(plan));
    setBlueprintOverrideError(null);
  }, [plan.id, plan.updatedAt]);

  useEffect(() => {
    if (productionView === "network") setBlueprintOverrideError(null);
  }, [productionView]);

  useEffect(() => {
    if (!gameData?.types || local.plannedItems.length === 0) return;
    const migrated = migratePlannedItems(local.plannedItems, gameData.types);
    if (migrated !== local.plannedItems) {
      setLocal((prev) => ({ ...prev, plannedItems: migrated, updatedAt: Date.now() }));
    }
  }, [gameData?.types, local.plannedItems]);

  useEffect(() => {
    if (local.updatedAt === plan.updatedAt) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      onSave(local);
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [local.updatedAt, plan.updatedAt, local, onSave]);

  const update = useCallback((patch: Partial<BuildPlan>) => {
    setLocal((prev) => ({ ...prev, ...patch, updatedAt: Date.now() }));
  }, []);

  const useMaterialsPath =
    gameData &&
    local.plannedItems.length > 0 &&
    local.plannedItems.every((p) => p.typeID != null);

  const totalOre = useMemo(
    () => totalOreFromPlannedItems(local.plannedItems),
    [local.plannedItems]
  );
  const typeIdItems = useMemo(
    () =>
      local.plannedItems
        .filter((p): p is PlannedItem & { typeID: number } => p.typeID != null)
        .map((p) => ({
          typeID: p.typeID!,
          quantity: p.quantity,
          blueprintTypeID: p.blueprintTypeID,
        })),
    [local.plannedItems]
  );
  const totalMaterials = useMemo(
    () =>
      gameData?.blueprints && gameData?.types
        ? totalMaterialsFromPlannedItems(
            typeIdItems,
            gameData.blueprints,
            gameData.types
          )
        : {},
    [gameData?.blueprints, gameData?.types, typeIdItems]
  );
  const massFromMaterials = useMemo(
    () =>
      gameData?.types && useMaterialsPath
        ? totalMassFromMaterials(totalMaterials, gameData.types)
        : 0,
    [gameData?.types, totalMaterials, useMaterialsPath]
  );
  const productionGraph = useMemo(
    () =>
      useMaterialsPath && gameData?.types && gameData?.blueprints
        ? buildProductionGraph(typeIdItems, gameData.blueprints, gameData.types, {
            overrides: local.intermediateBlueprintOverrides,
          })
        : [],
    [
      useMaterialsPath,
      typeIdItems,
      gameData?.types,
      gameData?.blueprints,
      local.intermediateBlueprintOverrides,
    ]
  );
  const productionTree = useMemo(
    () =>
      useMaterialsPath && gameData?.types && gameData?.blueprints
        ? buildProductionTree(typeIdItems, gameData.blueprints, gameData.types, {
            overrides: local.intermediateBlueprintOverrides,
          })
        : [],
    [
      useMaterialsPath,
      typeIdItems,
      gameData?.types,
      gameData?.blueprints,
      local.intermediateBlueprintOverrides,
    ]
  );

  const productionNetworkGraph = useMemo(
    () =>
      productionTree.length > 0 && gameData?.types
        ? buildProductionNetworkGraph(productionTree, gameData.types)
        : { columns: [], edges: [] },
    [productionTree, gameData?.types]
  );

  const overrideNotInOptionsMessage = useMemo(
    () =>
      productionTree.length > 0 &&
      local.intermediateBlueprintOverrides &&
      gameData?.blueprints &&
      gameData?.types
        ? firstOverrideNotInOptionsMessage(
            productionTree,
            local.intermediateBlueprintOverrides,
            gameData
          )
        : null,
    [
      productionTree,
      local.intermediateBlueprintOverrides,
      gameData?.blueprints,
      gameData?.types,
    ]
  );

  const producibleTypeIds = useMemo(() => {
    if (!gameData?.types || !gameData?.blueprints) return undefined;
    return new Set(getProducibleTypeIds(gameData.types, gameData.blueprints).map((t) => t.typeID));
  }, [gameData?.types, gameData?.blueprints]);

  const baseMaterialsList = useMemo(() => {
    if (productionTree.length === 0 || !gameData?.types) return [];
    return getBaseMaterialsFromTrees(productionTree, gameData.types);
  }, [productionTree, gameData?.types]);

  const advancedMaterialsList = useMemo(() => {
    if (productionTree.length === 0 || !gameData?.types) return [];
    const names = new Set(ADVANCED_BUILDING_RESOURCES);
    const all = getAllMaterialsFromTrees(productionTree, gameData.types);
    return all
      .filter((item) => names.has(item.name as (typeof ADVANCED_BUILDING_RESOURCES)[number]))
      .sort((a, b) => {
        const ai = ADVANCED_BUILDING_RESOURCES.indexOf(a.name as (typeof ADVANCED_BUILDING_RESOURCES)[number]);
        const bi = ADVANCED_BUILDING_RESOURCES.indexOf(b.name as (typeof ADVANCED_BUILDING_RESOURCES)[number]);
        return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
      });
  }, [productionTree, gameData?.types]);

  /** Volume from base materials (ores) only – correct for materials-path mode. */
  const volumeFromMaterials = useMemo(
    () =>
      gameData?.types && useMaterialsPath
        ? totalVolumeFromMaterials(
            Object.fromEntries(baseMaterialsList.map((m) => [m.typeID, m.quantity])),
            gameData.types
          )
        : 0,
    [gameData?.types, baseMaterialsList, useMaterialsPath]
  );

  const mass = useMemo(
    () => (useMaterialsPath ? massFromMaterials : oreMass(totalOre)),
    [useMaterialsPath, massFromMaterials, totalOre]
  );
  const volume = useMemo(
    () => (useMaterialsPath ? volumeFromMaterials : oreVolume(totalOre)),
    [useMaterialsPath, volumeFromMaterials, totalOre]
  );
  const lenses = useMemo(
    () =>
      useMaterialsPath
        ? laserLensesNeededFromAmount(mass, local.lasers)
        : laserLensesNeeded(totalOre, local.lasers),
    [useMaterialsPath, mass, totalOre, local.lasers]
  );
  const fuel = useMemo(
    () => (useMaterialsPath ? fuelNeededFromAmount(mass) : fuelNeededForOre(totalOre)),
    [useMaterialsPath, mass, totalOre]
  );
  const timeMine = useMemo(
    () =>
      useMaterialsPath
        ? timeToMineFromAmount(mass, local.lasers)
        : timeToMineOre(totalOre, local.lasers),
    [useMaterialsPath, mass, totalOre, local.lasers]
  );
  const timeRefine = useMemo(
    () =>
      useMaterialsPath ? timeToRefineFromAmount(mass) : timeToRefineOre(totalOre),
    [useMaterialsPath, mass, totalOre]
  );

  const addFacility = () => {
    const defaultType = facilityOptions[0] ?? "Printer S";
    update({
      facilities: [...local.facilities, { type: defaultType, count: 1 }],
    });
  };
  const updateFacility = (idx: number, f: Facility) => {
    const next = [...local.facilities];
    next[idx] = f;
    update({ facilities: next });
  };
  const removeFacility = (idx: number) => {
    update({ facilities: local.facilities.filter((_, i) => i !== idx) });
  };

  const addedFacilityNames = useMemo(
    () => new Set(local.facilities.map((f) => f.type)),
    [local.facilities]
  );

  const facilityOptions = useMemo(() => {
    const fromGame = gameData?.facilityTypeNames ?? [];
    const base = fromGame.length > 0 ? fromGame : [...FACILITY_TYPES];
    const fromPlan = local.facilities.map((f) => f.type);
    return [...new Set([...base, ...fromPlan])];
  }, [gameData?.facilityTypeNames, local.facilities]);

  const addPlannedItem = () => {
    update({
      plannedItems: [...local.plannedItems, { quantity: 1 }],
    });
  };
  const updatePlannedItem = (idx: number, p: PlannedItem) => {
    const next = [...local.plannedItems];
    next[idx] = p;
    update({ plannedItems: next });
  };
  const removePlannedItem = (idx: number) => {
    update({ plannedItems: local.plannedItems.filter((_, i) => i !== idx) });
  };

  const addLaser = () => {
    update({
      lasers: [...local.lasers, { type: "Small Cutting Laser", amount: 1 }],
    });
  };
  const updateLaser = (idx: number, l: Laser) => {
    const next = [...local.lasers];
    next[idx] = l;
    update({ lasers: next });
  };
  const removeLaser = (idx: number) => {
    update({ lasers: local.lasers.filter((_, i) => i !== idx) });
  };

  const onBlueprintOverride = useCallback(
    (pathKey: string, blueprintTypeID: number | undefined) => {
      setBlueprintOverrideError(null);
      try {
        if (
          blueprintTypeID !== undefined &&
          (typeof blueprintTypeID !== "number" || !Number.isFinite(blueprintTypeID))
        ) {
          setBlueprintOverrideError(`Invalid blueprint ID for path ${pathKey}`);
          return;
        }
        setLocal((prev) => {
          const current = prev.intermediateBlueprintOverrides ?? {};
          const next = { ...current };
          if (blueprintTypeID === undefined) {
            delete next[pathKey];
          } else {
            next[pathKey] = blueprintTypeID;
          }
          return {
            ...prev,
            intermediateBlueprintOverrides: Object.keys(next).length > 0 ? next : undefined,
            updatedAt: Date.now(),
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setBlueprintOverrideError(`Blueprint override failed: ${message}`);
        if (typeof console !== "undefined" && console.error) {
          console.error("[BuildPage] onBlueprintOverride", pathKey, blueprintTypeID, err);
        }
      }
    },
    []
  );

  const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";
  const headingCls = "m-0 mb-2 text-[0.9rem] font-semibold text-text";
  const rowCls = "flex items-center gap-2 mb-2";
  const plannedItemRowCls = "flex items-center gap-2 mb-4";
  const inputCls = "px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted max-w-full";
  const inputNumCls = "w-[70px] px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted";
  const btnCls = "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";

  return (
    <div className="flex flex-col gap-4">
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-[0.9rem] font-semibold text-text">Tracking</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-text flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shortenNumbers}
                onChange={(e) => setShortenNumbers(e.target.checked)}
                className="rounded border-border"
              />
              Shorten numbers
            </label>
            <button
              type="button"
              className="cursor-pointer px-3 py-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm hover:bg-destructive/20"
              onClick={() => onDelete(local.id)}
            >
              Delete build
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-muted text-xs block mb-1">Star system</label>
            <StarSystemSearch
              starSystems={gameData?.starSystems ?? []}
              value={local.starSystemId ?? ""}
              onChange={(starSystemId) => update({ starSystemId: starSystemId || undefined })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MiningTrackingSubFrame
            buildId={plan.id}
            baseMaterials={computeBaseMaterials(plan)}
            types={gameData?.types ?? {}}
            minedFromLog={miningMinedFromLog[plan.id] ?? {}}
            manualMined={miningMinedManual[plan.id] ?? {}}
            neededOverride={miningNeededOverride[plan.id] ?? {}}
            totalOre={computeTotalOreVolume(plan)}
            errors={miningErrors}
            trackingBuildId={miningErrors.trackingBuildId ?? null}
            onStartTracking={onMiningStartTracking}
            onStopTracking={onMiningStopTracking}
            onManualChange={(typeID, mined) => onMiningManualChange?.(plan.id, typeID, mined)}
            onNeededOverrideChange={(typeID, needed) => onMiningNeededOverrideChange?.(plan.id, typeID, needed)}
            onReset={() => onMiningReset?.(plan.id)}
            inputNumCls={inputNumCls}
            btnCls={btnCls}
            formatCompactNumber={formatCompactNumber}
            shortenNumbers={shortenNumbers}
            overlayVisible={overlayVisible}
            onToggleOverlay={onToggleOverlay}
          />
          <div className="rounded-md border border-border bg-bg px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-semibold text-text m-0 flex items-center gap-2">
                Production
                {timerState[plan.id]?.status === "running" && (
                  <span
                    className="w-2 h-2 rounded-full bg-red-500 shrink-0"
                    title="Production active"
                    aria-hidden
                  />
                )}
              </h4>
              <HelpLabel content={PRODUCTION_HELP} size="sm" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              {onPlayTimer && onPauseTimer && (
                <>
                  <button
                    type="button"
                    className={`shrink-0 w-8 h-8 flex items-center justify-center rounded transition-colors ${
                      timerState[plan.id]?.status === "running"
                        ? "text-amber-500 hover:bg-amber-500/20"
                        : "text-green-500 hover:bg-green-500/20"
                    }`}
                    onClick={() =>
                      timerState[plan.id]?.status === "running"
                        ? onPauseTimer(plan.id)
                        : onPlayTimer(plan)
                    }
                    title={
                      timerState[plan.id]?.status === "running"
                        ? "Pause production"
                        : "Start production"
                    }
                  >
                    {timerState[plan.id]?.status === "running" ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  {onResetTimer && (timerState[plan.id]?.status === "running" || timerState[plan.id]?.status === "paused" || timerState[plan.id]?.status === "finished") && (
                    <button
                      type="button"
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border transition-colors"
                      onClick={() => onResetTimer(plan.id)}
                      title="Reset timer"
                    >
                      <ResetIcon />
                    </button>
                  )}
                </>
              )}
            </div>
            {computeTotalProductionTime(plan) > 0 && (timerState[plan.id]?.status === "running" || timerState[plan.id]?.status === "paused") ? (
              <p className="text-xs text-muted mb-1">
                {formatProductionTime(
                  Math.max(
                    0,
                    computeTotalProductionTime(plan) -
                      (timerState[plan.id]!.status === "running"
                        ? timerState[plan.id]!.pausedElapsedSeconds + (Date.now() - timerState[plan.id]!.startedAt) / 1000
                        : timerState[plan.id]!.pausedElapsedSeconds)
                  )
                )}{" "}
                left
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Timer to sync with your factory. Start when production begins.
            </p>
          </div>
        </div>
      </div>

      <div className={sectionCls}>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="m-0 text-[0.9rem] font-semibold text-text">Manufacturing facilities</h3>
          <button type="button" className={btnCls} onClick={addFacility}>Add facility</button>
        </div>
        {local.facilities.map((f, idx) => (
          <div key={idx} className={rowCls}>
            <select
              className={inputCls}
              value={f.type}
              onChange={(e) => updateFacility(idx, { ...f, type: e.target.value as Facility["type"] })}
            >
              {facilityOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={f.count}
              onChange={(e) => updateFacility(idx, { ...f, count: Number(e.target.value) || 0 })}
              className={inputNumCls}
            />
            <button type="button" className={btnCls} onClick={() => removeFacility(idx)}>Remove</button>
          </div>
        ))}
      </div>

      <div className={sectionCls}>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="m-0 text-[0.9rem] font-semibold text-text">Planned items to produce</h3>
          <button type="button" className={btnCls} onClick={addPlannedItem}>Add item</button>
        </div>
        {local.plannedItems.map((p, idx) => {
          const blueprintToFacilityNames = gameData?.blueprintToFacilityNames ?? {};
          const allBlueprintOptions =
            gameData && p.typeID != null
              ? getBlueprintOptionsForProduct(p.typeID, gameData.blueprints, gameData.types, {
                  blueprintToFacilityNames,
                })
              : [];
          const blueprintOptions =
            filterByFacilities && addedFacilityNames.size > 0
              ? filterOptionsByFacilities(allBlueprintOptions, addedFacilityNames)
              : allBlueprintOptions;
          const effectiveBpId = p.blueprintTypeID ?? blueprintOptions[0]?.blueprintTypeID;
          const selectedNotInOptions =
            effectiveBpId != null && !blueprintOptions.some((o) => o.blueprintTypeID === effectiveBpId);
          const optionsForSelect =
            selectedNotInOptions && effectiveBpId != null
              ? [
                  ...blueprintOptions,
                  {
                    blueprintTypeID: effectiveBpId,
                    chainAbbrev: `Blueprint ${effectiveBpId} (override)`,
                    chainFull: `Blueprint ${effectiveBpId} (override)`,
                    baseOrePerUnit: 0,
                    isOptimized: false,
                    productTypeID: p.typeID!,
                    inputTypeIDs: [],
                  } as BlueprintOption,
                ]
              : blueprintOptions;
          return (
            <div key={idx} className={plannedItemRowCls}>
              {p.typeID != null && <ItemIcon typeID={p.typeID} size={20} />}
              {gameData && Object.keys(gameData.types).length > 0 ? (
                <ItemSearchWithTypes
                  types={gameData.types}
                  typeID={p.typeID}
                  producibleTypeIds={producibleTypeIds}
                  onChange={(typeID) =>
                    updatePlannedItem(idx, {
                      ...p,
                      typeID,
                      itemId: undefined,
                      blueprintTypeID: undefined,
                    })
                  }
                />
              ) : (
                <ItemSearch
                  value={p.itemId ?? ""}
                  onChange={(itemId) => updatePlannedItem(idx, { ...p, itemId })}
                />
              )}
              {optionsForSelect.length > 0 ? (
                <BlueprintOptionSelect
                  options={optionsForSelect}
                  value={effectiveBpId}
                  onChange={(v) => {
                    const optimizedId = allBlueprintOptions[0]?.blueprintTypeID;
                    updatePlannedItem(idx, {
                      ...p,
                      blueprintTypeID: v === optimizedId ? undefined : v,
                    });
                  }}
                  gameData={gameData}
                  formatOreLabel={formatOreLabel}
                  shortenNumbers={shortenNumbers}
                  ariaLabel="Blueprint"
                  className="min-w-[200px]"
                />
              ) : null}
              <input
                type="number"
                min={0}
                value={p.quantity}
                onChange={(e) =>
                  updatePlannedItem(idx, {
                    ...p,
                    quantity: Number(e.target.value) || 0,
                  })
                }
                onContextMenu={async (e) => {
                  e.preventDefault();
                  try {
                    const raw = await navigator.clipboard.readText();
                    const text = parseGamePaste(raw);
                    const qty = Math.max(0, parseInt(text, 10) || 0);
                    updatePlannedItem(idx, { ...p, quantity: qty });
                  } catch {}
                }}
                className={inputNumCls}
                placeholder="Qty"
              />
              <button
                type="button"
                className={btnCls}
                onClick={() => removePlannedItem(idx)}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      <div className={`${sectionCls} mt-3 py-3 bg-bg rounded-md`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className={headingCls}>Total ore, mass & volume</h3>
          <HelpLabel content={TOTAL_HELP} />
        </div>
        {useMaterialsPath ? (
          <div className="text-sm text-text space-y-1">
            <div>Volume: <CompactNumber value={volume} compact={shortenNumbers} /> m³</div>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {baseMaterialsList.length > 0 ? (
                  <div>
                    <div className="text-muted text-xs mb-1">Ores to mine (base materials):</div>
                    <ul className="list-none m-0 p-0 space-y-0.5">
                      {baseMaterialsList.map((item) => (
                        <li key={item.typeID} className="flex items-center gap-1.5">
                          <ItemIcon typeID={item.typeID} size={20} />
                          {item.name}: <CompactNumber value={item.quantity} compact={shortenNumbers} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {advancedMaterialsList.length > 0 ? (
                  <div>
                    <div className="text-muted text-xs mb-1">Building resources:</div>
                    <ul className="list-none m-0 p-0 space-y-0.5">
                      {advancedMaterialsList.map((item) => (
                        <li key={item.typeID} className="flex items-center gap-1.5">
                          <ItemIcon typeID={item.typeID} size={20} />
                          {item.name}: <CompactNumber value={item.quantity} compact={shortenNumbers} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="text-muted text-xs">
                <div className="mb-1 font-medium text-text">Calculations <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border border-border/60 bg-surface/60 text-muted select-none cursor-default font-normal" role="status">Under construction</span></div>
                <div className="space-y-0.5">
                  <div>Laser lenses: <CompactNumber value={lenses} compact={shortenNumbers} /></div>
                  <div>Fuel needed: <CompactNumber value={fuel} compact={shortenNumbers} /></div>
                  <div>Time to mine: <CompactNumber value={timeMine} compact={shortenNumbers} /> s</div>
                  <div>Time to refine: <CompactNumber value={timeRefine} compact={shortenNumbers} /> s</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div className="space-y-1">
              <div className="text-sm text-text">ore_a: <CompactNumber value={totalOre.ore_a} compact={shortenNumbers} /> | ore_b: <CompactNumber value={totalOre.ore_b} compact={shortenNumbers} /> | gas: <CompactNumber value={totalOre.gas} compact={shortenNumbers} /> | alloy: <CompactNumber value={totalOre.alloy} compact={shortenNumbers} /></div>
              <div className="text-sm text-text">Volume: <CompactNumber value={volume} compact={shortenNumbers} /> m³</div>
            </div>
            <div className="text-muted text-xs">
              <div className="mb-1 font-medium text-text">Calculations <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border border-border/60 bg-surface/60 text-muted select-none cursor-default font-normal" role="status">Under construction</span></div>
              <div className="space-y-0.5 text-sm">
                <div>Laser lenses: <CompactNumber value={lenses} compact={shortenNumbers} /></div>
                <div>Fuel needed: <CompactNumber value={fuel} compact={shortenNumbers} /></div>
                <div>Time to mine: <CompactNumber value={timeMine} compact={shortenNumbers} /> s</div>
                <div>Time to refine: <CompactNumber value={timeRefine} compact={shortenNumbers} /> s</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {useMaterialsPath && (
        <div className={`${sectionCls} mt-3 py-3 bg-bg rounded-md`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className={headingCls}>Production graph</h3>
            <HelpLabel content={PRODUCTION_GRAPH_HELP} />
          </div>
          {productionTree.length === 0 ? (
            <p className="m-0 text-muted text-sm">Add planned items to see the graph.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-text">
                  <input
                    type="checkbox"
                    checked={filterByFacilities}
                    onChange={(e) => setFilterByFacilities(e.target.checked)}
                    className="rounded border-border"
                  />
                  Only my facilities
                </label>
              </div>
              <div className="flex gap-1 mb-2 border-b border-border">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded-t ${productionView === "tree" ? "bg-selection-bg text-selection-text font-semibold" : "text-muted hover:text-text"}`}
                  onClick={() => setProductionView("tree")}
                >
                  Tree list
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded-t ${productionView === "network" ? "bg-selection-bg text-selection-text font-semibold" : "text-muted hover:text-text"}`}
                  onClick={() => setProductionView("network")}
                >
                  Network graph
                </button>
              </div>
              {(blueprintOverrideError || overrideNotInOptionsMessage) && (
                <p className="mb-2 text-sm text-destructive" role="alert">
                  {blueprintOverrideError || overrideNotInOptionsMessage}
                </p>
              )}
              {productionView === "tree" ? (
                <div className="overflow-x-auto overflow-y-visible">
                  <ProductionTreeList
                    trees={productionTree}
                    gameData={gameData}
                    overrides={local.intermediateBlueprintOverrides}
                    shortenNumbers={shortenNumbers}
                    onBlueprintOverride={onBlueprintOverride}
                    filterByFacilities={filterByFacilities}
                    addedFacilityNames={addedFacilityNames}
                  />
                </div>
              ) : (
                <ProductionNetworkGraphView
                  graph={productionNetworkGraph}
                  shortenNumbers={shortenNumbers}
                />
              )}
            </>
          )}
        </div>
      )}

      <div className={sectionCls}>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="m-0 text-[0.9rem] font-semibold text-text">Lasers <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border border-border/60 bg-surface/60 text-muted select-none cursor-default font-normal" role="status">Under construction</span></h3>
          <button type="button" className={btnCls} onClick={addLaser}>Add laser</button>
        </div>
        {local.lasers.map((l, idx) => (
          <div key={idx} className={rowCls}>
            <select
              className={inputCls}
              value={l.type}
              onChange={(e) => updateLaser(idx, { ...l, type: e.target.value as Laser["type"] })}
            >
              {LASER_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={l.amount}
              onChange={(e) => updateLaser(idx, { ...l, amount: Number(e.target.value) || 0 })}
              className={inputNumCls}
            />
            <button type="button" className={btnCls} onClick={() => removeLaser(idx)}>Remove</button>
          </div>
        ))}
      </div>

    </div>
  );
}

function StarSystemSearch({
  starSystems,
  value,
  onChange,
}: {
  starSystems: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const hasData = starSystems.length > 0;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const matches = useMemo(() => {
    if (!hasData) return [];
    let list: string[];
    if (!query.trim()) {
      list = [...starSystems];
    } else {
      const q = query.toLowerCase();
      list = starSystems.filter((s) => s.toLowerCase().includes(q));
    }
    return [...new Set(list)];
  }, [starSystems, query, hasData]);

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      if (!hasData && query.trim() !== value) onChange(query.trim());
    }, 150);
  };

  const pasteFromClipboard = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const text = parseGamePaste(raw);
      setQuery(text);
      onChange(text);
      setOpen(hasData);
    } catch {}
  };

  const inputCls = "min-w-[200px] px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted max-w-full";
  return (
    <div className="relative">
      <input
        className={inputCls}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(hasData);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          pasteFromClipboard();
        }}
        onFocus={() => setOpen(hasData)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !hasData) onChange(query.trim());
        }}
        placeholder={hasData ? "Search star system" : "Star system (type any text)"}
      />
      {hasData && open && matches.length > 0 && (
        <ul className="absolute top-full left-0 right-0 m-0 p-0 list-none bg-surface border border-border rounded-md max-h-[200px] overflow-y-auto z-10">
          {matches.map((s) => (
            <li
              key={s}
              className="py-1.5 px-3 cursor-pointer text-sm hover:bg-border"
              onMouseDown={() => {
                onChange(s);
                setQuery(s);
                setOpen(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const matches = useMemo(() => {
    if (!query.trim()) return [...PRODUCIBLE_ITEMS];
    const q = query.toLowerCase();
    return PRODUCIBLE_ITEMS.filter((s) => s.toLowerCase().includes(q));
  }, [query]);

  const pasteFromClipboard = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const text = parseGamePaste(raw);
      setQuery(text);
      onChange(text);
      setOpen(true);
    } catch {}
  };

  return (
    <div className="relative">
      <input
        className="min-w-[140px] px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted max-w-full"
        value={query}
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
        placeholder="Item"
      />
      {open && matches.length > 0 && (
        <ul className="absolute top-full left-0 right-0 m-0 p-0 list-none bg-surface border border-border rounded-md max-h-[200px] overflow-y-auto z-10">
          {matches.map((s) => (
            <li
              key={s}
              className="py-1.5 px-3 cursor-pointer text-sm hover:bg-border"
              onMouseDown={() => {
                onChange(s);
                setQuery(s);
                setOpen(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MAX_ITEM_SEARCH_RESULTS = 50;

function ItemSearchWithTypes({
  types,
  typeID,
  onChange,
  producibleTypeIds,
}: {
  types: GameData["types"];
  typeID: number | undefined;
  onChange: (typeID: number) => void;
  producibleTypeIds?: Set<number>;
}) {
  const name = typeID != null ? types[String(typeID)]?.name ?? String(typeID) : "";
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(name);
  }, [name]);

  const matches = useMemo(() => {
    const all = searchTypesByName(types, query, { volumeMin: 1, preferTypeIds: producibleTypeIds });
    return all.slice(0, MAX_ITEM_SEARCH_RESULTS);
  }, [types, query, producibleTypeIds]);

  const iconsBaseUrl = useIconsBaseUrl();
  const hasTypes = Object.keys(types).length > 0;

  const pasteFromClipboard = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const text = parseGamePaste(raw);
      setQuery(text);
      setOpen(true);
    } catch {}
  };

  return (
    <div className="relative">
      <input
        className="min-w-[140px] px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted max-w-full"
        value={query}
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
        placeholder={hasTypes ? "Search items…" : "Item"}
      />
      {open && hasTypes && (
        <ul className="absolute top-full left-0 right-0 m-0 p-0 list-none bg-surface border border-border rounded-md max-h-[200px] overflow-y-auto z-10">
          {matches.length > 0 ? (
            matches.map((m) => (
              <li
                key={m.typeID}
                className="py-1.5 px-3 cursor-pointer text-sm hover:bg-border flex items-center gap-2"
                onMouseDown={() => {
                  onChange(m.typeID);
                  setQuery(m.name);
                  setOpen(false);
                }}
              >
                {iconsBaseUrl && (
                  <img
                    src={`${iconsBaseUrl.replace(/\/?$/, "/")}${m.typeID}.png`}
                    alt=""
                    width={20}
                    height={20}
                    className="flex-shrink-0"
                  />
                )}
                {m.name}
              </li>
            ))
          ) : (
            <li className="py-1.5 px-3 cursor-default text-muted text-sm">
              {query.trim() ? "No matches" : "Type to search items"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

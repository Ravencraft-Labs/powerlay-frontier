import type { TypesMap, BlueprintsMap, StrippedType, Blueprint } from "./types.js";

/** Base ore typeIDs used for optimization (Feldspar Crystals, Platinum-Palladium Matrix, Hydrated Sulfide Matrix). */
export const BASE_ORE_TYPE_IDS = new Set([77800, 77810, 77811]);

function sumBaseOreOnly(base: Record<number, number>): number {
  return Object.entries(base)
    .filter(([typeID]) => BASE_ORE_TYPE_IDS.has(Number(typeID)))
    .reduce((a, [, qty]) => a + qty, 0);
}

/** True if name suggests mineable rare ore (veins/matrix). */
function isRareOreName(name: string): boolean {
  const n = (name ?? "").toLowerCase();
  return n.includes("veins") || n.includes("matrix");
}

/** Tier 1 = common ores only; Tier 2 = common + rare (veins/matrix); Tier 3 = any drop-only or other. */
function getBlueprintOreTier(
  base: Record<number, number>,
  types: TypesMap
): 1 | 2 | 3 {
  const typeIDs = Object.keys(base).map(Number);
  if (typeIDs.length === 0) return 1;
  for (const typeID of typeIDs) {
    if (BASE_ORE_TYPE_IDS.has(typeID)) continue;
    const name = types[String(typeID)]?.name ?? "";
    if (isRareOreName(name)) continue;
    return 3;
  }
  const allCommon = typeIDs.every((id) => BASE_ORE_TYPE_IDS.has(id));
  return allCommon ? 1 : 2;
}

export interface TypeNameEntry {
  typeID: number;
  name: string;
}

export function searchTypesByName(
  types: TypesMap,
  query: string,
  options: { volumeMin?: number; preferTypeIds?: Set<number> } = {}
): TypeNameEntry[] {
  const { volumeMin = 0, preferTypeIds } = options;
  const q = query.trim().toLowerCase();
  const result: TypeNameEntry[] = [];
  for (const key of Object.keys(types)) {
    const t = types[key];
    if (t.volume != null && t.volume <= volumeMin) continue;
    const name = t.name ?? "";
    if (!q || name.toLowerCase().includes(q)) {
      result.push({ typeID: t.typeID, name });
    }
  }
  if (preferTypeIds && result.length > 0) {
    const byName = new Map<string, TypeNameEntry[]>();
    for (const m of result) {
      const key = m.name.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(m);
      byName.set(key, list);
    }
    const deduped: TypeNameEntry[] = [];
    for (const group of byName.values()) {
      const preferred = group.find((m) => preferTypeIds.has(m.typeID));
      if (!preferred) continue; // skip names with no producible type
      deduped.push(preferred);
    }
    return deduped.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return result;
}

export function getProducibleTypeIds(
  types: TypesMap,
  blueprints: BlueprintsMap
): TypeNameEntry[] {
  const productTypeIds = new Set<number>();
  for (const _key of Object.keys(blueprints)) {
    const bp = blueprints[_key];
    const mfg = bp?.activities?.manufacturing;
    if (!mfg?.products?.length) continue;
    if (!mfg?.materials?.length) continue; // only types with ingredients
    for (const p of mfg.products) {
      productTypeIds.add(p.typeID);
    }
  }
  const result: TypeNameEntry[] = [];
  for (const typeID of productTypeIds) {
    const t = types[String(typeID)];
    if (!t || (t.volume != null && t.volume <= 0)) continue;
    result.push({ typeID: t.typeID, name: t.name ?? String(typeID) });
  }
  return result;
}

export function getBlueprintForProduct(
  productTypeID: number,
  blueprints: BlueprintsMap
): Blueprint | undefined {
  let fallback: Blueprint | undefined;
  for (const key of Object.keys(blueprints)) {
    const bp = blueprints[key];
    const mfg = bp?.activities?.manufacturing;
    if (!mfg?.products?.length) continue;
    if (!mfg?.materials?.length) continue; // skip blueprints with no ingredients
    const hasProduct = mfg.products.some((p) => p.typeID === productTypeID);
    if (!hasProduct) continue;
    if (bp.blueprintTypeID === productTypeID) return bp;
    if (!fallback) fallback = bp;
  }
  return fallback;
}

/** All blueprints whose manufacturing products include productTypeID. Excludes blueprints with no ingredients. */
export function getBlueprintsForProduct(
  productTypeID: number,
  blueprints: BlueprintsMap
): Blueprint[] {
  const result: Blueprint[] = [];
  for (const key of Object.keys(blueprints)) {
    const bp = blueprints[key];
    const mfg = bp?.activities?.manufacturing;
    if (!mfg?.products?.length) continue;
    if (!mfg?.materials?.length) continue; // skip blueprints with no ingredients
    if (mfg.products.some((p) => p.typeID === productTypeID)) result.push(bp);
  }
  return result;
}

/** Base materials (no manufacturing blueprint) per 1 unit of product. Recursive with path and maxDepth. */
export function baseMaterialsPerUnitProduct(
  productTypeID: number,
  blueprint: Blueprint,
  blueprints: BlueprintsMap,
  types: TypesMap,
  options: { maxDepth?: number } = {}
): Record<number, number> {
  const maxDepthVal = options.maxDepth ?? 10;
  const result: Record<number, number> = {};
  const path = new Set<number>();

  function recurse(
    typeID: number,
    quantityPerUnit: number,
    depth: number,
    bpForType: Blueprint | undefined
  ): void {
    if (depth > maxDepthVal || quantityPerUnit <= 0) return;
    const bp = bpForType ?? getBlueprintForProduct(typeID, blueprints);
    if (!bp) {
      result[typeID] = (result[typeID] ?? 0) + quantityPerUnit;
      return;
    }
    if (path.has(typeID)) return;
    path.add(typeID);
    const perUnit = getMaterialsPerUnitProduct(bp, typeID);
    for (const { typeID: matTypeID, quantityPerUnit: q } of perUnit) {
      recurse(matTypeID, quantityPerUnit * q, depth + 1, undefined);
    }
    path.delete(typeID);
  }

  recurse(productTypeID, 1, 0, blueprint);
  return result;
}

/** Blueprint that minimizes total base ore per unit, preferring tier 1 (common only) then tier 2 (common+rare) then tier 3. */
export function getOptimizedBlueprintForProduct(
  productTypeID: number,
  blueprints: BlueprintsMap,
  types: TypesMap,
  options: { maxDepth?: number } = {}
): Blueprint | undefined {
  const list = getBlueprintsForProduct(productTypeID, blueprints);
  if (list.length === 0) return undefined;
  const withTierAndSum = list.map((bp) => {
    const base = baseMaterialsPerUnitProduct(productTypeID, bp, blueprints, types, options);
    return {
      bp,
      tier: getBlueprintOreTier(base, types),
      sum: sumBaseOreOnly(base),
    };
  });
  const bestTier = Math.min(...withTierAndSum.map((x) => x.tier)) as 1 | 2 | 3;
  const inBestTier = withTierAndSum.filter((x) => x.tier === bestTier);
  let best = inBestTier[0]?.bp;
  let bestSum = inBestTier[0]?.sum ?? Infinity;
  for (const { bp, sum } of inBestTier) {
    if (sum < bestSum) {
      bestSum = sum;
      best = bp;
    }
  }
  return best;
}

/** Resolve blueprint: use item.blueprintTypeID if set and valid, else optimized. */
export function resolveBlueprint(
  item: { typeID: number; blueprintTypeID?: number },
  blueprints: BlueprintsMap,
  types: TypesMap
): Blueprint | undefined {
  if (item.blueprintTypeID != null) {
    const bp = blueprints[String(item.blueprintTypeID)];
    if (bp?.activities?.manufacturing?.products?.some((p) => p.typeID === item.typeID))
      return bp;
  }
  return getOptimizedBlueprintForProduct(item.typeID, blueprints, types);
}

export interface BlueprintOption {
  blueprintTypeID: number;
  baseOrePerUnit: number;
  isOptimized: boolean;
  productTypeID: number;
  inputTypeIDs: number[];
  chainFull?: string;
  chainAbbrev?: string;
  facility?: string;
}

/** First letter of each word, uppercased (e.g. "Hydrated Sulfide Matrix" -> "HSM"). */
function abbreviateTypeName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word[0] ?? "").toUpperCase())
    .join("");
}

/** Build full and abbreviated chain strings: inputs -> product. */
function buildBlueprintChainStrings(
  blueprint: Blueprint,
  productTypeID: number,
  types: TypesMap
): { chainFull: string; chainAbbrev: string } {
  const materials = getMaterialsPerUnitProduct(blueprint, productTypeID);
  const productName = types[String(productTypeID)]?.name ?? String(productTypeID);
  if (!materials.length) {
    return {
      chainFull: productName,
      chainAbbrev: abbreviateTypeName(productName) || productName,
    };
  }
  const inputNames = materials.map(
    (m) => types[String(m.typeID)]?.name ?? String(m.typeID)
  );
  const inputAbbrevs = inputNames.map((n) => abbreviateTypeName(n) || n);
  return {
    chainFull: inputNames.join(", ") + " → " + productName,
    chainAbbrev: inputAbbrevs.join(", ") + " → " + (abbreviateTypeName(productName) || productName),
  };
}

/** Unique key for a recipe: same inputs + quantities = same recipe. */
function recipeKey(materials: { typeID: number; quantityPerUnit: number }[]): string {
  return materials
    .slice()
    .sort((a, b) => a.typeID - b.typeID)
    .map((m) => `${m.typeID}:${m.quantityPerUnit}`)
    .join("|");
}

/** Options for UI: all blueprints for product; sorted by tier (1,2,3) then baseOrePerUnit; isOptimized for the chosen one. Duplicate recipes (same inputs) are collapsed to one. */
export function getBlueprintOptionsForProduct(
  productTypeID: number,
  blueprints: BlueprintsMap,
  types: TypesMap,
  options: { maxDepth?: number; blueprintToFacilityNames?: Record<number, string> } = {}
): BlueprintOption[] {
  const list = getBlueprintsForProduct(productTypeID, blueprints);
  const withTierAndSum = list.map((bp) => {
    const base = baseMaterialsPerUnitProduct(
      productTypeID,
      bp,
      blueprints,
      types,
      options
    );
    const baseOrePerUnit = sumBaseOreOnly(base);
    const tier = getBlueprintOreTier(base, types);
    const fallbackLabel = `Blueprint ${bp.blueprintTypeID}`;
    let chainFull = fallbackLabel;
    let chainAbbrev = fallbackLabel;
    try {
      const chain = buildBlueprintChainStrings(bp, productTypeID, types);
      chainFull = chain.chainFull;
      chainAbbrev = chain.chainAbbrev;
    } catch {
      // keep fallbacks
    }
    const materials = getMaterialsPerUnitProduct(bp, productTypeID);
    const inputTypeIDs = materials.map((m) => m.typeID);
    return {
      blueprintTypeID: bp.blueprintTypeID,
      baseOrePerUnit,
      tier,
      chainFull,
      chainAbbrev,
      productTypeID,
      inputTypeIDs,
      _recipeKey: recipeKey(materials),
    };
  });
  const withInputs = withTierAndSum.filter((x) => (x.inputTypeIDs?.length ?? 0) > 0);
  const sorted = withInputs.sort(
    (a, b) => a.tier - b.tier || a.baseOrePerUnit - b.baseOrePerUnit
  );
  const seen = new Set<string>();
  const deduped = sorted.filter((x) => {
    const key = x._recipeKey;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const optimizedId = deduped[0]?.blueprintTypeID;
  const facilityMap = options.blueprintToFacilityNames ?? {};
  return deduped.map((x) => ({
    blueprintTypeID: x.blueprintTypeID,
    baseOrePerUnit: x.baseOrePerUnit,
    chainFull: x.chainFull,
    chainAbbrev: x.chainAbbrev,
    productTypeID: x.productTypeID,
    inputTypeIDs: x.inputTypeIDs,
    isOptimized: x.blueprintTypeID === optimizedId,
    facility: facilityMap[x.blueprintTypeID],
  }));
}

export interface MaterialPerUnit {
  typeID: number;
  quantityPerUnit: number;
}

export function getMaterialsPerUnitProduct(
  blueprint: Blueprint,
  productTypeID: number
): MaterialPerUnit[] {
  const mfg = blueprint?.activities?.manufacturing;
  if (!mfg?.materials?.length || !mfg?.products?.length) return [];
  const product = mfg.products.find((p) => p.typeID === productTypeID);
  if (!product || product.quantity <= 0) return [];
  const productQty = product.quantity;
  return mfg.materials.map((m) => ({
    typeID: m.typeID,
    quantityPerUnit: m.quantity / productQty,
  }));
}

/** Total manufacturing time in seconds for planned items (sum of blueprint runs * runTime). */
export function totalManufacturingTimeSeconds(
  plannedItems: Array<{
    typeID?: number;
    quantity: number;
    blueprintTypeID?: number;
  }>,
  blueprints: BlueprintsMap,
  _types: TypesMap
): number {
  let total = 0;
  for (const item of plannedItems) {
    const { typeID, quantity } = item;
    if (typeID == null || quantity <= 0) continue;
    const bp = resolveBlueprint(
      { typeID, blueprintTypeID: item.blueprintTypeID },
      blueprints,
      _types
    );
    if (!bp?.activities?.manufacturing) continue;
    const mfg = bp.activities.manufacturing;
    const product = mfg.products.find((p) => p.typeID === typeID);
    if (!product || product.quantity <= 0) continue;
    const runs = Math.ceil(quantity / product.quantity);
    total += runs * (mfg.time ?? 0);
  }
  return total;
}

/** plannedItems with typeID (and optional blueprintTypeID); returns total materials by typeID. */
export function totalMaterialsFromPlannedItems(
  plannedItems: Array<{
    typeID: number;
    quantity: number;
    blueprintTypeID?: number;
  }>,
  blueprints: BlueprintsMap,
  types: TypesMap
): Record<number, number> {
  const total: Record<number, number> = {};
  for (const item of plannedItems) {
    const { typeID, quantity } = item;
    if (quantity <= 0) continue;
    const bp = resolveBlueprint(item, blueprints, types);
    if (!bp) continue;
    const perUnit = getMaterialsPerUnitProduct(bp, typeID);
    for (const { typeID: matTypeID, quantityPerUnit } of perUnit) {
      total[matTypeID] = (total[matTypeID] ?? 0) + quantityPerUnit * quantity;
    }
  }
  return total;
}

export function totalMassFromMaterials(
  materialsByTypeID: Record<number, number>,
  types: TypesMap
): number {
  let mass = 0;
  for (const [typeIDStr, qty] of Object.entries(materialsByTypeID)) {
    const t = types[typeIDStr];
    const m = t?.mass ?? 0;
    mass += m * qty;
  }
  return mass;
}

export function totalVolumeFromMaterials(
  materialsByTypeID: Record<number, number>,
  types: TypesMap
): number {
  let vol = 0;
  for (const [typeIDStr, qty] of Object.entries(materialsByTypeID)) {
    const t = types[typeIDStr];
    const v = t?.volume ?? 0;
    vol += v * qty;
  }
  return vol;
}

export interface ProductionStepEntry {
  typeID: number;
  name: string;
  quantity: number;
}

export interface ProductionStep {
  depth: number;
  items: ProductionStepEntry[];
}

export type ProductionGraph = ProductionStep[];

const DEFAULT_MAX_DEPTH = 10;

/** Collect all leaf nodes (base materials to mine) from production trees; aggregated by typeID. */
export function getBaseMaterialsFromTrees(
  trees: ProductionTreeNode[],
  types: TypesMap
): ProductionStepEntry[] {
  const aggregated: Record<number, number> = {};
  function walk(nodes: ProductionTreeNode[]) {
    for (const node of nodes) {
      if (node.children.length === 0) {
        aggregated[node.typeID] = (aggregated[node.typeID] ?? 0) + node.quantity;
      } else {
        walk(node.children);
      }
    }
  }
  walk(trees);
  return Object.entries(aggregated)
    .filter(([, qty]) => qty > 0)
    .map(([typeIDStr, quantity]) => ({
      typeID: Number(typeIDStr),
      name: types[typeIDStr]?.name ?? String(typeIDStr),
      quantity: Math.round(quantity),
    }));
}

/** Collect all nodes (including intermediates) from production trees; aggregated by typeID. */
export function getAllMaterialsFromTrees(
  trees: ProductionTreeNode[],
  types: TypesMap
): ProductionStepEntry[] {
  const aggregated: Record<number, number> = {};
  function walk(nodes: ProductionTreeNode[]) {
    for (const node of nodes) {
      aggregated[node.typeID] = (aggregated[node.typeID] ?? 0) + node.quantity;
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(trees);
  return Object.entries(aggregated)
    .filter(([, qty]) => qty > 0)
    .map(([typeIDStr, quantity]) => ({
      typeID: Number(typeIDStr),
      name: types[typeIDStr]?.name ?? String(typeIDStr),
      quantity: Math.round(quantity),
    }));
}

/** Flatten production trees into steps by depth (BFS). Used so graph respects overrides. */
export function treeToGraph(
  trees: ProductionTreeNode[],
  types: TypesMap
): ProductionGraph {
  const graph: ProductionGraph = [];
  if (trees.length === 0) return graph;
  let currentLevel: ProductionTreeNode[] = trees;
  let depth = 0;
  while (currentLevel.length > 0) {
    const aggregated: Record<number, number> = {};
    for (const node of currentLevel) {
      aggregated[node.typeID] = (aggregated[node.typeID] ?? 0) + node.quantity;
    }
    const items = Object.entries(aggregated)
      .filter(([, qty]) => qty > 0)
      .map(([typeIDStr, quantity]) => ({
        typeID: Number(typeIDStr),
        name: types[typeIDStr]?.name ?? String(typeIDStr),
        quantity: Math.round(quantity),
      }));
    graph.push({ depth, items });
    currentLevel = currentLevel.flatMap((n) => n.children);
    depth++;
  }
  return graph;
}

export function buildProductionGraph(
  plannedItems: Array<{
    typeID: number;
    quantity: number;
    blueprintTypeID?: number;
  }>,
  blueprints: BlueprintsMap,
  types: TypesMap,
  options: { maxDepth?: number; overrides?: Record<string, number> } = {}
): ProductionGraph {
  const { maxDepth = DEFAULT_MAX_DEPTH, overrides } = options;
  const trees = buildProductionTree(plannedItems, blueprints, types, {
    maxDepth,
    overrides,
  });
  return treeToGraph(trees, types);
}

export interface ProductionTreeNode {
  typeID: number;
  name: string;
  quantity: number;
  children: ProductionTreeNode[];
}

function resolveBlueprintForPath(
  typeID: number,
  pathPrefix: string,
  overrides: Record<string, number> | undefined,
  blueprints: BlueprintsMap,
  types: TypesMap
): Blueprint | undefined {
  const overrideBpId = overrides?.[pathPrefix];
  if (overrideBpId != null) {
    const bp = blueprints[String(overrideBpId)];
    if (bp?.activities?.manufacturing?.products?.some((p) => p.typeID === typeID))
      return bp;
  }
  return getOptimizedBlueprintForProduct(typeID, blueprints, types);
}

function buildTreeRecurse(
  typeID: number,
  quantity: number,
  depth: number,
  pathTypeIDs: Set<number>,
  blueprints: BlueprintsMap,
  types: TypesMap,
  maxDepth: number,
  pathPrefix: string,
  overrides: Record<string, number> | undefined
): ProductionTreeNode {
  const name = types[String(typeID)]?.name ?? String(typeID);
  const children: ProductionTreeNode[] = [];
  if (depth < maxDepth && quantity > 0) {
    const bp = resolveBlueprintForPath(typeID, pathPrefix, overrides, blueprints, types);
    if (bp) {
      const perUnit = getMaterialsPerUnitProduct(bp, typeID);
      for (const { typeID: matTypeID, quantityPerUnit } of perUnit) {
        const childQty = Math.round(quantityPerUnit * quantity);
        if (childQty <= 0) continue;
        if (pathTypeIDs.has(matTypeID)) continue;
        const nextPath = new Set(pathTypeIDs);
        nextPath.add(typeID);
        const childPathPrefix = `${pathPrefix}/${matTypeID}`;
        children.push(
          buildTreeRecurse(
            matTypeID,
            childQty,
            depth + 1,
            nextPath,
            blueprints,
            types,
            maxDepth,
            childPathPrefix,
            overrides
          )
        );
      }
    }
  }
  return { typeID, name, quantity, children };
}

/** One tree per planned item; each node has typeID, name, quantity, children. Root uses resolved blueprint; overrides apply per path. */
export function buildProductionTree(
  plannedItems: Array<{
    typeID: number;
    quantity: number;
    blueprintTypeID?: number;
  }>,
  blueprints: BlueprintsMap,
  types: TypesMap,
  options: { maxDepth?: number; overrides?: Record<string, number> } = {}
): ProductionTreeNode[] {
  const { maxDepth = DEFAULT_MAX_DEPTH, overrides } = options;
  return plannedItems
    .filter((p) => p.quantity > 0)
    .map((item, i) => {
      const { typeID, quantity } = item;
      const name = types[String(typeID)]?.name ?? String(typeID);
      const pathPrefix = `${i}/${typeID}`;
      let bp: Blueprint | undefined;
      const overrideBpId = overrides?.[pathPrefix];
      if (overrideBpId != null) {
        const overrideBp = blueprints[String(overrideBpId)];
        if (overrideBp?.activities?.manufacturing?.products?.some((p) => p.typeID === typeID))
          bp = overrideBp;
      }
      if (!bp) bp = resolveBlueprint(item, blueprints, types);
      const children: ProductionTreeNode[] = [];
      if (bp && maxDepth > 0 && quantity > 0) {
        const perUnit = getMaterialsPerUnitProduct(bp, typeID);
        const path = new Set<number>([typeID]);
        for (const { typeID: matTypeID, quantityPerUnit } of perUnit) {
          const childQty = Math.round(quantityPerUnit * quantity);
          if (childQty <= 0) continue;
          const childPathPrefix = `${pathPrefix}/${matTypeID}`;
          children.push(
            buildTreeRecurse(
              matTypeID,
              childQty,
              1,
              path,
              blueprints,
              types,
              maxDepth,
              childPathPrefix,
              overrides
            )
          );
        }
      }
      return { typeID, name, quantity, children };
    });
}

export interface NetworkGraphNode {
  typeID: number;
  name: string;
  quantity: number;
}

export interface NetworkGraphEdge {
  fromColumn: number;
  fromTypeID: number;
  toColumn: number;
  toTypeID: number;
  quantity: number;
}

export interface ProductionNetworkGraph {
  columns: NetworkGraphNode[][];
  edges: NetworkGraphEdge[];
}

function collectNodesAndEdges(
  node: ProductionTreeNode,
  depth: number,
  nodes: Array<{ depth: number; typeID: number; name: string; quantity: number }>,
  edges: Array<{ fromDepth: number; fromTypeID: number; toDepth: number; toTypeID: number; quantity: number }>
): void {
  nodes.push({ depth, typeID: node.typeID, name: node.name, quantity: node.quantity });
  for (const child of node.children) {
    edges.push({
      fromDepth: depth + 1,
      fromTypeID: child.typeID,
      toDepth: depth,
      toTypeID: node.typeID,
      quantity: child.quantity,
    });
    collectNodesAndEdges(child, depth + 1, nodes, edges);
  }
}

export function buildProductionNetworkGraph(
  trees: ProductionTreeNode[],
  types: TypesMap
): ProductionNetworkGraph {
  const allNodes: Array<{ depth: number; typeID: number; name: string; quantity: number }> = [];
  const allEdges: Array<{ fromDepth: number; fromTypeID: number; toDepth: number; toTypeID: number; quantity: number }> = [];
  for (const root of trees) {
    collectNodesAndEdges(root, 0, allNodes, allEdges);
  }
  let maxDepth = 0;
  for (const n of allNodes) {
    if (n.depth > maxDepth) maxDepth = n.depth;
  }

  const colCount = maxDepth + 1;
  const columns: NetworkGraphNode[][] = Array.from({ length: colCount }, () => []);
  const nodeAgg = new Map<string, number>();
  for (const n of allNodes) {
    const col = maxDepth - n.depth;
    const key = `${col}-${n.typeID}`;
    nodeAgg.set(key, (nodeAgg.get(key) ?? 0) + n.quantity);
  }
  for (let c = 0; c < colCount; c++) {
    for (const [key, quantity] of nodeAgg) {
      const parts = key.split("-");
      if (Number(parts[0]) !== c) continue;
      const typeID = Number(parts[1]);
      const name = types[String(typeID)]?.name ?? String(typeID);
      columns[c].push({ typeID, name, quantity: Math.round(quantity) });
    }
  }

  const edgeAgg = new Map<string, number>();
  for (const e of allEdges) {
    const fromCol = maxDepth - e.fromDepth;
    const toCol = maxDepth - e.toDepth;
    const key = `${fromCol}-${e.fromTypeID}-${toCol}-${e.toTypeID}`;
    edgeAgg.set(key, (edgeAgg.get(key) ?? 0) + e.quantity);
  }
  const edges: NetworkGraphEdge[] = [];
  for (const [key, quantity] of edgeAgg) {
    const [fromCol, fromTypeID, toCol, toTypeID] = key.split("-").map(Number);
    edges.push({ fromColumn: fromCol, fromTypeID, toColumn: toCol, toTypeID, quantity: Math.round(quantity) });
  }

  return { columns, edges };
}

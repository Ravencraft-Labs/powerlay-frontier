import type { ContractResourceLine, CreateDraftInput, UpdateDraftInput } from "@powerlay/core";

function draftLineToBackendItem(l: CreateDraftInput["lines"][0]): Record<string, unknown> {
  const base: Record<string, unknown> = {
    resource_name: l.resourceName,
    required_amount: l.requiredAmount,
    reward_amount: l.rewardTokensFullLine,
  };
  if (l.assigneeText?.trim()) base.assignee_text = l.assigneeText.trim();
  if (l.typeID > 0) {
    base.type_id = l.typeID;
    base.resource_id = String(l.typeID);
  } else {
    base.resource_id = l.resourceName.trim().toLowerCase().replace(/\s+/g, "_") || "unknown";
  }
  return base;
}

/**
 * PUT draft updates must keep stable item row ids when the backend persists lines by id; omitting them can
 * trigger server-side insert/constraint errors (HTTP 500) on second save.
 */
export function mapCreateDraftToBackendWithExistingLineIds(
  input: CreateDraftInput,
  existingLines: ContractResourceLine[]
): Record<string, unknown> {
  const used = new Set<string>();
  const items = input.lines.map((l) => {
    const base = draftLineToBackendItem(l);
    const nameEq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const match =
      existingLines.find((ex) => !used.has(ex.id) && ex.typeID === l.typeID && nameEq(ex.resourceName, l.resourceName)) ??
      existingLines.find((ex) => !used.has(ex.id) && nameEq(ex.resourceName, l.resourceName));
    if (match) {
      used.add(match.id);
      /** Item row identity + amounts for in-place update (field names vary by API version; send both ids). */
      base.id = match.id;
      base.contract_item_id = match.id;
      base.sort_order = match.sortOrder ?? 0;
      base.delivered_amount = match.deliveredAmount;
      base.paid_reward_amount = match.paidRewardAmount ?? 0;
    }
    return base;
  });

  const body: Record<string, unknown> = {
    visibility: input.visibility,
    priority: input.priority,
    title: input.title,
    target_star_system: input.targetStarSystem,
    target_ssu_id: input.targetSsuId,
    items,
  };
  if (input.description?.trim()) body.description = input.description.trim();
  if (input.expiresAt != null) body.expires_at = new Date(input.expiresAt).toISOString();
  return body;
}

/** Create/update body accepted by FastAPI ContractCreateRequest (aliases supported by backend). */
export function mapCreateDraftToBackend(input: CreateDraftInput): Record<string, unknown> {
  const items = input.lines.map((l) => draftLineToBackendItem(l));

  const body: Record<string, unknown> = {
    visibility: input.visibility,
    priority: input.priority,
    title: input.title,
    target_star_system: input.targetStarSystem,
    target_ssu_id: input.targetSsuId,
    items,
  };
  if (input.description?.trim()) body.description = input.description.trim();
  if (input.expiresAt != null) body.expires_at = new Date(input.expiresAt).toISOString();
  return body;
}

export function mapUpdateDraftToBackend(patch: UpdateDraftInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.title != null) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description?.trim() || null;
  if (patch.targetStarSystem != null) body.target_star_system = patch.targetStarSystem;
  if (patch.targetSsuId != null) body.target_ssu_id = patch.targetSsuId;
  if (patch.visibility != null) body.visibility = patch.visibility;
  if (patch.priority != null) body.priority = patch.priority;
  if (patch.lines != null) {
    body.items = patch.lines.map((l) => draftLineToBackendItem(l));
  }
  if (patch.expiresAt !== undefined) {
    body.expires_at = patch.expiresAt == null ? null : new Date(patch.expiresAt).toISOString();
  }
  return body;
}

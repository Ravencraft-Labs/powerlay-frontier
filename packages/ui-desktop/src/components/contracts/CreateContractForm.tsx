import React, { useCallback, useEffect, useState } from "react";
import type { ContractLineDraftInput, ContractPriority, ContractVisibility, LogisticsContract } from "@powerlay/core";
import { mergeDraftResourceLines } from "@powerlay/core";
import type { ConnectedStorage, GameData } from "../../preload";
import type { ContractsClient } from "../../services/contracts/contractsClient";
import { contractsErrorForUi } from "../../utils/contractsIpcError";
import { ContractResourceLineEditor } from "./ContractResourceLineEditor";

const inputCls =
  "px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted w-full min-w-0";

function emptyLine(): ContractLineDraftInput {
  return { typeID: 0, resourceName: "", requiredAmount: 0, rewardTokensFullLine: 0 };
}

function contractToLines(c: LogisticsContract): ContractLineDraftInput[] {
  return c.lines.map((l) => ({
    typeID: l.typeID,
    resourceName: l.resourceName,
    requiredAmount: l.requiredAmount,
    rewardTokensFullLine: l.rewardTokensFullLine,
    assigneeText: l.assigneeText,
  }));
}

export interface CreateContractFormProps {
  client: ContractsClient;
  gameData: GameData | null;
  onPublished: () => void;
  onDraftsChanged: () => void;
  onOpenConnectStorage: () => void;
}

export function CreateContractForm({ client, gameData, onPublished, onDraftsChanged, onOpenConnectStorage }: CreateContractFormProps) {
  const types = gameData?.types ?? {};
  const systems = gameData?.starSystems ?? [];

  const [drafts, setDrafts] = useState<LogisticsContract[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetStarSystem, setTargetStarSystem] = useState("");
  const [targetSsuId, setTargetSsuId] = useState("");
  const [visibility, setVisibility] = useState<ContractVisibility>("tribe");
  const [priority, setPriority] = useState<ContractPriority>("medium");
  const [expiresAt, setExpiresAt] = useState("");
  const [lines, setLines] = useState<ContractLineDraftInput[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [connectedStorages, setConnectedStorages] = useState<ConnectedStorage[]>([]);
  const [storagesLoading, setStoragesLoading] = useState(true);

  const loadConnectedStorages = useCallback(async () => {
    if (!window.efOverlay?.storage?.listConnected) {
      setStoragesLoading(false);
      return;
    }
    try {
      const list = await window.efOverlay.storage.listConnected();
      setConnectedStorages(list);
    } catch {
      setConnectedStorages([]);
    } finally {
      setStoragesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectedStorages();
  }, [loadConnectedStorages]);

  const loadDrafts = useCallback(async () => {
    try {
      const list = await client.listDrafts();
      const sorted = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      setDrafts(sorted);
    } catch (e) {
      console.error(e);
    }
  }, [client]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const resetBlank = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setTargetStarSystem("");
    setTargetSsuId("");
    setVisibility("tribe");
    setPriority("medium");
    setExpiresAt("");
    setLines([emptyLine()]);
    setPublishError(null);
  };

  const loadDraft = (c: LogisticsContract) => {
    setEditingId(c.id);
    setTitle(c.title);
    setDescription(c.description ?? "");
    setTargetStarSystem(c.targetStarSystem);
    setTargetSsuId(c.targetSsuId);
    setVisibility(c.visibility);
    setPriority(c.priority);
    setExpiresAt(c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : "");
    const ls = contractToLines(c);
    setLines(ls.length ? ls : [emptyLine()]);
    setPublishError(null);
  };

  const normalizedLines = (): ContractLineDraftInput[] => {
    const valid = lines.filter((l) => l.typeID > 0 && l.resourceName.trim() && l.requiredAmount > 0);
    return mergeDraftResourceLines(valid);
  };

  const expiresMs = (): number | undefined => {
    const t = expiresAt.trim();
    if (!t) return undefined;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? ms : undefined;
  };

  const saveDraft = async () => {
    setSaving(true);
    setPublishError(null);
    try {
      if (!targetStarSystem.trim()) {
        setPublishError("Target system is required.");
        return;
      }
      if (!targetSsuId.trim()) {
        setPublishError("Target storage ID is required.");
        return;
      }
      const payloadLines = normalizedLines();
      if (payloadLines.length === 0) {
        setPublishError("Add at least one valid resource line before saving the draft.");
        return;
      }
      if (editingId) {
        await client.updateDraft(editingId, {
          title: title.trim(),
          description: description.trim() || undefined,
          targetStarSystem: targetStarSystem.trim(),
          targetSsuId: targetSsuId.trim(),
          visibility,
          priority,
          lines: payloadLines,
          expiresAt: expiresMs(),
        });
      } else {
        const created = await client.createDraft({
          title: title.trim() || "Untitled draft",
          description: description.trim() || undefined,
          targetStarSystem: targetStarSystem.trim() || "—",
          targetSsuId: targetSsuId.trim(),
          visibility,
          priority,
          lines: payloadLines,
          expiresAt: expiresMs(),
        });
        setEditingId(created.id);
      }
      await loadDrafts();
      onDraftsChanged();
    } catch (e) {
      console.error(e);
      const { auth, message } = contractsErrorForUi(e, "Sign in with your wallet to save drafts.");
      setPublishError(auth ? "Sign in with your wallet to save drafts." : message);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    setPublishError(null);
    try {
      const payloadLines = normalizedLines();
      if (payloadLines.length === 0) {
        setPublishError("Add at least one valid resource line (search a resource, set required amount and tokens).");
        return;
      }
      if (!targetStarSystem.trim()) {
        setPublishError("Target system is required.");
        return;
      }
      if (!targetSsuId.trim()) {
        setPublishError("Target storage ID is required.");
        return;
      }
      let id = editingId;
      if (!id) {
        const created = await client.createDraft({
          title: title.trim() || "Untitled draft",
          description: description.trim() || undefined,
          targetStarSystem: targetStarSystem.trim() || "—",
          targetSsuId: targetSsuId.trim(),
          visibility,
          priority,
          lines: payloadLines,
          expiresAt: expiresMs(),
        });
        id = created.id;
        setEditingId(id);
      } else {
        await client.updateDraft(id, {
          title: title.trim(),
          description: description.trim() || undefined,
          targetStarSystem: targetStarSystem.trim(),
          targetSsuId: targetSsuId.trim(),
          visibility,
          priority,
          lines: payloadLines,
          expiresAt: expiresMs(),
        });
      }
      const result = await client.publish(id);
      if (!result.ok) {
        setPublishError(result.message);
        return;
      }
      resetBlank();
      await loadDrafts();
      onDraftsChanged();
      onPublished();
    } catch (e) {
      console.error(e);
      const { auth, message } = contractsErrorForUi(e, "Sign in with the wallet to create contracts.");
      setPublishError(auth ? "Sign in with the wallet to create contracts." : message);
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = async () => {
    if (!editingId) {
      resetBlank();
      return;
    }
    setSaving(true);
    setPublishError(null);
    try {
      await client.cancel(editingId);
      resetBlank();
      await loadDrafts();
      onDraftsChanged();
    } catch (e) {
      console.error(e);
      const { auth, message } = contractsErrorForUi(e, "Sign in with your wallet to discard drafts.");
      setPublishError(auth ? "Sign in with your wallet to discard drafts." : message);
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (idx: number, next: ContractLineDraftInput) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()]);
  };

  return (
    <div className="flex flex-col gap-4">
      {drafts.length > 0 && (
        <div className="rounded-md border border-border bg-bg/40 p-3">
          <div className="text-xs font-medium text-muted mb-2">Your drafts</div>
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <button type="button" className="text-accent hover:underline truncate text-left" onClick={() => loadDraft(d)}>
                  {d.title || d.id}
                </button>
                <span className="text-muted text-xs shrink-0">{d.lines.length} lines</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm" onClick={resetBlank}>
          New draft
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Title</span>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short description" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Priority</span>
          <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as ContractPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-muted">Details (optional)</span>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Target system</span>
          <input className={inputCls} list="contract-star-systems" value={targetStarSystem} onChange={(e) => setTargetStarSystem(e.target.value)} />
          <datalist id="contract-star-systems">
            {systems.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Target storage</span>
          {storagesLoading ? (
            <div className={`${inputCls} text-muted`}>Loading storages…</div>
          ) : connectedStorages.length === 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="px-2 py-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 text-xs text-amber-200 leading-snug">
                No storages connected yet.{" "}
                <button
                  type="button"
                  className="underline text-amber-100 hover:text-white cursor-pointer"
                  onClick={onOpenConnectStorage}
                >
                  Connect a storage unit
                </button>{" "}
                to link it to this contract.
              </div>
            </div>
          ) : (
            <select
              className={inputCls}
              value={targetSsuId}
              onChange={(e) => setTargetSsuId(e.target.value)}
            >
              <option value="">— Select storage —</option>
              {connectedStorages.map((s) => (
                <option key={s.ssuObjectId} value={s.ssuObjectId}>
                  {s.name ? `${s.name} · ` : ""}{s.ssuObjectId.slice(0, 20)}…
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Visibility</span>
          <select className={inputCls} value={visibility} onChange={(e) => setVisibility(e.target.value as ContractVisibility)}>
            <option value="tribe">Tribe</option>
            <option value="alliance">Alliance (same as tribe for now)</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Expires (optional)</span>
          <input className={inputCls} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
      </div>

      <p className="text-xs text-muted m-0 leading-relaxed border border-border/60 rounded-md px-3 py-2 bg-surface/40">
        Rewards are proportional: if you request 1000 Feldspar for 100 tokens, a player delivering 400 earns 40 tokens. Duplicate resources in the form are merged
        into one line (amounts and rewards sum) before save.
      </p>

      <div>
        <div className="text-xs font-medium text-muted mb-1">Resource lines</div>
        <div className="text-[0.65rem] text-muted grid grid-cols-[minmax(0,1fr)_88px_88px_100px_auto] gap-2 px-0 pb-1 border-b border-border">
          <span>Resource</span>
          <span>Required</span>
          <span>Tokens</span>
          <span>Assignee</span>
          <span />
        </div>
        {lines.map((line, idx) => (
          <ContractResourceLineEditor
            key={`${line.typeID}-${idx}`}
            line={line}
            types={types}
            oreGroupIDs={gameData?.oreGroupIDs}
            blueprints={gameData?.blueprints}
            onChange={(next) => updateLine(idx, next)}
            onRemove={() => removeLine(idx)}
          />
        ))}
        <button type="button" className="mt-2 cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm" onClick={addLine}>
          Add line
        </button>
      </div>

      {publishError && <p className="text-sm text-destructive m-0">{publishError}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm" disabled={saving} onClick={saveDraft}>
          Save draft
        </button>
        <button
          type="button"
          className="cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50"
          disabled={saving}
          onClick={publish}
        >
          Publish
        </button>
        {editingId && (
          <button type="button" className="cursor-pointer px-3 py-1.5 rounded-md border border-border-input text-muted text-sm" disabled={saving} onClick={discardDraft}>
            Discard draft
          </button>
        )}
        <span className="text-xs text-muted">Published contracts are immutable here; cancel only if nothing was delivered (mock rules).</span>
      </div>
    </div>
  );
}

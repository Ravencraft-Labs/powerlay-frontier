import React, { useState, useEffect, useCallback } from "react";
import type { TribeTodo, TodoPriority, TodoStatus } from "@powerlay/core";
import { sortTodosByPriority, filterByStatus } from "@powerlay/core";
import { OverlayWithLock } from "./OverlayWithLock";

const api = () => window.efOverlay?.tribeTodo;

export function TribeTodoSection() {
  const [todos, setTodos] = useState<TribeTodo[]>([]);
  const [filterStatus, setFilterStatus] = useState<TodoStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<TodoPriority | "all">("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const t = api();
    if (!t) {
      setTodos([]);
      return;
    }
    setLoading(true);
    try {
      const list = await t.list();
      setTodos(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    let list = todos;
    if (filterStatus !== "all") list = filterByStatus(list, filterStatus);
    if (filterPriority !== "all") list = list.filter((t) => t.priority === filterPriority);
    return sortTodosByPriority(list);
  }, [todos, filterStatus, filterPriority]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = api();
    if (!t || !title.trim()) return;
    try {
      await t.create({ title: title.trim(), description: description.trim() || undefined, assignedTo: assignedTo.trim() || undefined, priority });
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setPriority("medium");
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (id: string, status: TodoStatus) => {
    const t = api();
    if (!t) return;
    try {
      await t.update(id, { status });
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    const t = api();
    if (!t) return;
    try {
      await t.delete(id);
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const hasApi = !!api();
  const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";
  const inputCls = "px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted";
  const btnCls = "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";
  const priorityColor = (p: TodoPriority) =>
    p === "high" ? "text-destructive" : p === "medium" ? "text-accent" : "text-emerald-400";

  return (
    <section className={sectionCls}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="m-0 text-base font-semibold text-text">Tribe TODO <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border border-border/60 bg-surface/60 text-muted select-none cursor-default font-normal" role="status">Under construction</span></h2>
        <OverlayWithLock frame="todo" btnCls={btnCls} />
      </div>
      {!hasApi && (
        <p className="text-sm text-muted mb-3">
          Run from Electron to sync tasks. Using local state only.
        </p>
      )}
      <form onSubmit={handleCreate} className="flex flex-wrap gap-2 mb-3">
        <input
          className={`${inputCls} min-w-[160px]`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
        />
        <input
          className={`${inputCls} min-w-[180px]`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
        <input
          className={`${inputCls} min-w-[120px]`}
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="Assigned to (optional)"
          title="Who picked up this task — shown on overlay"
        />
        <select
          className={inputCls}
          value={priority}
          onChange={(e) => setPriority(e.target.value as TodoPriority)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button type="submit" className={btnCls}>Add</button>
      </form>
      <div className="flex gap-2 mb-3">
        <select
          className={inputCls}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TodoStatus | "all")}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <select
          className={inputCls}
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as TodoPriority | "all")}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      {loading ? (
        <p className="text-sm text-text">Loading…</p>
      ) : (
        <ul className="list-none p-0 m-0">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 py-2 border-b border-border last:border-b-0"
            >
              <span className={priorityColor(t.priority)}>{t.title}</span>
              {t.assignedTo && (
                <span className="text-xs text-muted" title="Picked up by">{t.assignedTo}</span>
              )}
              <span
                className={`text-[0.7rem] py-0.5 px-1.5 rounded uppercase ${
                  t.status === "open"
                    ? "bg-border-input"
                    : t.status === "in-progress"
                      ? "bg-blue-900/80 text-blue-200"
                      : "bg-selection-bg text-selection-text"
                }`}
              >
                {t.status}
              </span>
              <select
                className={`${inputCls} w-[110px] ml-auto`}
                value={t.status}
                onChange={(e) => handleStatusChange(t.id, e.target.value as TodoStatus)}
              >
                <option value="open">Open</option>
                <option value="in-progress">In progress</option>
                <option value="done">Done</option>
              </select>
              <button type="button" className={btnCls} onClick={() => handleDelete(t.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

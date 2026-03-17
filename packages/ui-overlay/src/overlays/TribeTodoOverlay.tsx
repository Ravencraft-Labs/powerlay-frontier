import React, { useState, useEffect, useCallback } from "react";
import type { TribeTodo, TodoStatus } from "@powerlay/core";
import { sortTodosByPriority } from "@powerlay/core";
import { OverlayFrame } from "../components/OverlayFrame";
import { useEfOverlay } from "../hooks/useEfOverlay";

function statusLabel(s: TodoStatus): string {
  return s === "in-progress" ? "In progress" : s === "done" ? "Done" : "Open";
}

export function TribeTodoOverlay() {
  const api = useEfOverlay();
  const [todos, setTodos] = useState<TribeTodo[]>([]);

  const load = useCallback(async () => {
    const t = api?.tribeTodo;
    if (!t) {
      setTodos([]);
      return;
    }
    try {
      const list = await t.list();
      setTodos(sortTodosByPriority(list));
    } catch (err) {
      console.error(err);
    }
  }, [api?.tribeTodo]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleStatusChange = async (id: string, status: TodoStatus) => {
    const t = api?.tribeTodo;
    if (!t) return;
    try {
      await t.update(id, { status });
      await load();
    } catch (err) {
      console.error(err);
    }
  };

  const openTodos = todos.filter((t) => t.status !== "done");
  const priorityColor =
    (p: TribeTodo["priority"]) =>
    p === "high"
      ? "text-destructive"
      : p === "medium"
        ? "text-accent"
        : "text-emerald-400";

  return (
    <OverlayFrame
      title={
        <>
          Tribe TODO{" "}
          <span className="inline-flex items-center px-1.5 py-0.5 text-[0.65rem] rounded border border-border/70 bg-surface/80 text-muted select-none cursor-default" role="status">
            Under construction
          </span>
        </>
      }
    >
      {(locked) => (
      <ul className="list-none p-0 m-0">
        {openTodos.length === 0 ? (
          <li className="flex items-center gap-2 py-1.5 text-muted italic text-[0.8rem]">
            No open tasks
          </li>
        ) : (
          openTodos.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-b-0 text-[0.8rem]"
            >
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${priorityColor(t.priority)}`}>
                  {t.title}
                </span>
                {t.assignedTo && (
                  <span className="text-[0.7rem] text-muted" title="Picked up by">
                    {t.assignedTo}
                  </span>
                )}
              </div>
              {locked ? (
                <span className="text-[0.7rem] text-muted shrink-0">{statusLabel(t.status)}</span>
              ) : (
                <select
                  value={t.status}
                  onChange={(e) => handleStatusChange(t.id, e.target.value as TodoStatus)}
                  className="py-0.5 px-1.5 text-[0.7rem] rounded border border-border-input bg-bg text-text cursor-pointer overlay-no-drag"
                >
                  <option value="open">Open</option>
                  <option value="in-progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              )}
            </li>
          ))
        )}
      </ul>
      )}
    </OverlayFrame>
  );
}

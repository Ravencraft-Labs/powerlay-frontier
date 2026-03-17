import type { TribeTodo, CreateTodoInput, TodoPriority, TodoStatus } from "./types.js";

const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

export function createTodo(input: CreateTodoInput, id: string): TribeTodo {
  const now = Date.now();
  return {
    id,
    title: input.title.trim(),
    description: input.description?.trim(),
    assignedTo: input.assignedTo?.trim(),
    priority: input.priority ?? "medium",
    status: "open",
    createdAt: now,
  };
}

export function updateTodo(
  todo: TribeTodo,
  patch: Partial<Pick<TribeTodo, "title" | "description" | "assignedTo" | "priority" | "status">>
): TribeTodo {
  return {
    ...todo,
    ...(patch.title !== undefined && { title: patch.title.trim() }),
    ...(patch.description !== undefined && { description: patch.description?.trim() }),
    ...(patch.assignedTo !== undefined && { assignedTo: patch.assignedTo?.trim() }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.status !== undefined && { status: patch.status }),
  };
}

export function sortTodosByPriority(todos: TribeTodo[]): TribeTodo[] {
  return [...todos].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export function filterByStatus(todos: TribeTodo[], status: TodoStatus): TribeTodo[] {
  return todos.filter((t) => t.status === status);
}

export function validateTodo(todo: unknown): todo is TribeTodo {
  if (todo === null || typeof todo !== "object") return false;
  const o = todo as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    o.title.length > 0 &&
    ["low", "medium", "high"].includes(String(o.priority)) &&
    ["open", "in-progress", "done"].includes(String(o.status)) &&
    typeof o.createdAt === "number"
  );
}

import { app } from "electron";
import fs from "fs";
import path from "path";
import { validateTodo, createTodo, updateTodo } from "@powerlay/core";
import type { TribeTodo } from "@powerlay/core";

const FILENAME = "todos.json";

function getDataPath(): string {
  const userData = app.getPath("userData");
  const dir = path.join(userData, "Powerlay");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, FILENAME);
}

function loadTodos(): TribeTodo[] {
  const filePath = getDataPath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((t): t is TribeTodo => validateTodo(t));
  } catch {
    return [];
  }
}

function saveTodos(todos: TribeTodo[]): void {
  fs.writeFileSync(getDataPath(), JSON.stringify(todos, null, 2), "utf-8");
}

export function getTodoStore() {
  let todos = loadTodos();

  return {
    list(): TribeTodo[] {
      return loadTodos();
    },
    create(input: unknown): TribeTodo {
      todos = loadTodos();
      const id = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const parsed = input as { title: string; description?: string; assignedTo?: string; priority?: "low" | "medium" | "high" };
      const todo = createTodo(
        {
          title: parsed?.title ?? "Untitled",
          description: parsed?.description,
          assignedTo: parsed?.assignedTo,
          priority: parsed?.priority,
        },
        id
      );
      todos.push(todo);
      saveTodos(todos);
      return todo;
    },
    update(id: string, patch: unknown): TribeTodo | null {
      todos = loadTodos();
      const idx = todos.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const p = patch as Partial<Pick<TribeTodo, "title" | "description" | "assignedTo" | "priority" | "status">>;
      todos[idx] = updateTodo(todos[idx], p ?? {});
      saveTodos(todos);
      return todos[idx];
    },
    delete(id: string): boolean {
      todos = loadTodos();
      const before = todos.length;
      todos = todos.filter((t) => t.id !== id);
      if (todos.length === before) return false;
      saveTodos(todos);
      return true;
    },
  };
}

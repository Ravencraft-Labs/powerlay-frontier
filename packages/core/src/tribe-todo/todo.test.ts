import { describe, it, expect } from "vitest";
import {
  createTodo,
  updateTodo,
  sortTodosByPriority,
  filterByStatus,
  validateTodo,
} from "./todo";
import type { TribeTodo } from "./types";

describe("createTodo", () => {
  it("creates todo with required fields and defaults", () => {
    const t = createTodo({ title: " Test " }, "id-1");
    expect(t.id).toBe("id-1");
    expect(t.title).toBe("Test");
    expect(t.priority).toBe("medium");
    expect(t.status).toBe("open");
    expect(typeof t.createdAt).toBe("number");
  });

  it("uses provided priority and trims strings", () => {
    const t = createTodo(
      { title: "x", description: " d ", assignedTo: " u ", priority: "high" },
      "id-2"
    );
    expect(t.description).toBe("d");
    expect(t.assignedTo).toBe("u");
    expect(t.priority).toBe("high");
  });
});

describe("updateTodo", () => {
  it("applies patch and trims strings", () => {
    const t: TribeTodo = {
      id: "1",
      title: "Old",
      priority: "low",
      status: "open",
      createdAt: 0,
    };
    const updated = updateTodo(t, { title: " New ", status: "in-progress" });
    expect(updated.title).toBe("New");
    expect(updated.status).toBe("in-progress");
    expect(updated.id).toBe("1");
  });
});

describe("sortTodosByPriority", () => {
  it("sorts high then medium then low", () => {
    const todos: TribeTodo[] = [
      { id: "1", title: "L", priority: "low", status: "open", createdAt: 0 },
      { id: "2", title: "H", priority: "high", status: "open", createdAt: 0 },
      { id: "3", title: "M", priority: "medium", status: "open", createdAt: 0 },
    ];
    const sorted = sortTodosByPriority(todos);
    expect(sorted.map((t) => t.priority)).toEqual(["high", "medium", "low"]);
  });
});

describe("filterByStatus", () => {
  it("returns only todos with given status", () => {
    const todos: TribeTodo[] = [
      { id: "1", title: "A", priority: "high", status: "open", createdAt: 0 },
      { id: "2", title: "B", priority: "high", status: "done", createdAt: 0 },
      { id: "3", title: "C", priority: "high", status: "open", createdAt: 0 },
    ];
    expect(filterByStatus(todos, "open")).toHaveLength(2);
    expect(filterByStatus(todos, "done")).toHaveLength(1);
  });
});

describe("validateTodo", () => {
  it("returns true for valid todo", () => {
    const t: TribeTodo = {
      id: "1",
      title: "x",
      priority: "medium",
      status: "open",
      createdAt: 1,
    };
    expect(validateTodo(t)).toBe(true);
  });

  it("returns false for non-object", () => {
    expect(validateTodo(null)).toBe(false);
    expect(validateTodo(1)).toBe(false);
    expect(validateTodo("x")).toBe(false);
  });

  it("returns false for missing or invalid fields", () => {
    expect(validateTodo({})).toBe(false);
    expect(validateTodo({ id: "1", title: "", priority: "medium", status: "open", createdAt: 0 })).toBe(false);
    expect(validateTodo({ id: "1", title: "x", priority: "x", status: "open", createdAt: 0 })).toBe(false);
    expect(validateTodo({ id: "1", title: "x", priority: "medium", status: "x", createdAt: 0 })).toBe(false);
    expect(validateTodo({ id: "1", title: "x", priority: "medium", status: "open", createdAt: "0" })).toBe(false);
  });
});

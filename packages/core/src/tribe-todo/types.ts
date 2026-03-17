export type TodoPriority = "low" | "medium" | "high";
export type TodoStatus = "open" | "in-progress" | "done";

export interface TribeTodo {
  id: string;
  title: string;
  description?: string;
  assignedTo?: string;
  priority: TodoPriority;
  status: TodoStatus;
  createdAt: number;
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  assignedTo?: string;
  priority?: TodoPriority;
}

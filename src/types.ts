export type Priority = "high" | "medium" | "low";
export type TaskFilter = "all" | "open" | "done";
export type ThemeMode = "system" | "light" | "dark";
export type ChecklistKind = "completed" | "next";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  dueDate: string;
  tag: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TaskDraft {
  title: string;
  priority: Priority;
  dueDate: string;
  tag: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  createdAt: number;
}

export interface CurrentIteration {
  number: number;
  title: string;
  completed: ChecklistItem[];
  next: ChecklistItem[];
}

export interface IterationSummary {
  id: string;
  number: number;
  title: string;
  completed: string[];
  next: string[];
  feedback: string;
  finishedAt: number;
}

export interface Preferences {
  activeFilter: TaskFilter;
  theme: ThemeMode;
}

export interface AppState {
  schemaVersion: 2;
  preferences: Preferences;
  currentIteration: CurrentIteration;
  tasks: Task[];
  iterations: IterationSummary[];
}

export type StateAction =
  | { type: "add-task"; draft: TaskDraft; now?: number }
  | { type: "update-task"; id: string; draft: TaskDraft; now?: number }
  | { type: "toggle-task"; id: string; done: boolean; now?: number }
  | { type: "delete-task"; id: string }
  | { type: "set-filter"; filter: TaskFilter }
  | { type: "set-theme"; theme: ThemeMode }
  | { type: "add-checklist-item"; kind: ChecklistKind; text: string; now?: number }
  | { type: "toggle-checklist-item"; kind: ChecklistKind; id: string; checked: boolean }
  | { type: "delete-checklist-item"; kind: ChecklistKind; id: string }
  | { type: "apply-feedback"; feedback: string; now?: number }
  | { type: "complete-iteration"; feedback: string; now?: number }
  | { type: "replace-state"; state: AppState }
  | { type: "reset"; now?: number };

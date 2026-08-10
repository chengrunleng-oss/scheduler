export type Priority = "high" | "medium" | "low";
export type TaskStatus = "active" | "completed" | "discarded";
export type TaskFilter = "all" | TaskStatus;
export type ThemeMode = "system" | "light" | "dark";
export type ViewMode = "tree" | "priority" | "due_date";
export type SortMode = "manual" | "priority" | "due_date";
export type FolderScope = "all" | "root" | string;

export interface Task {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  tag: string;
  status: TaskStatus;
  folderId: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskDraft {
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  tag: string;
  status: TaskStatus;
  folderId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FolderDraft {
  name: string;
  parentId: string | null;
}

export interface Preferences {
  activeStatusFilter: TaskFilter;
  theme: ThemeMode;
  viewMode: ViewMode;
  sortMode: SortMode;
  folderScope: FolderScope;
}

export interface AppState {
  schemaVersion: 3;
  preferences: Preferences;
  tasks: Task[];
  folders: Folder[];
}

export type FolderDeleteStrategy = "move-contents" | "delete-branch";

export type StateAction =
  | { type: "add-task"; draft: TaskDraft; now?: number }
  | { type: "update-task"; id: string; draft: TaskDraft; now?: number }
  | { type: "set-task-status"; id: string; status: TaskStatus; now?: number }
  | { type: "adjust-task-priority"; id: string; direction: "raise" | "lower"; now?: number }
  | { type: "delete-task"; id: string }
  | { type: "set-status-filter"; filter: TaskFilter }
  | { type: "set-theme"; theme: ThemeMode }
  | { type: "set-view-mode"; viewMode: ViewMode }
  | { type: "set-sort-mode"; sortMode: SortMode }
  | { type: "set-folder-scope"; folderScope: FolderScope }
  | { type: "add-folder"; draft: FolderDraft; now?: number }
  | { type: "update-folder"; id: string; draft: FolderDraft; now?: number }
  | { type: "toggle-folder"; id: string }
  | { type: "delete-folder"; id: string; strategy: FolderDeleteStrategy }
  | { type: "replace-state"; state: AppState }
  | { type: "reset"; now?: number };

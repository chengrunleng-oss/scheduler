export type Priority = "high" | "low";
export type TaskStatus = "active" | "completed" | "discarded";
export type ResolvedStatus = Exclude<TaskStatus, "active">;
export type TaskFilter = "all" | TaskStatus;
export type ThemeMode = "system" | "light" | "dark";
export type ViewMode = "tree_manual" | "global_priority" | "global_due_date" | "priority_then_due_date";
export type DefaultTaskDueDate = "today" | "tomorrow" | "next_workday" | "none";
export type FolderScope = "all" | "root" | string;
export type RescheduleSource = "quick" | "detail";

export interface RescheduleRecord {
  fromDate: string;
  toDate: string;
  changedAt: number;
  reason: string;
  source: RescheduleSource;
}

export interface PendingResolution {
  targetStatus: ResolvedStatus;
  executeAt: number;
  originFolderId: string | null;
  originOrder: number;
  originPriority: Priority;
}

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
  resolvedAt: number | null;
  pendingResolution: PendingResolution | null;
  rescheduleHistory: RescheduleRecord[];
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
  folderScope: FolderScope;
  defaultTaskDueDate: DefaultTaskDueDate;
  defaultTaskPriority: Priority;
  expandedHandledContainers: string[];
  navigationCollapsedFolders: string[];
}

export interface AppState {
  schemaVersion: 4;
  preferences: Preferences;
  tasks: Task[];
  folders: Folder[];
}

export type FolderDeleteStrategy = "move-contents" | "delete-branch";

export type StateAction =
  | { type: "add-task"; draft: TaskDraft; now?: number }
  | { type: "update-task"; id: string; draft: TaskDraft; rescheduleReason?: string; now?: number }
  | { type: "move-task"; id: string; folderId: string | null; targetIndex: number; priority: Priority; now?: number }
  | { type: "set-task-priority"; id: string; priority: Priority; now?: number }
  | { type: "move-priority-divider"; folderId: string | null; highCount: number; now?: number }
  | { type: "start-task-resolution"; id: string; targetStatus: ResolvedStatus; executeAt?: number; now?: number }
  | { type: "cancel-task-resolution"; id: string; now?: number }
  | { type: "finalize-task-resolution"; id: string; now?: number }
  | { type: "finalize-expired-resolutions"; now?: number }
  | { type: "restore-task"; id: string; now?: number }
  | { type: "reschedule-task"; id: string; dueDate: string; reason?: string; source: RescheduleSource; now?: number }
  | { type: "apply-suggested-order"; folderId: string | null; now?: number }
  | { type: "delete-task"; id: string }
  | { type: "set-status-filter"; filter: TaskFilter }
  | { type: "set-theme"; theme: ThemeMode }
  | { type: "set-view-mode"; viewMode: ViewMode }
  | { type: "set-folder-scope"; folderScope: FolderScope }
  | { type: "set-default-task-values"; dueDate: DefaultTaskDueDate; priority: Priority }
  | { type: "toggle-handled-section"; containerId: string }
  | { type: "toggle-navigation-folder"; id: string }
  | { type: "add-folder"; draft: FolderDraft; now?: number }
  | { type: "update-folder"; id: string; draft: FolderDraft; now?: number }
  | { type: "toggle-folder"; id: string; collapsed?: boolean }
  | { type: "delete-folder"; id: string; strategy: FolderDeleteStrategy }
  | { type: "replace-state"; state: AppState }
  | { type: "reset"; now?: number };

import type { AppState, AttachmentMeta, Task, WorkLog } from "./types.js";

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const TASK_ATTACHMENT_WARNING_BYTES = 100 * 1024 * 1024;

export interface WorkspaceLoadResult {
  state: AppState;
  recovered: boolean;
  message: string;
}

export interface WorkspaceSnapshot {
  state: AppState;
  workLogs: WorkLog[];
  attachments: AttachmentMeta[];
  attachmentBlobs: Map<string, Blob>;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export type WorkLogInput = Omit<WorkLog, "id" | "createdAt" | "updatedAt">;

export type WorkspaceConflictTarget =
  | { kind: "description"; taskId: string }
  | { kind: "worklog"; taskId: string; workDate: string }
  | { kind: "attachment"; taskId: string; attachmentId: string; name: string };

export class WorkspaceConflictError extends Error {
  override readonly name = "WorkspaceConflictError";

  constructor(message: string, readonly target: WorkspaceConflictTarget) {
    super(message);
  }
}

export interface WorkspaceBackend {
  readonly available: boolean;
  readonly errorMessage: string;

  loadWorkspace(): Promise<WorkspaceLoadResult>;
  saveWorkspaceIndex(state: AppState): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  restoreTask(task: Task): Promise<void>;
  saveDescription(taskId: string, descriptionMarkdown: string): Promise<void>;

  getWorkLog(taskId: string, workDate: string): Promise<WorkLog | null>;
  listWorkLogs(taskId: string): Promise<WorkLog[]>;
  saveWorkLog(input: WorkLogInput, now?: number): Promise<WorkLog>;
  deleteWorkLog(id: string): Promise<void>;
  restoreWorkLog(record: WorkLog): Promise<void>;

  listAttachments(taskId: string): Promise<AttachmentMeta[]>;
  putAttachment(taskId: string, file: File, now?: number): Promise<AttachmentMeta>;
  readAttachment(id: string): Promise<Blob | null>;
  saveAttachment(id: string, content: Blob): Promise<void>;
  renameAttachment(id: string, name: string): Promise<void>;
  deleteAttachment(id: string): Promise<void>;
  saveConflictCopy(target: WorkspaceConflictTarget, content: Blob): Promise<string>;
  estimateStorage(): Promise<StorageEstimate>;

  exportSnapshot(): Promise<WorkspaceSnapshot>;
  importSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

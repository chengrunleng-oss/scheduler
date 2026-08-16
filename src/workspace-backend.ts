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
  metadata?: WorkspaceSnapshotMetadata;
}

export type SnapshotEntityType = "task" | "folder" | "worklog" | "attachment";

export interface EntityRevisionMetadata {
  revisionId: string;
  parentRevisionId: string | null;
  createdAt: number;
  updatedAt: number;
  contentHash: string;
}

export interface DeletionTombstone {
  deletionId: string;
  entityType: SnapshotEntityType;
  entityId: string;
  deletedAt: number;
}

export interface SnapshotContentSummary {
  tasks: number;
  folders: number;
  workLogs: number;
  attachments: number;
  attachmentBytes: number;
}

export interface WorkspaceSnapshotMetadata {
  schemaVersion: 6;
  workspaceId: string;
  snapshotId: string;
  parentSnapshotId: string | null;
  exportedAt: string;
  contentSummary: SnapshotContentSummary;
  entityRevisions: Record<string, EntityRevisionMetadata>;
  tombstones: DeletionTombstone[];
}

export interface ImportRecoveryPoint {
  createdAt: string;
  backup: Blob;
  report: Record<string, unknown>;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export type WorkLogInput = Omit<WorkLog, "id" | "createdAt" | "updatedAt"> & { id?: string | undefined };

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

  getWorkLog(taskId: string, workDate: string, recordId?: string): Promise<WorkLog | null>;
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
  // TEST-V08-020：可选能力，用系统文件选择器定位到任务目录（纯 Web 无法直接呼出资源管理器）。
  // 返回是否成功打开；权限不可用或后端不支持时返回 false（IndexedDB 与不可用后端没有真实目录）。
  revealTaskDirectory?(taskId: string): Promise<boolean>;

  exportSnapshot(): Promise<WorkspaceSnapshot>;
  importSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
  saveImportRecovery?(recovery: ImportRecoveryPoint): Promise<void>;
  loadImportRecovery?(): Promise<ImportRecoveryPoint | null>;
  clear(): Promise<void>;
  close(): void;
}

import { createEmptyState } from "./domain.js";
import type { AppState, AttachmentMeta, Task, WorkLog } from "./types.js";
import type { StorageEstimate, WorkspaceBackend, WorkspaceConflictTarget, WorkspaceLoadResult, WorkspaceSnapshot, WorkLogInput } from "./workspace-backend.js";

export class UnavailableWorkspaceBackend implements WorkspaceBackend {
  readonly available = false;

  constructor(readonly errorMessage = "请先选择一个本地工作区目录。") {}

  async loadWorkspace(): Promise<WorkspaceLoadResult> {
    return { state: createEmptyState(), recovered: false, message: this.errorMessage };
  }

  async saveWorkspaceIndex(_state: AppState): Promise<void> { this.fail(); }
  async saveTask(_task: Task): Promise<void> { this.fail(); }
  async deleteTask(_taskId: string): Promise<void> { this.fail(); }
  async restoreTask(_task: Task): Promise<void> { this.fail(); }
  async saveDescription(_taskId: string, _descriptionMarkdown: string): Promise<void> { this.fail(); }
  async getWorkLog(_taskId: string, _workDate: string): Promise<WorkLog | null> { this.fail(); }
  async listWorkLogs(_taskId: string): Promise<WorkLog[]> { this.fail(); }
  async saveWorkLog(_input: WorkLogInput, _now?: number): Promise<WorkLog> { this.fail(); }
  async changeWorkLogDate(_id: string, _workDate: string, _now?: number): Promise<WorkLog> { this.fail(); }
  async deleteWorkLog(_id: string): Promise<void> { this.fail(); }
  async restoreWorkLog(_record: WorkLog): Promise<void> { this.fail(); }
  async listAttachments(_taskId: string): Promise<AttachmentMeta[]> { this.fail(); }
  async putAttachment(_taskId: string, _file: File, _now?: number): Promise<AttachmentMeta> { this.fail(); }
  async readAttachment(_id: string): Promise<Blob | null> { this.fail(); }
  async saveAttachment(_id: string, _content: Blob): Promise<void> { this.fail(); }
  async renameAttachment(_id: string, _name: string): Promise<void> { this.fail(); }
  async deleteAttachment(_id: string): Promise<void> { this.fail(); }
  async saveConflictCopy(_target: WorkspaceConflictTarget, _content: Blob): Promise<string> { this.fail(); }
  async estimateStorage(): Promise<StorageEstimate> { this.fail(); }
  async exportSnapshot(): Promise<WorkspaceSnapshot> {
    return { state: createEmptyState(), workLogs: [], attachments: [], attachmentBlobs: new Map() };
  }
  async importSnapshot(_snapshot: WorkspaceSnapshot): Promise<void> { this.fail(); }
  async clear(): Promise<void> { this.fail(); }
  close(): void {}

  private fail(): never {
    throw new Error(this.errorMessage);
  }
}

import { createEmptyState, createId, getFolderDepth, hydrateState, normalizeDate } from "./domain.js";
import type { AppState, AttachmentMeta, Folder, Preferences, Task, WorkLog } from "./types.js";
import {
  MAX_ATTACHMENT_BYTES,
  type StorageEstimate,
  type DeletionTombstone,
  type EntityRevisionMetadata,
  type ImportRecoveryPoint,
  type WorkspaceBackend,
  WorkspaceConflictError,
  type WorkspaceConflictTarget,
  type WorkspaceLoadResult,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotMetadata,
  type WorkLogInput,
} from "./workspace-backend.js";
import { detectAttachmentKind } from "./workspace-db.js";

const WORKSPACE_FILE = "workspace.json";
const TASKS_DIRECTORY = "tasks";
const TRASH_DIRECTORY = "trash";
const TASK_FILE = "task.json";
const DESCRIPTION_FILE = "description.md";
const WORKLOGS_DIRECTORY = "worklogs";
const ATTACHMENTS_DIRECTORY = "attachments";
const MIGRATION_MARKER = ".task-workbench-migration.json";
const IMPORT_RECOVERY_DIRECTORY = ".task-workbench-import";
const IMPORT_RECOVERY_FILE = "latest-before-import.zip";
const IMPORT_REPORT_FILE = "latest-report.json";

type PermissionMode = "read" | "readwrite";

export interface WorkspaceDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?(descriptor?: { mode?: PermissionMode }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: PermissionMode }): Promise<PermissionState>;
}

interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface WorkspaceIndexFile {
  format: "task-workbench-workspace";
  schemaVersion: 5;
  revision: number;
  updatedAt: number;
  preferences: Preferences;
  folders: Folder[];
  taskIds: string[];
  workspaceId?: string;
  snapshotId?: string;
  parentSnapshotId?: string | null;
  entityRevisions?: Record<string, EntityRevisionMetadata>;
  tombstones?: DeletionTombstone[];
}

interface TaskFile {
  format: "task-workbench-task";
  schemaVersion: 1 | 2;
  revision: number;
  updatedAt: number;
  task: Omit<Task, "descriptionMarkdown">;
  workLogs: Array<Omit<WorkLog, "contentMarkdown">>;
  attachments: AttachmentMeta[];
  contentHashes?: {
    description?: string;
    workLogs: Record<string, string>;
    attachments: Record<string, string>;
  };
}

interface ImportRecoveryIndex {
  format: "task-workbench-import-recovery";
  schemaVersion: 1;
  createdAt: string;
  report: Record<string, unknown>;
}

export class LocalDirectoryBackend implements WorkspaceBackend {
  readonly available = true;
  readonly errorMessage = "";
  private lastRevision: number | null = null;
  private readonly taskRevisions = new Map<string, number>();
  private readonly expectedContentHashes = new Map<string, string>();
  private writeQueue = Promise.resolve();
  private readonly changes: BroadcastChannel | null;

  constructor(readonly root: WorkspaceDirectoryHandle) {
    this.changes = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`task-workbench:${root.name}`);
    if (this.changes) {
      this.changes.onmessage = () => window.dispatchEvent(new CustomEvent("workspace-external-change", { detail: { name: this.root.name } }));
    }
  }

  static supported(): boolean {
    return "showDirectoryPicker" in globalThis;
  }

  get workspaceName(): string {
    return this.root.name;
  }

  async ensurePermission(request = false): Promise<boolean> {
    if (!this.root.queryPermission) return true;
    const current = await this.root.queryPermission({ mode: "readwrite" });
    if (current === "granted") return true;
    if (!request || !this.root.requestPermission) return false;
    return await this.root.requestPermission({ mode: "readwrite" }) === "granted";
  }

  async loadWorkspace(): Promise<WorkspaceLoadResult> {
    await this.assertPermission();
    if (await readTextIfExists(this.root, MIGRATION_MARKER) !== null) {
      throw new Error("本地工作区存在未完成的迁移，已阻止打开以避免读取不完整数据。");
    }
    const index = await readJsonIfExists<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
    if (!index) {
      if (await directoryHasEntries(this.root)) {
        throw new Error("本地工作区缺少 workspace.json，已阻止写入；请恢复索引或改选正确目录。");
      }
      this.lastRevision = null;
      this.taskRevisions.clear();
      this.expectedContentHashes.clear();
      return { state: createEmptyState(), recovered: false, message: "当前目录尚未初始化为任务工作区。" };
    }
    validateWorkspaceIndex(index);
    this.taskRevisions.clear();
    this.expectedContentHashes.clear();
    const tasksDirectory = await this.root.getDirectoryHandle(TASKS_DIRECTORY);
    const tasks: Task[] = [];
    for (const taskId of index.taskIds) {
      const taskDirectory = await tasksDirectory.getDirectoryHandle(safeId(taskId));
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      validateTaskFile(taskFile, taskId);
      this.taskRevisions.set(taskId, taskFile.revision);
      ensureContentHashes(taskFile);
      const worklogsDirectory = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
      for (const worklog of taskFile.workLogs) {
        const markdown = await readTextIfExists(worklogsDirectory, workLogFileName(worklog)) ?? "";
        this.expectedContentHashes.set(workLogHashKey(taskId, worklog.id), await hashText(markdown));
      }
      const attachmentsDirectory = await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
      for (const attachment of taskFile.attachments) {
        try {
          const blob = await (await attachmentsDirectory.getFileHandle(attachmentFileName(attachment))).getFile();
          this.expectedContentHashes.set(attachmentHashKey(attachment.id), await hashBlob(blob));
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
      }
      const descriptionMarkdown = await readTextIfExists(taskDirectory, DESCRIPTION_FILE) ?? "";
      this.expectedContentHashes.set(descriptionHashKey(taskId), await hashText(descriptionMarkdown));
      tasks.push({ ...taskFile.task, descriptionMarkdown });
    }
    const state = hydrateState({
      schemaVersion: 5,
      preferences: index.preferences,
      folders: index.folders,
      tasks,
    });
    this.lastRevision = index.revision;
    return { state, recovered: true, message: `已打开本地工作区“${this.root.name}”。` };
  }

  async saveWorkspaceIndex(state: AppState): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.assertPermission();
      const current = await readJsonIfExists<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
      if (!current && await directoryHasEntries(this.root)) {
        throw new Error("本地工作区缺少 workspace.json，已阻止写入；请恢复索引或改选正确目录。");
      }
      this.assertRevision(current?.revision ?? null);
      const tasksDirectory = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
      await this.root.getDirectoryHandle(TRASH_DIRECTORY, { create: true });
      const previousIds = new Set(current?.taskIds ?? []);
      const nextIds = new Set(state.tasks.map((task) => task.id));

      for (const task of state.tasks) {
        if (!(await directoryExists(tasksDirectory, safeId(task.id)))) {
          await this.restoreTaskDirectoryFromTrash(task.id, tasksDirectory);
        }
        await this.writeTaskRecord(tasksDirectory, task);
        previousIds.delete(task.id);
      }
      for (const removedId of previousIds) {
        if (!nextIds.has(removedId)) await this.moveTaskDirectoryToTrash(removedId);
      }

      const revision = (current?.revision ?? 0) + 1;
      const updatedAt = Date.now();
      const snapshotId = crypto.randomUUID();
      const entityRevisions = await updateStateRevisions(state, current?.entityRevisions ?? {});
      const tombstones = updateTombstones(current, state, updatedAt);
      const index: WorkspaceIndexFile = {
        format: "task-workbench-workspace",
        schemaVersion: 5,
        revision,
        updatedAt,
        preferences: state.preferences,
        folders: state.folders,
        taskIds: state.tasks.map((task) => task.id),
        workspaceId: current?.workspaceId ?? crypto.randomUUID(),
        snapshotId,
        parentSnapshotId: current?.snapshotId ?? null,
        entityRevisions,
        tombstones,
      };
      await writeVerifiedText(this.root, WORKSPACE_FILE, JSON.stringify(index, null, 2));
      this.lastRevision = revision;
    });
  }

  async saveTask(task: Task): Promise<void> {
    const state = (await this.loadWorkspace()).state;
    const exists = state.tasks.some((item) => item.id === task.id);
    const tasks = exists ? state.tasks.map((item) => item.id === task.id ? task : item) : [...state.tasks, task];
    await this.saveWorkspaceIndex({ ...state, tasks });
  }

  async deleteTask(taskId: string): Promise<void> {
    const state = (await this.loadWorkspace()).state;
    await this.saveWorkspaceIndex({ ...state, tasks: state.tasks.filter((task) => task.id !== taskId) });
  }

  async restoreTask(task: Task): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.assertPermission();
      const tasks = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
      await this.restoreTaskDirectoryFromTrash(task.id, tasks);
    });
    const state = (await this.loadWorkspace()).state;
    const existing = state.tasks.some((item) => item.id === task.id);
    await this.saveWorkspaceIndex({ ...state, tasks: existing ? state.tasks.map((item) => item.id === task.id ? task : item) : [...state.tasks, task] });
  }

  async saveDescription(taskId: string, descriptionMarkdown: string): Promise<void> {
    return this.enqueueWrite(async () => {
      const taskDirectory = await this.getTaskDirectory(taskId);
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      this.assertTaskRevision(taskFile);
      const key = descriptionHashKey(taskId);
      await this.assertTextContentUnchanged(
        taskDirectory,
        DESCRIPTION_FILE,
        key,
        taskFile.contentHashes?.description,
        { kind: "description", taskId },
      );
      const normalized = normalizeMarkdown(descriptionMarkdown);
      await writeVerifiedText(taskDirectory, DESCRIPTION_FILE, normalized);
      ensureContentHashes(taskFile).description = await hashText(normalized);
      this.expectedContentHashes.set(key, ensureContentHashes(taskFile).description!);
      await this.writeTaskFile(taskDirectory, taskFile);
    });
  }

  async getWorkLog(taskId: string, workDate: string, recordId?: string): Promise<WorkLog | null> {
    const date = normalizeDate(workDate);
    if (!date) return null;
    const taskDirectory = await this.getTaskDirectory(taskId);
    const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
    const meta = recordId
      ? taskFile.workLogs.find((item) => item.id === recordId)
      : taskFile.workLogs.find((item) => item.id === workLogId(taskId, date)) ?? taskFile.workLogs.find((item) => item.workDate === date);
    if (!meta) return null;
    const worklogs = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
    const markdown = await readTextIfExists(worklogs, workLogFileName(meta));
    if (markdown === null) return null;
    this.expectedContentHashes.set(workLogHashKey(taskId, meta.id), await hashText(markdown));
    return parseWorkLog(markdown, meta);
  }

  async listWorkLogs(taskId: string): Promise<WorkLog[]> {
    const taskDirectory = await this.getTaskDirectory(taskId);
    const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
    const records = await Promise.all(taskFile.workLogs.map((meta) => this.getWorkLog(taskId, meta.workDate, meta.id)));
    return records.filter((record): record is WorkLog => Boolean(record)).sort((a, b) => b.workDate.localeCompare(a.workDate) || b.updatedAt - a.updatedAt);
  }

  async saveWorkLog(input: WorkLogInput, now = Date.now()): Promise<WorkLog> {
    const workDate = normalizeDate(input.workDate);
    if (!workDate) throw new Error("工作日期无效。");
    return this.enqueueWrite(async () => {
      const taskDirectory = await this.getTaskDirectory(input.taskId);
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      const recordId = input.id ?? workLogId(input.taskId, workDate);
      const existing = taskFile.workLogs.find((item) => item.id === recordId);
      const record: WorkLog = {
        id: recordId,
        taskId: input.taskId,
        workDate,
        contentMarkdown: normalizeMarkdown(input.contentMarkdown),
        progressPercent: input.progressPercent === null ? null : Math.max(0, Math.min(100, Math.round(input.progressPercent))),
        conflictOrigin: input.conflictOrigin,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.assertTaskRevision(taskFile);
      const worklogs = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
      const key = workLogHashKey(input.taskId, record.id);
      const hashes = ensureContentHashes(taskFile);
      await this.assertTextContentUnchanged(
        worklogs,
        workLogFileName(record),
        key,
        hashes.workLogs[record.id] ?? hashes.workLogs[workDate],
        { kind: "worklog", taskId: input.taskId, workDate },
      );
      const serialized = serializeWorkLog(record);
      await writeVerifiedText(worklogs, workLogFileName(record), serialized);
      hashes.workLogs[record.id] = await hashText(serialized);
      this.expectedContentHashes.set(key, hashes.workLogs[record.id]!);
      taskFile.workLogs = [...taskFile.workLogs.filter((item) => item.id !== record.id), workLogMeta(record)];
      await this.writeTaskFile(taskDirectory, taskFile);
      return record;
    });
  }

  async deleteWorkLog(id: string): Promise<void> {
    const located = await this.findWorkLog(id);
    if (!located) return;
    const { taskId, workDate } = located.meta;
    const taskDirectory = await this.getTaskDirectory(taskId);
    await this.enqueueWrite(async () => {
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      this.assertTaskRevision(taskFile);
      const worklogs = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
      const key = workLogHashKey(taskId, id);
      await this.assertTextContentUnchanged(
        worklogs,
        workLogFileName(located.meta),
        key,
        taskFile.contentHashes?.workLogs[id] ?? taskFile.contentHashes?.workLogs[workDate],
        { kind: "worklog", taskId, workDate },
      );
      await removeIfExists(worklogs, workLogFileName(located.meta));
      delete ensureContentHashes(taskFile).workLogs[id];
      if (id === workLogId(taskId, workDate)) delete ensureContentHashes(taskFile).workLogs[workDate];
      this.expectedContentHashes.delete(key);
      taskFile.workLogs = taskFile.workLogs.filter((item) => item.id !== id);
      await this.writeTaskFile(taskDirectory, taskFile);
      await this.updateDeletionTombstone("worklog", id, true);
    });
  }

  async restoreWorkLog(record: WorkLog): Promise<void> {
    const taskDirectory = await this.getTaskDirectory(record.taskId);
    await this.enqueueWrite(async () => {
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      this.assertTaskRevision(taskFile);
      const worklogs = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
      const key = workLogHashKey(record.taskId, record.id);
      const hashes = ensureContentHashes(taskFile);
      await this.assertTextContentUnchanged(
        worklogs,
        workLogFileName(record),
        key,
        hashes.workLogs[record.id] ?? hashes.workLogs[record.workDate],
        { kind: "worklog", taskId: record.taskId, workDate: record.workDate },
      );
      const serialized = serializeWorkLog(record);
      await writeVerifiedText(worklogs, workLogFileName(record), serialized);
      hashes.workLogs[record.id] = await hashText(serialized);
      this.expectedContentHashes.set(key, hashes.workLogs[record.id]!);
      taskFile.workLogs = [...taskFile.workLogs.filter((item) => item.id !== record.id), workLogMeta(record)];
      await this.writeTaskFile(taskDirectory, taskFile);
      await this.updateDeletionTombstone("worklog", record.id, false);
    });
  }

  async listAttachments(taskId: string): Promise<AttachmentMeta[]> {
    const taskDirectory = await this.getTaskDirectory(taskId);
    const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
    return [...taskFile.attachments].sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
  }

  async putAttachment(taskId: string, file: File, now = Date.now()): Promise<AttachmentMeta> {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("单个附件不能超过 20 MB。");
    const taskDirectory = await this.getTaskDirectory(taskId);
    const id = createId("attachment", now);
    const meta: AttachmentMeta = {
      id,
      taskId,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified || now,
      kind: detectAttachmentKind(file.name, file.type),
      createdAt: now,
    };
    await this.enqueueWrite(async () => {
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      this.assertTaskRevision(taskFile);
      const attachments = await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
      await writeVerifiedBlob(attachments, attachmentFileName(meta), file);
      const hash = await hashBlob(file);
      meta.contentHash = hash;
      ensureContentHashes(taskFile).attachments[meta.id] = hash;
      this.expectedContentHashes.set(attachmentHashKey(meta.id), hash);
      taskFile.attachments = [...taskFile.attachments, meta];
      await this.writeTaskFile(taskDirectory, taskFile);
    });
    return meta;
  }

  async readAttachment(id: string): Promise<Blob | null> {
    const located = await this.findAttachment(id);
    if (!located) return null;
    const attachments = await located.taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
    try {
      const blob = await (await attachments.getFileHandle(attachmentFileName(located.meta))).getFile();
      this.expectedContentHashes.set(attachmentHashKey(id), await hashBlob(blob));
      return blob;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async saveAttachment(id: string, content: Blob): Promise<void> {
    if (content.size > MAX_ATTACHMENT_BYTES) throw new Error("单个附件不能超过 20 MB。");
    const located = await this.findAttachment(id);
    if (!located) throw new Error("找不到要保存的附件。");
    await this.enqueueWrite(async () => {
      this.assertTaskRevision(located.taskFile);
      const attachments = await located.taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
      await this.assertAttachmentUnchanged(attachments, located.meta, located.taskFile);
      await writeVerifiedBlob(attachments, attachmentFileName(located.meta), content);
      const hash = await hashBlob(content);
      const nextMeta = { ...located.meta, size: content.size, type: content.type || located.meta.type, contentHash: hash };
      ensureContentHashes(located.taskFile).attachments[id] = hash;
      this.expectedContentHashes.set(attachmentHashKey(id), hash);
      located.taskFile.attachments = located.taskFile.attachments.map((item) => item.id === id ? nextMeta : item);
      await this.writeTaskFile(located.taskDirectory, located.taskFile);
    });
  }

  async renameAttachment(id: string, name: string): Promise<void> {
    const normalized = name.trim();
    if (!normalized) throw new Error("附件名称不能为空。");
    const located = await this.findAttachment(id);
    if (!located) throw new Error("找不到要重命名的附件。");
    await this.enqueueWrite(async () => {
      const attachments = await located.taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
      const sourceName = attachmentFileName(located.meta);
      this.assertTaskRevision(located.taskFile);
      await this.assertAttachmentUnchanged(attachments, located.meta, located.taskFile);
      const blob = await (await attachments.getFileHandle(sourceName)).getFile();
      const nextMeta = { ...located.meta, name: normalized, kind: detectAttachmentKind(normalized, located.meta.type) };
      await writeVerifiedBlob(attachments, attachmentFileName(nextMeta), blob);
      if (sourceName !== attachmentFileName(nextMeta)) await removeIfExists(attachments, sourceName);
      located.taskFile.attachments = located.taskFile.attachments.map((item) => item.id === id ? nextMeta : item);
      await this.writeTaskFile(located.taskDirectory, located.taskFile);
    });
  }

  async deleteAttachment(id: string): Promise<void> {
    const located = await this.findAttachment(id);
    if (!located) return;
    await this.enqueueWrite(async () => {
      const attachments = await located.taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
      this.assertTaskRevision(located.taskFile);
      await this.assertAttachmentUnchanged(attachments, located.meta, located.taskFile);
      await removeIfExists(attachments, attachmentFileName(located.meta));
      delete ensureContentHashes(located.taskFile).attachments[id];
      this.expectedContentHashes.delete(attachmentHashKey(id));
      located.taskFile.attachments = located.taskFile.attachments.filter((item) => item.id !== id);
      await this.writeTaskFile(located.taskDirectory, located.taskFile);
      await this.updateDeletionTombstone("attachment", id, true);
    });
  }

  async saveConflictCopy(target: WorkspaceConflictTarget, content: Blob): Promise<string> {
    if (content.size > MAX_ATTACHMENT_BYTES) throw new Error("冲突副本不能超过 20 MB。");
    return this.enqueueWrite(async () => {
      const taskDirectory = await this.getTaskDirectory(target.taskId);
      const stamp = conflictTimestamp();
      if (target.kind === "description") {
        const name = `description.conflict-${stamp}.md`;
        await writeVerifiedBlob(taskDirectory, name, content);
        return name;
      }
      if (target.kind === "worklog") {
        const worklogs = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
        const name = `${target.workDate}.conflict-${stamp}.md`;
        await writeVerifiedBlob(worklogs, name, content);
        return `${WORKLOGS_DIRECTORY}/${name}`;
      }
      const attachments = await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
      const name = conflictAttachmentName(target.name, stamp);
      await writeVerifiedBlob(attachments, name, content);
      return `${ATTACHMENTS_DIRECTORY}/${name}`;
    });
  }

  async estimateStorage(): Promise<StorageEstimate> {
    const snapshot = await this.exportSnapshot();
    const usage = snapshot.attachments.reduce((total, item) => total + item.size, 0);
    return { usage, quota: 0 };
  }

  async saveImportRecovery(recovery: ImportRecoveryPoint): Promise<void> {
    await this.enqueueWrite(async () => {
      const directory = await this.root.getDirectoryHandle(IMPORT_RECOVERY_DIRECTORY, { create: true });
      await writeVerifiedBlob(directory, IMPORT_RECOVERY_FILE, recovery.backup);
      const index: ImportRecoveryIndex = {
        format: "task-workbench-import-recovery",
        schemaVersion: 1,
        createdAt: recovery.createdAt,
        report: recovery.report,
      };
      await writeVerifiedText(directory, IMPORT_REPORT_FILE, JSON.stringify(index, null, 2));
    });
  }

  async loadImportRecovery(): Promise<ImportRecoveryPoint | null> {
    let directory: FileSystemDirectoryHandle;
    try { directory = await this.root.getDirectoryHandle(IMPORT_RECOVERY_DIRECTORY); }
    catch (error) { if (isNotFound(error)) return null; throw error; }
    const index = await readJsonIfExists<ImportRecoveryIndex>(directory, IMPORT_REPORT_FILE);
    const backup = await readBlobIfExists(directory, IMPORT_RECOVERY_FILE);
    if (!index || !backup || index.format !== "task-workbench-import-recovery" || index.schemaVersion !== 1 || typeof index.createdAt !== "string" || !index.report || typeof index.report !== "object" || Array.isArray(index.report)) return null;
    return { createdAt: index.createdAt, backup, report: index.report };
  }

  async exportSnapshot(): Promise<WorkspaceSnapshot> {
    const state = (await this.loadWorkspace()).state;
    const index = await readJsonIfExists<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
    const workLogs = (await Promise.all(state.tasks.map((task) => this.listWorkLogs(task.id)))).flat();
    const attachments = (await Promise.all(state.tasks.map((task) => this.listAttachments(task.id)))).flat();
    const attachmentBlobs = new Map<string, Blob>();
    for (const meta of attachments) {
      const blob = await this.readAttachment(meta.id);
      if (blob) {
        attachmentBlobs.set(meta.id, new Blob([await blob.arrayBuffer()], { type: blob.type }));
        meta.contentHash = await hashBlob(blob);
      }
    }
    const snapshot: WorkspaceSnapshot = { state, workLogs, attachments, attachmentBlobs };
    if (index) snapshot.metadata = snapshotMetadata(index, state, workLogs, attachments);
    return snapshot;
  }

  async importSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    validateSnapshot(snapshot);
    let previous: WorkspaceSnapshot | null = null;
    const existing = await readJsonIfExists<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
    if (existing) previous = await this.exportSnapshot();
    await writeVerifiedText(this.root, MIGRATION_MARKER, JSON.stringify({ startedAt: Date.now(), hadPreviousWorkspace: Boolean(previous) }));
    try {
      await this.replaceSnapshot(snapshot);
      await removeIfExists(this.root, MIGRATION_MARKER);
    } catch (error) {
      if (previous) {
        try {
          await this.replaceSnapshot(previous);
          await removeIfExists(this.root, MIGRATION_MARKER);
        }
        catch (rollbackError) {
          throw new Error(`快照导入失败且回滚未完成：${errorMessage(error)}；回滚：${errorMessage(rollbackError)}`);
        }
      } else {
        try {
          await this.cleanupWorkspaceContent();
          await removeIfExists(this.root, MIGRATION_MARKER);
        } catch (cleanupError) {
          throw new Error(`快照导入失败且临时内容未能清理：${errorMessage(error)}；清理：${errorMessage(cleanupError)}`);
        }
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    const state = (await this.loadWorkspace()).state;
    await this.enqueueWrite(async () => {
      for (const task of state.tasks) {
        const taskDirectory = await this.getTaskDirectory(task.id);
        const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
        this.assertTaskRevision(taskFile);
        await removeIfExists(taskDirectory, WORKLOGS_DIRECTORY, true);
        await removeIfExists(taskDirectory, ATTACHMENTS_DIRECTORY, true);
        await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
        await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
        taskFile.workLogs = [];
        taskFile.attachments = [];
        const descriptionHash = taskFile.contentHashes?.description;
        taskFile.contentHashes = { workLogs: {}, attachments: {} };
        if (descriptionHash) taskFile.contentHashes.description = descriptionHash;
        await this.writeTaskFile(taskDirectory, taskFile);
      }
    });
  }

  close(): void {
    this.changes?.close();
  }

  private async replaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    let stage = "清理旧目录";
    try {
      await this.cleanupWorkspaceContent();
      stage = "写入任务资料";
      const tasksDirectory = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
      await this.root.getDirectoryHandle(TRASH_DIRECTORY, { create: true });
      for (const task of snapshot.state.tasks) await this.writeTaskRecord(tasksDirectory, task);
      for (const record of snapshot.workLogs) {
        stage = `恢复工作记录 ${record.id}`;
        await this.restoreWorkLog(record);
      }
      for (const meta of snapshot.attachments) {
        stage = `恢复附件 ${meta.id}`;
        const blob = snapshot.attachmentBlobs.get(meta.id);
        if (!blob) continue;
        const taskDirectory = await this.getTaskDirectory(meta.taskId);
        await this.enqueueWrite(async () => {
          const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
          const attachments = await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
          await writeVerifiedBlob(attachments, attachmentFileName(meta), blob);
          const hash = await hashBlob(blob);
          ensureContentHashes(taskFile).attachments[meta.id] = hash;
          this.expectedContentHashes.set(attachmentHashKey(meta.id), hash);
          taskFile.attachments = [...taskFile.attachments.filter((item) => item.id !== meta.id), meta];
          await this.writeTaskFile(taskDirectory, taskFile);
        });
      }
      stage = "校验迁移内容";
      await this.verifySnapshotContent(snapshot);
      stage = "发布工作区索引";
      const index: WorkspaceIndexFile = {
        format: "task-workbench-workspace",
        schemaVersion: 5,
        revision: 1,
        updatedAt: Date.now(),
        preferences: snapshot.state.preferences,
        folders: snapshot.state.folders,
        taskIds: snapshot.state.tasks.map((task) => task.id),
        workspaceId: snapshot.metadata?.workspaceId ?? crypto.randomUUID(),
        snapshotId: snapshot.metadata?.snapshotId ?? crypto.randomUUID(),
        parentSnapshotId: snapshot.metadata?.parentSnapshotId ?? null,
        entityRevisions: snapshot.metadata?.entityRevisions ?? {},
        tombstones: snapshot.metadata?.tombstones ?? [],
      };
      await writeVerifiedText(this.root, WORKSPACE_FILE, JSON.stringify(index, null, 2));
      this.lastRevision = index.revision;
    } catch (error) {
      throw new Error(`${stage}失败：${errorMessage(error)}`);
    }
  }

  private async writeTaskRecord(tasksDirectory: FileSystemDirectoryHandle, task: Task): Promise<void> {
    const taskDirectory = await tasksDirectory.getDirectoryHandle(safeId(task.id), { create: true });
    const existing = await readJsonIfExists<TaskFile>(taskDirectory, TASK_FILE);
    const { descriptionMarkdown, ...taskMeta } = task;
    if (existing) {
      this.assertTaskRevision(existing);
      const currentDescription = await readTextIfExists(taskDirectory, DESCRIPTION_FILE) ?? "";
      await this.assertTextContentUnchanged(
        taskDirectory,
        DESCRIPTION_FILE,
        descriptionHashKey(task.id),
        existing.contentHashes?.description,
        { kind: "description", taskId: task.id },
      );
      if (JSON.stringify(existing.task) === JSON.stringify(taskMeta) && currentDescription === normalizeMarkdown(descriptionMarkdown)) {
        this.taskRevisions.set(task.id, existing.revision);
        await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
        await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
        return;
      }
    }
    const taskFile: TaskFile = {
      format: "task-workbench-task",
      schemaVersion: 2,
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: Date.now(),
      task: taskMeta,
      workLogs: existing?.workLogs ?? [],
      attachments: existing?.attachments ?? [],
      contentHashes: ensureContentHashes(existing),
    };
    const normalizedDescription = normalizeMarkdown(descriptionMarkdown);
    await writeVerifiedText(taskDirectory, DESCRIPTION_FILE, normalizedDescription);
    ensureContentHashes(taskFile).description = await hashText(normalizedDescription);
    this.expectedContentHashes.set(descriptionHashKey(task.id), ensureContentHashes(taskFile).description!);
    await writeVerifiedText(taskDirectory, TASK_FILE, JSON.stringify(taskFile, null, 2));
    this.taskRevisions.set(task.id, taskFile.revision);
    await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY, { create: true });
    await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY, { create: true });
  }

  private async writeTaskFile(taskDirectory: FileSystemDirectoryHandle, taskFile: TaskFile): Promise<void> {
    this.assertTaskRevision(taskFile);
    taskFile.schemaVersion = 2;
    taskFile.revision += 1;
    taskFile.updatedAt = Date.now();
    await writeVerifiedText(taskDirectory, TASK_FILE, JSON.stringify(taskFile, null, 2));
    this.taskRevisions.set(taskFile.task.id, taskFile.revision);
  }

  private async updateDeletionTombstone(entityType: "worklog" | "attachment", entityId: string, deleted: boolean): Promise<void> {
    const index = await readJsonIfExists<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
    if (!index) return;
    const existing = index.tombstones ?? [];
    const retained = existing.filter((item) => item.entityType !== entityType || item.entityId !== entityId);
    if (!deleted && retained.length === existing.length) return;
    if (deleted) retained.push({ deletionId: crypto.randomUUID(), entityType, entityId, deletedAt: Date.now() });
    this.assertRevision(index.revision);
    index.tombstones = retained;
    if (index.entityRevisions) delete index.entityRevisions[`${entityType}:${entityId}`];
    index.parentSnapshotId = index.snapshotId ?? null;
    index.snapshotId = crypto.randomUUID();
    index.revision += 1;
    index.updatedAt = Date.now();
    await writeVerifiedText(this.root, WORKSPACE_FILE, JSON.stringify(index, null, 2));
    this.lastRevision = index.revision;
  }

  private async getTaskDirectory(taskId: string): Promise<FileSystemDirectoryHandle> {
    await this.assertPermission();
    const tasks = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
    return tasks.getDirectoryHandle(safeId(taskId));
  }

  // TEST-V08-020：用系统文件选择器定位到任务目录；权限不可用或浏览器不支持时返回 false。
  async revealTaskDirectory(taskId: string): Promise<boolean> {
    if (!(await this.ensurePermission(true))) return false;
    const picker = (window as typeof window & {
      showOpenFilePicker(options?: { multiple?: boolean; startIn?: FileSystemDirectoryHandle }): Promise<FileSystemFileHandle[]>;
    }).showOpenFilePicker;
    if (typeof picker !== "function") return false;
    const handle = await this.getTaskDirectory(taskId);
    await picker.call(window, { multiple: true, startIn: handle });
    return true;
  }

  private async findWorkLog(id: string): Promise<{ meta: Omit<WorkLog, "contentMarkdown">; taskDirectory: FileSystemDirectoryHandle } | null> {
    const index = await readRequiredJson<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
    const tasks = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
    for (const taskId of index.taskIds) {
      const taskDirectory = await tasks.getDirectoryHandle(safeId(taskId));
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      const meta = taskFile.workLogs.find((item) => item.id === id);
      if (meta) return { meta, taskDirectory };
    }
    return null;
  }

  private async findAttachment(id: string): Promise<{ meta: AttachmentMeta; taskFile: TaskFile; taskDirectory: FileSystemDirectoryHandle } | null> {
    const index = await readRequiredJson<WorkspaceIndexFile>(this.root, WORKSPACE_FILE);
    const tasks = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
    for (const taskId of index.taskIds) {
      const taskDirectory = await tasks.getDirectoryHandle(safeId(taskId));
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      const meta = taskFile.attachments.find((item) => item.id === id);
      if (meta) return { meta, taskFile, taskDirectory };
    }
    return null;
  }

  private async moveTaskDirectoryToTrash(taskId: string): Promise<void> {
    const tasks = await this.root.getDirectoryHandle(TASKS_DIRECTORY, { create: true });
    if (!(await directoryExists(tasks, safeId(taskId)))) return;
    const trash = await this.root.getDirectoryHandle(TRASH_DIRECTORY, { create: true });
    await removeIfExists(trash, safeId(taskId), true);
    const source = await tasks.getDirectoryHandle(safeId(taskId));
    const target = await trash.getDirectoryHandle(safeId(taskId), { create: true });
    await copyDirectory(source, target);
    await tasks.removeEntry(safeId(taskId), { recursive: true });
  }

  private async restoreTaskDirectoryFromTrash(taskId: string, tasks: FileSystemDirectoryHandle): Promise<boolean> {
    const trash = await this.root.getDirectoryHandle(TRASH_DIRECTORY, { create: true });
    const directoryName = safeId(taskId);
    if (!(await directoryExists(trash, directoryName))) return false;
    const source = await trash.getDirectoryHandle(directoryName);
    const target = await tasks.getDirectoryHandle(directoryName, { create: true });
    await copyDirectory(source, target);
    await trash.removeEntry(directoryName, { recursive: true });
    return true;
  }

  private async cleanupWorkspaceContent(): Promise<void> {
    await this.enqueueWrite(() => this.cleanupWorkspaceContentUnlocked());
  }

  private async cleanupWorkspaceContentUnlocked(): Promise<void> {
    await removeIfExists(this.root, TASKS_DIRECTORY, true);
    await removeIfExists(this.root, TRASH_DIRECTORY, true);
    await removeIfExists(this.root, WORKSPACE_FILE);
    this.lastRevision = null;
    this.taskRevisions.clear();
    this.expectedContentHashes.clear();
  }

  private async verifySnapshotContent(snapshot: WorkspaceSnapshot): Promise<void> {
    const tasksDirectory = await this.root.getDirectoryHandle(TASKS_DIRECTORY);
    for (const task of snapshot.state.tasks) {
      const taskDirectory = await tasksDirectory.getDirectoryHandle(safeId(task.id));
      const taskFile = await readRequiredJson<TaskFile>(taskDirectory, TASK_FILE);
      validateTaskFile(taskFile, task.id);
      const description = await readTextIfExists(taskDirectory, DESCRIPTION_FILE) ?? "";
      if (await hashText(description) !== await hashText(normalizeMarkdown(task.descriptionMarkdown))) {
        throw new Error(`任务“${task.title}”的描述校验失败。`);
      }
    }
    for (const record of snapshot.workLogs) {
      const taskDirectory = await tasksDirectory.getDirectoryHandle(safeId(record.taskId));
      const worklogs = await taskDirectory.getDirectoryHandle(WORKLOGS_DIRECTORY);
      const markdown = await readTextIfExists(worklogs, workLogFileName(record));
      if (markdown === null || await hashText(markdown) !== await hashText(serializeWorkLog(record))) {
        throw new Error(`工作记录 ${record.id} 校验失败。`);
      }
    }
    for (const meta of snapshot.attachments) {
      const expected = snapshot.attachmentBlobs.get(meta.id);
      if (!expected) throw new Error(`附件 ${meta.name} 缺少内容。`);
      const taskDirectory = await tasksDirectory.getDirectoryHandle(safeId(meta.taskId));
      const attachments = await taskDirectory.getDirectoryHandle(ATTACHMENTS_DIRECTORY);
      const actual = await (await attachments.getFileHandle(attachmentFileName(meta))).getFile();
      if (await hashBlob(actual) !== await hashBlob(expected)) throw new Error(`附件 ${meta.name} 校验失败。`);
    }
  }

  private async assertTextContentUnchanged(
    directory: FileSystemDirectoryHandle,
    name: string,
    key: string,
    recordedHash: string | undefined,
    target: WorkspaceConflictTarget,
  ): Promise<void> {
    const actual = await readTextIfExists(directory, name);
    const actualHash = await hashText(actual ?? "");
    const expected = this.expectedContentHashes.get(key) ?? recordedHash;
    if (expected !== undefined && actualHash !== expected) {
      throw new WorkspaceConflictError("本地文件已被其它程序修改，未覆盖外部版本。", target);
    }
    this.expectedContentHashes.set(key, actualHash);
  }

  private async assertAttachmentUnchanged(
    attachments: FileSystemDirectoryHandle,
    meta: AttachmentMeta,
    taskFile: TaskFile,
  ): Promise<void> {
    let blob: Blob;
    try {
      blob = await (await attachments.getFileHandle(attachmentFileName(meta))).getFile();
    } catch (error) {
      if (isNotFound(error)) {
        throw new WorkspaceConflictError("本地附件已被移动或删除，未覆盖外部变更。", {
          kind: "attachment",
          taskId: meta.taskId,
          attachmentId: meta.id,
          name: meta.name,
        });
      }
      throw error;
    }
    const actualHash = await hashBlob(blob);
    const expected = this.expectedContentHashes.get(attachmentHashKey(meta.id)) ?? taskFile.contentHashes?.attachments[meta.id];
    if (expected !== undefined && actualHash !== expected) {
      throw new WorkspaceConflictError("本地附件已被其它程序修改，未覆盖外部版本。", {
        kind: "attachment",
        taskId: meta.taskId,
        attachmentId: meta.id,
        name: meta.name,
      });
    }
    this.expectedContentHashes.set(attachmentHashKey(meta.id), actualHash);
  }

  private assertRevision(current: number | null): void {
    if (this.lastRevision !== null && current !== this.lastRevision) {
      throw new Error("本地工作区已被其它页面或程序修改，请重新加载后再保存。");
    }
  }

  private assertTaskRevision(taskFile: TaskFile): void {
    const expected = this.taskRevisions.get(taskFile.task.id);
    if (expected !== undefined && taskFile.revision !== expected) {
      throw new Error(`任务“${taskFile.task.title}”已被其它页面或程序修改，请重新加载后再保存。`);
    }
  }

  private async assertPermission(): Promise<void> {
    if (!(await this.ensurePermission(false))) throw new Error("本地工作区需要重新授权后才能读写。");
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const execute = async () => {
      const locks = navigator.locks;
      const value = locks
        ? await locks.request(`task-workbench:${this.root.name}`, { mode: "exclusive" }, operation)
        : await operation();
      this.changes?.postMessage({ type: "workspace-changed", at: Date.now() });
      return value;
    };
    const result = this.writeQueue.then(execute);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function validateWorkspaceIndex(value: WorkspaceIndexFile): void {
  if (value.format !== "task-workbench-workspace" || value.schemaVersion !== 5 || !Array.isArray(value.taskIds) || !Array.isArray(value.folders)) {
    throw new Error("workspace.json 不是有效的任务工作区索引。");
  }
}

function validateTaskFile(value: TaskFile, taskId: string): void {
  if (value.format !== "task-workbench-task" || ![1, 2].includes(value.schemaVersion) || value.task?.id !== taskId || !Array.isArray(value.workLogs) || !Array.isArray(value.attachments)) {
    throw new Error(`任务 ${taskId} 的 task.json 无效。`);
  }
}

function validateSnapshot(snapshot: WorkspaceSnapshot): void {
  const taskIds = new Set(snapshot.state.tasks.map((task) => task.id));
  const folderIds = new Set(snapshot.state.folders.map((folder) => folder.id));
  const workLogIds = new Set(snapshot.workLogs.map((item) => item.id));
  const attachmentIds = new Set(snapshot.attachments.map((item) => item.id));
  if (snapshot.state.tasks.length !== taskIds.size) throw new Error("迁移快照包含重复任务标识。");
  if (snapshot.state.folders.length !== folderIds.size) throw new Error("迁移快照包含重复文件夹标识。");
  if (snapshot.workLogs.length !== workLogIds.size) throw new Error("迁移快照包含重复工作记录标识。");
  if (snapshot.attachments.length !== attachmentIds.size) throw new Error("迁移快照包含重复附件标识。");
  for (const folder of snapshot.state.folders) {
    if (folder.parentId !== null && !folderIds.has(folder.parentId)) throw new Error(`文件夹 ${folder.name} 引用了不存在的上级。`);
    if (!Number.isFinite(getFolderDepth(snapshot.state.folders, folder.id)) || getFolderDepth(snapshot.state.folders, folder.id) > 4) throw new Error(`文件夹 ${folder.name} 的层级结构无效。`);
  }
  for (const task of snapshot.state.tasks) if (task.folderId !== null && !folderIds.has(task.folderId)) throw new Error(`任务 ${task.title} 引用了不存在的文件夹。`);
  for (const record of snapshot.workLogs) {
    if (!taskIds.has(record.taskId)) throw new Error(`工作记录 ${record.id} 引用了不存在的任务。`);
  }
  for (const attachment of snapshot.attachments) {
    if (!taskIds.has(attachment.taskId)) throw new Error(`附件 ${attachment.name} 引用了不存在的任务。`);
    if (!snapshot.attachmentBlobs.has(attachment.id)) throw new Error(`附件 ${attachment.name} 缺少内容。`);
  }
  for (const id of snapshot.attachmentBlobs.keys()) {
    if (!attachmentIds.has(id)) throw new Error(`附件内容 ${id} 缺少元数据。`);
  }
}

async function updateStateRevisions(state: AppState, previous: Record<string, EntityRevisionMetadata>): Promise<Record<string, EntityRevisionMetadata>> {
  const next: Record<string, EntityRevisionMetadata> = {};
  for (const [kind, entity] of [
    ...state.tasks.map((value) => ["task", value] as const),
    ...state.folders.map((value) => ["folder", value] as const),
  ]) {
    const key = `${kind}:${entity.id}`;
    const contentHash = await hashText(stableJson(entity));
    const prior = previous[key];
    next[key] = prior?.contentHash === contentHash
      ? prior
      : {
          revisionId: crypto.randomUUID(),
          parentRevisionId: prior?.revisionId ?? null,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          contentHash,
        };
  }
  for (const [key, revision] of Object.entries(previous)) {
    if ((key.startsWith("worklog:") || key.startsWith("attachment:")) && !next[key]) next[key] = revision;
  }
  return next;
}

function updateTombstones(current: WorkspaceIndexFile | null, state: AppState, deletedAt: number): DeletionTombstone[] {
  const tombstones = [...(current?.tombstones ?? [])];
  const nextTaskIds = new Set(state.tasks.map((task) => task.id));
  const nextFolderIds = new Set(state.folders.map((folder) => folder.id));
  for (const id of current?.taskIds ?? []) if (!nextTaskIds.has(id)) tombstones.push(createTombstone("task", id, deletedAt));
  for (const folder of current?.folders ?? []) if (!nextFolderIds.has(folder.id)) tombstones.push(createTombstone("folder", folder.id, deletedAt));
  return tombstones.filter((item, index, all) => all.findIndex((candidate) => candidate.entityType === item.entityType && candidate.entityId === item.entityId) === index);
}

function createTombstone(entityType: "task" | "folder", entityId: string, deletedAt: number): DeletionTombstone {
  return { deletionId: crypto.randomUUID(), entityType, entityId, deletedAt };
}

function snapshotMetadata(index: WorkspaceIndexFile, state: AppState, workLogs: WorkLog[], attachments: AttachmentMeta[]): WorkspaceSnapshotMetadata {
  return {
    schemaVersion: 6,
    workspaceId: index.workspaceId ?? `workspace-${index.revision}`,
    snapshotId: index.snapshotId ?? `snapshot-${index.revision}`,
    parentSnapshotId: index.parentSnapshotId ?? null,
    exportedAt: new Date(index.updatedAt).toISOString(),
    contentSummary: {
      tasks: state.tasks.length,
      folders: state.folders.length,
      workLogs: workLogs.length,
      attachments: attachments.length,
      attachmentBytes: attachments.reduce((total, item) => total + item.size, 0),
    },
    entityRevisions: index.entityRevisions ?? {},
    tombstones: index.tombstones ?? [],
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function ensureContentHashes(taskFile: TaskFile | null | undefined): NonNullable<TaskFile["contentHashes"]> {
  if (!taskFile) return { workLogs: {}, attachments: {} };
  taskFile.contentHashes ??= { workLogs: {}, attachments: {} };
  taskFile.contentHashes.workLogs ??= {};
  taskFile.contentHashes.attachments ??= {};
  return taskFile.contentHashes;
}

function descriptionHashKey(taskId: string): string {
  return `description:${taskId}`;
}

function workLogHashKey(taskId: string, recordId: string): string {
  return `worklog:${taskId}:${recordId}`;
}

function attachmentHashKey(attachmentId: string): string {
  return `attachment:${attachmentId}`;
}

async function hashText(text: string): Promise<string> {
  return hashBlob(new Blob([normalizeMarkdown(text)]));
}

async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function conflictTimestamp(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function conflictAttachmentName(name: string, stamp: string): string {
  const safe = safeName(name);
  const separator = safe.lastIndexOf(".");
  if (separator <= 0) return `${safe}.conflict-${stamp}`;
  return `${safe.slice(0, separator)}.conflict-${stamp}${safe.slice(separator)}`;
}

function serializeWorkLog(record: WorkLog): string {
  const frontMatter = [
    "---",
    `id: ${JSON.stringify(record.id)}`,
    `taskId: ${JSON.stringify(record.taskId)}`,
    `workDate: ${JSON.stringify(record.workDate)}`,
    `progressPercent: ${record.progressPercent === null ? "null" : record.progressPercent}`,
    `conflictOrigin: ${record.conflictOrigin ? JSON.stringify(record.conflictOrigin) : "null"}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt}`,
    "---",
  ].join("\n");
  return `${frontMatter}\n${normalizeMarkdown(record.contentMarkdown)}`;
}

function parseWorkLog(markdown: string, fallback: Omit<WorkLog, "contentMarkdown">): WorkLog {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalizeMarkdown(markdown));
  if (!match) return { ...fallback, contentMarkdown: normalizeMarkdown(markdown) };
  const values = new Map<string, unknown>();
  for (const line of (match[1] ?? "").split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    try { values.set(key, JSON.parse(raw)); } catch { values.set(key, raw); }
  }
  // conflictOrigin 仅在确有取值时作为自有键返回：JSON 序列化会丢弃 undefined，
  // 若此处始终携带该键，会导致备份导入后逐项校验时（stableValue 比较）与
  // 备份解析得到的记录形状不一致，使含工作记录的导入被误判为失败并自动回滚。
  const conflictOrigin = values.get("conflictOrigin") === "imported" ? "imported" : fallback.conflictOrigin;
  return {
    id: typeof values.get("id") === "string" ? String(values.get("id")) : fallback.id,
    taskId: typeof values.get("taskId") === "string" ? String(values.get("taskId")) : fallback.taskId,
    workDate: typeof values.get("workDate") === "string" ? String(values.get("workDate")) : fallback.workDate,
    progressPercent: typeof values.get("progressPercent") === "number" ? Number(values.get("progressPercent")) : null,
    ...(conflictOrigin ? { conflictOrigin } : {}),
    createdAt: typeof values.get("createdAt") === "number" ? Number(values.get("createdAt")) : fallback.createdAt,
    updatedAt: typeof values.get("updatedAt") === "number" ? Number(values.get("updatedAt")) : fallback.updatedAt,
    contentMarkdown: match[2] ?? "",
  };
}

function workLogMeta(record: WorkLog): Omit<WorkLog, "contentMarkdown"> {
  const { contentMarkdown: _contentMarkdown, ...meta } = record;
  return meta;
}

function workLogId(taskId: string, workDate: string): string {
  return `${taskId}::${workDate}`;
}

function workLogFileName(record: Pick<WorkLog, "id" | "taskId" | "workDate">): string {
  if (record.id === workLogId(record.taskId, record.workDate)) return `${record.workDate}.md`;
  return `${record.workDate}.conflict-${shortStableHash(record.id)}.md`;
}

function shortStableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function attachmentFileName(meta: AttachmentMeta): string {
  return `${safeId(meta.id)}--${safeName(meta.name)}`;
}

function safeId(value: string): string {
  if (!value) throw new Error("标识不能为空。");
  return encodeURIComponent(value);
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 120) || "attachment";
}

function assertSafeFileName(value: string): void {
  const normalized = value.trim();
  const base = normalized.split(".", 1)[0]?.toUpperCase() ?? "";
  const reserved = new Set([
    "CON", "PRN", "AUX", "NUL",
    ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
  ]);
  if (!normalized || normalized === "." || normalized === ".." || /[\\/:*?"<>|\u0000-\u001f]/.test(normalized) || /[. ]$/.test(normalized)) {
    throw new Error(`文件名“${value}”不符合本地文件系统命名规则。`);
  }
  if (reserved.has(base)) throw new Error(`文件名“${value}”使用了 Windows 保留名称。`);
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

async function readRequiredJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T> {
  const value = await readJsonIfExists<T>(directory, name);
  if (!value) throw new Error(`缺少 ${name}。`);
  return value;
}

async function readJsonIfExists<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  const text = await readTextIfExists(directory, name);
  if (text === null) return null;
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`${name} 不是有效 JSON。`); }
}

async function readTextIfExists(directory: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    return await (await (await directory.getFileHandle(name)).getFile()).text();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function readBlobIfExists(directory: FileSystemDirectoryHandle, name: string): Promise<Blob | null> {
  try { return await (await directory.getFileHandle(name)).getFile(); }
  catch (error) { if (isNotFound(error)) return null; throw error; }
}

async function directoryHasEntries(directory: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _entry of (directory as IterableDirectoryHandle).entries()) return true;
  return false;
}

async function writeVerifiedText(directory: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const normalized = normalizeMarkdown(text);
  await writeVerifiedBlob(directory, name, new Blob([normalized], { type: "text/plain;charset=utf-8" }));
  const actual = await readTextIfExists(directory, name);
  if (actual !== normalized) throw new Error(`${name} 写入校验失败。`);
}

async function writeVerifiedBlob(directory: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  assertSafeFileName(name);
  const temporaryName = `tmp-${crypto.randomUUID()}-${safeName(name)}`;
  const expectedHash = await hashBlob(blob);
  let previous: Blob | null = null;
  let operationFailure: unknown = null;
  try {
    previous = await (await directory.getFileHandle(name)).getFile();
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await writeBlob(directory, temporaryName, blob);
    const temporaryFile = await (await directory.getFileHandle(temporaryName)).getFile();
    if (temporaryFile.size !== blob.size || await hashBlob(temporaryFile) !== expectedHash) throw new Error(`${name} 临时写入校验失败。`);
    try {
      await writeBlob(directory, name, temporaryFile);
      const finalFile = await (await directory.getFileHandle(name)).getFile();
      if (finalFile.size !== blob.size || await hashBlob(finalFile) !== expectedHash) throw new Error(`${name} 写入校验失败。`);
    } catch (error) {
      try {
        if (previous) await writeBlob(directory, name, previous);
        else await removeIfExists(directory, name);
      } catch (rollbackError) {
        throw new Error(`${name} 写入失败且原文件恢复未完成：${errorMessage(error)}；恢复：${errorMessage(rollbackError)}`);
      }
      throw error;
    }
  } catch (error) {
    operationFailure = error;
    throw error;
  } finally {
    try {
      await removeIfExists(directory, temporaryName);
    } catch (cleanupError) {
      if (operationFailure) throw new Error(`${errorMessage(operationFailure)}；临时文件清理失败：${errorMessage(cleanupError)}`);
      throw cleanupError;
    }
  }
}

async function writeBlob(directory: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  assertSafeFileName(name);
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable({ keepExistingData: false });
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try { await writable.abort(error); } catch { /* The stream may already be closed. */ }
    throw error;
  }
}

async function directoryExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try { await directory.getDirectoryHandle(name); return true; }
  catch (error) { if (isNotFound(error)) return false; throw error; }
}

async function removeIfExists(directory: FileSystemDirectoryHandle, name: string, recursive = false): Promise<void> {
  assertSafeFileName(name);
  try { await directory.removeEntry(name, { recursive }); }
  catch (error) { if (!isNotFound(error)) throw error; }
}

async function copyDirectory(source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, handle] of (source as IterableDirectoryHandle).entries()) {
    if (handle.kind === "file") {
      const blob = await (handle as FileSystemFileHandle).getFile();
      await writeVerifiedBlob(target, name, blob);
    } else {
      const childTarget = await target.getDirectoryHandle(name, { create: true });
      await copyDirectory(handle as FileSystemDirectoryHandle, childTarget);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

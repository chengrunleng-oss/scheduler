import { createId, normalizeDate } from "./domain.js";
import { loadStateFromStorage, saveStateToStorage } from "./storage.js";
import type { AppState, AttachmentKind, AttachmentMeta, Task, WorkLog } from "./types.js";
import { MAX_ATTACHMENT_BYTES, type StorageEstimate, type WorkspaceBackend, type WorkspaceConflictTarget, type WorkspaceLoadResult, type WorkspaceSnapshot, type WorkLogInput } from "./workspace-backend.js";

const DB_NAME = "task-workbench-content-v5";
const DB_VERSION = 1;
const WORK_LOGS = "workLogs";
const ATTACHMENTS = "attachments";
const ATTACHMENT_BLOBS = "attachmentBlobs";

interface AttachmentBlobRecord {
  id: string;
  taskId: string;
  blob: Blob;
}

export class LegacyBrowserImportReader implements WorkspaceBackend {
  private constructor(
    private readonly db: IDBDatabase | null,
    private readonly storage: Storage,
    readonly errorMessage = "",
  ) {}

  static async open(storage: Storage = localStorage): Promise<LegacyBrowserImportReader> {
    if (!("indexedDB" in globalThis)) return new LegacyBrowserImportReader(null, storage, "当前浏览器不支持旧数据迁移读取。");
    try {
      const db = await openDatabase();
      return new LegacyBrowserImportReader(db, storage);
    } catch {
      return new LegacyBrowserImportReader(null, storage, "旧浏览器数据读取初始化失败。");
    }
  }

  get available(): boolean {
    return this.db !== null;
  }

  async loadWorkspace(): Promise<WorkspaceLoadResult> {
    return loadStateFromStorage(this.storage);
  }

  async saveWorkspaceIndex(state: AppState): Promise<void> {
    const result = saveStateToStorage(state, this.storage);
    if (!result.saved) throw new Error(result.message);
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
    await this.saveTask(task);
  }

  async saveDescription(taskId: string, descriptionMarkdown: string): Promise<void> {
    const state = (await this.loadWorkspace()).state;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("找不到要保存描述的任务。");
    await this.saveTask({
      ...task,
      descriptionMarkdown: descriptionMarkdown.replace(/\r\n?/g, "\n"),
      updatedAt: Date.now(),
    });
  }

  async getWorkLog(taskId: string, workDate: string, recordId?: string): Promise<WorkLog | null> {
    const id = recordId ?? workLogId(taskId, workDate);
    return (await this.get<WorkLog>(WORK_LOGS, id)) ?? null;
  }

  async listWorkLogs(taskId: string): Promise<WorkLog[]> {
    const records = await this.getAllByTask<WorkLog>(WORK_LOGS, taskId);
    return records.sort((a, b) => b.workDate.localeCompare(a.workDate) || b.updatedAt - a.updatedAt);
  }

  async saveWorkLog(input: WorkLogInput, now = Date.now()): Promise<WorkLog> {
    this.assertAvailable();
    const workDate = normalizeDate(input.workDate);
    if (!workDate) throw new Error("工作日期无效。");
    const existing = await this.getWorkLog(input.taskId, workDate, input.id);
    const record: WorkLog = {
      id: input.id ?? workLogId(input.taskId, workDate),
      taskId: input.taskId,
      workDate,
      contentMarkdown: input.contentMarkdown.replace(/\r\n?/g, "\n"),
      progressPercent: input.progressPercent === null ? null : Math.max(0, Math.min(100, Math.round(input.progressPercent))),
      conflictOrigin: input.conflictOrigin,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.put(WORK_LOGS, record);
    return record;
  }

  async deleteWorkLog(id: string): Promise<void> {
    this.assertAvailable();
    const transaction = this.db!.transaction(WORK_LOGS, "readwrite");
    transaction.objectStore(WORK_LOGS).delete(id);
    await transactionDone(transaction);
  }

  async restoreWorkLog(record: WorkLog): Promise<void> {
    this.assertAvailable();
    await this.put(WORK_LOGS, record);
  }

  async listAttachments(taskId: string): Promise<AttachmentMeta[]> {
    const records = await this.getAllByTask<AttachmentMeta>(ATTACHMENTS, taskId);
    return records.sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
  }

  async putAttachment(taskId: string, file: File, now = Date.now()): Promise<AttachmentMeta> {
    this.assertAvailable();
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("单个附件不能超过 20 MB。");
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
    const transaction = this.db!.transaction([ATTACHMENTS, ATTACHMENT_BLOBS], "readwrite");
    transaction.objectStore(ATTACHMENTS).put(meta);
    transaction.objectStore(ATTACHMENT_BLOBS).put({ id, taskId, blob: file } satisfies AttachmentBlobRecord);
    await transactionDone(transaction);
    return meta;
  }

  async renameAttachment(id: string, name: string): Promise<void> {
    const current = await this.get<AttachmentMeta>(ATTACHMENTS, id);
    const normalized = name.trim();
    if (!current || !normalized) throw new Error("附件名称不能为空。");
    await this.put(ATTACHMENTS, { ...current, name: normalized, kind: detectAttachmentKind(normalized, current.type) });
  }

  async deleteAttachment(id: string): Promise<void> {
    this.assertAvailable();
    const transaction = this.db!.transaction([ATTACHMENTS, ATTACHMENT_BLOBS], "readwrite");
    transaction.objectStore(ATTACHMENTS).delete(id);
    transaction.objectStore(ATTACHMENT_BLOBS).delete(id);
    await transactionDone(transaction);
  }

  async readAttachment(id: string): Promise<Blob | null> {
    const record = await this.get<AttachmentBlobRecord>(ATTACHMENT_BLOBS, id);
    return record?.blob ?? null;
  }

  async saveAttachment(id: string, content: Blob): Promise<void> {
    this.assertAvailable();
    const meta = await this.get<AttachmentMeta>(ATTACHMENTS, id);
    if (!meta) throw new Error("找不到要保存的附件。");
    if (content.size > MAX_ATTACHMENT_BYTES) throw new Error("单个附件不能超过 20 MB。");
    const nextMeta = { ...meta, size: content.size, type: content.type || meta.type };
    const transaction = this.db!.transaction([ATTACHMENTS, ATTACHMENT_BLOBS], "readwrite");
    transaction.objectStore(ATTACHMENTS).put(nextMeta);
    transaction.objectStore(ATTACHMENT_BLOBS).put({ id, taskId: meta.taskId, blob: content } satisfies AttachmentBlobRecord);
    await transactionDone(transaction);
  }

  async saveConflictCopy(_target: WorkspaceConflictTarget, _content: Blob): Promise<string> {
    throw new Error("浏览器存储不需要创建本地文件冲突副本。");
  }

  async estimateStorage(): Promise<StorageEstimate> {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
    const snapshot = await this.exportSnapshot();
    const usage = snapshot.attachments.reduce((total, item) => total + item.size, 0);
    return { usage, quota: 0 };
  }

  async exportSnapshot(): Promise<WorkspaceSnapshot> {
    this.assertAvailable();
    const [loaded, workLogs, attachments, blobRecords] = await Promise.all([
      this.loadWorkspace(),
      this.getAll<WorkLog>(WORK_LOGS),
      this.getAll<AttachmentMeta>(ATTACHMENTS),
      this.getAll<AttachmentBlobRecord>(ATTACHMENT_BLOBS),
    ]);
    return { state: loaded.state, workLogs, attachments, attachmentBlobs: new Map(blobRecords.map((item) => [item.id, item.blob])) };
  }

  async importSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    this.assertAvailable();
    const previous = await this.exportSnapshot();
    try {
      await this.replaceContent(snapshot);
      await this.saveWorkspaceIndex(snapshot.state);
    } catch (error) {
      await this.replaceContent(previous);
      await this.saveWorkspaceIndex(previous.state);
      throw error;
    }
  }

  async clear(): Promise<void> {
    this.assertAvailable();
    await this.replaceContent({ workLogs: [], attachments: [], attachmentBlobs: new Map() });
  }

  close(): void {
    this.db?.close();
  }

  private async replaceContent(snapshot: Pick<WorkspaceSnapshot, "workLogs" | "attachments" | "attachmentBlobs">): Promise<void> {
    this.assertAvailable();
    const transaction = this.db!.transaction([WORK_LOGS, ATTACHMENTS, ATTACHMENT_BLOBS], "readwrite");
    const workLogs = transaction.objectStore(WORK_LOGS);
    const attachments = transaction.objectStore(ATTACHMENTS);
    const blobs = transaction.objectStore(ATTACHMENT_BLOBS);
    workLogs.clear();
    attachments.clear();
    blobs.clear();
    for (const record of snapshot.workLogs) workLogs.put(record);
    for (const meta of snapshot.attachments) attachments.put(meta);
    for (const [id, blob] of snapshot.attachmentBlobs) {
      const taskId = snapshot.attachments.find((item) => item.id === id)?.taskId;
      if (taskId) blobs.put({ id, taskId, blob } satisfies AttachmentBlobRecord);
    }
    await transactionDone(transaction);
  }

  private assertAvailable(): void {
    if (!this.db) throw new Error(this.errorMessage || "工作记录存储不可用。");
  }

  private async get<T>(storeName: string, id: string): Promise<T | undefined> {
    this.assertAvailable();
    const transaction = this.db!.transaction(storeName, "readonly");
    return requestResult<T | undefined>(transaction.objectStore(storeName).get(id));
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    this.assertAvailable();
    const transaction = this.db!.transaction(storeName, "readonly");
    return requestResult<T[]>(transaction.objectStore(storeName).getAll());
  }

  private async getAllByTask<T>(storeName: string, taskId: string): Promise<T[]> {
    this.assertAvailable();
    const transaction = this.db!.transaction(storeName, "readonly");
    return requestResult<T[]>(transaction.objectStore(storeName).index("taskId").getAll(taskId));
  }

  private async put(storeName: string, value: unknown): Promise<void> {
    this.assertAvailable();
    const transaction = this.db!.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  }
}

export function detectAttachmentKind(name: string, type: string): AttachmentKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (type === "image/svg+xml" || extension === "svg" || type === "text/html" || ["html", "htm"].includes(extension)) return "text";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || extension === "pdf") return "pdf";
  if (type.startsWith("text/") || ["md", "markdown", "txt", "json", "csv", "log"].includes(extension)) return "text";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"].includes(extension)) return "office";
  return "binary";
}

function workLogId(taskId: string, workDate: string): string {
  return `${taskId}::${workDate}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const workLogs = db.createObjectStore(WORK_LOGS, { keyPath: "id" });
      workLogs.createIndex("taskId", "taskId");
      workLogs.createIndex("taskDate", ["taskId", "workDate"], { unique: true });
      const attachments = db.createObjectStore(ATTACHMENTS, { keyPath: "id" });
      attachments.createIndex("taskId", "taskId");
      const blobs = db.createObjectStore(ATTACHMENT_BLOBS, { keyPath: "id" });
      blobs.createIndex("taskId", "taskId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("数据库升级被其他页面阻止。"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("数据库事务已中止。"));
  });
}

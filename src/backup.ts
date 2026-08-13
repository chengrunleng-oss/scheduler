import JSZip from "jszip";
import { hydrateState, validateBackupPayload } from "./domain.js";
import { parseBackupFile, type StorageResult } from "./storage.js";
import type { AppState, AttachmentMeta, WorkLog } from "./types.js";
import type { WorkspaceBackend, WorkspaceSnapshot } from "./workspace-backend.js";

const MANIFEST_FILE = "manifest.json";

interface WorkLogIndexEntry extends Omit<WorkLog, "contentMarkdown"> {
  path: string;
}

interface AttachmentIndexEntry extends AttachmentMeta {
  path: string;
}

interface BackupManifest {
  format: "task-workbench-backup";
  schemaVersion: 5;
  exportedAt: string;
  appState: AppState;
  workLogs: WorkLogIndexEntry[];
  attachments: AttachmentIndexEntry[];
}

export interface BackupImportResult extends StorageResult {
  workspace: WorkspaceSnapshot;
}

export async function createBackupArchive(state: AppState, backend: WorkspaceBackend): Promise<Blob> {
  const snapshot = backend.available
    ? await backend.exportSnapshot()
    : { state, workLogs: [], attachments: [], attachmentBlobs: new Map<string, Blob>() };
  const zip = new JSZip();
  const taskIds = new Set(state.tasks.map((task) => task.id));
  const workLogs: WorkLogIndexEntry[] = [];
  const attachments: AttachmentIndexEntry[] = [];

  for (const record of snapshot.workLogs.filter((item) => taskIds.has(item.taskId))) {
    const path = `worklogs/${safePath(record.taskId)}/${record.workDate}.md`;
    zip.file(path, record.contentMarkdown);
    const { contentMarkdown: _contentMarkdown, ...entry } = record;
    workLogs.push({ ...entry, path });
  }

  for (const meta of snapshot.attachments.filter((item) => taskIds.has(item.taskId))) {
    const blob = snapshot.attachmentBlobs.get(meta.id);
    if (!blob) continue;
    const path = `attachments/${safePath(meta.taskId)}/${safePath(meta.id)}-${safePath(meta.name)}`;
    zip.file(path, blob);
    attachments.push({ ...meta, path });
  }

  const manifest: BackupManifest = {
    format: "task-workbench-backup",
    schemaVersion: 5,
    exportedAt: new Date().toISOString(),
    appState: state,
    workLogs,
    attachments,
  };
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function parseBackupPackage(file: File): Promise<BackupImportResult> {
  if (file.name.toLowerCase().endsWith(".json") || file.type.includes("json")) {
    const legacy = parseBackupFile(await file.text());
    return { ...legacy, workspace: emptyWorkspace(legacy.state) };
  }

  try {
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file(MANIFEST_FILE);
    if (!manifestFile) return invalidResult("备份包缺少 manifest.json，未导入。");
    const parsed: unknown = JSON.parse(await manifestFile.async("text"));
    if (!isBackupManifest(parsed)) return invalidResult("备份清单结构无效，未导入。");
    const validation = validateBackupPayload(parsed.appState);
    if (!validation.valid) return invalidResult(validation.message);

    const workLogs: WorkLog[] = [];
    const attachments: AttachmentMeta[] = [];
    const attachmentBlobs = new Map<string, Blob>();
    for (const entry of parsed.workLogs) {
      const source = zip.file(entry.path);
      if (!source) return invalidResult(`备份包缺少工作记录：${entry.path}`);
      const { path: _path, ...record } = entry;
      workLogs.push({ ...record, contentMarkdown: await source.async("text") });
    }
    for (const entry of parsed.attachments) {
      const source = zip.file(entry.path);
      if (!source) return invalidResult(`备份包缺少附件：${entry.name}`);
      const { path: _path, ...meta } = entry;
      attachments.push(meta);
      attachmentBlobs.set(meta.id, await source.async("blob"));
    }

    return {
      state: hydrateState(parsed.appState),
      workspace: { state: hydrateState(parsed.appState), workLogs, attachments, attachmentBlobs },
      recovered: true,
      message: "完整备份已导入。",
    };
  } catch {
    return invalidResult("备份包无法解析，未导入。");
  }
}

function isBackupManifest(value: unknown): value is BackupManifest {
  if (!isRecord(value) || value.format !== "task-workbench-backup" || value.schemaVersion !== 5) return false;
  if (!isRecord(value.appState) || !Array.isArray(value.workLogs) || !Array.isArray(value.attachments)) return false;
  const validLogs = value.workLogs.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.taskId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(item.workDate)) && typeof item.path === "string");
  const validAttachments = value.attachments.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.taskId === "string" && typeof item.name === "string" && typeof item.path === "string" && typeof item.size === "number");
  return validLogs && validAttachments;
}

function invalidResult(message: string): BackupImportResult {
  const state = hydrateState(null);
  return { state, workspace: emptyWorkspace(state), recovered: false, message };
}

function emptyWorkspace(state: AppState): WorkspaceSnapshot {
  return { state, workLogs: [], attachments: [], attachmentBlobs: new Map() };
}

function safePath(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "item";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

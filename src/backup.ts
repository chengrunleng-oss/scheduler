import JSZip from "jszip";
import { hydrateState, validateBackupPayload } from "./domain.js";
import { parseBackupFile, type StorageResult } from "./storage.js";
import type { AppState, AttachmentMeta, WorkLog } from "./types.js";
import type { WorkspaceBackend, WorkspaceSnapshot } from "./workspace-backend.js";
import type { EntityRevisionMetadata, WorkspaceSnapshotMetadata } from "./workspace-backend.js";

const MANIFEST_FILE = "manifest.json";

interface WorkLogIndexEntry extends Omit<WorkLog, "contentMarkdown"> {
  path: string;
}

interface AttachmentIndexEntry extends AttachmentMeta {
  path: string;
}

interface BackupManifestV5 {
  format: "task-workbench-backup";
  schemaVersion: 5;
  exportedAt: string;
  appState: AppState;
  workLogs: WorkLogIndexEntry[];
  attachments: AttachmentIndexEntry[];
}

interface BackupManifestV6 extends Omit<BackupManifestV5, "schemaVersion">, WorkspaceSnapshotMetadata {
  schemaVersion: 6;
}

type BackupManifest = BackupManifestV5 | BackupManifestV6;

export interface BackupImportResult extends StorageResult {
  workspace: WorkspaceSnapshot;
  sourceVersion: "legacy-json" | 5 | 6;
}

export async function createBackupArchive(state: AppState, backend: WorkspaceBackend): Promise<Blob> {
  const snapshot = backend.available
    ? await backend.exportSnapshot()
    : { state, workLogs: [], attachments: [], attachmentBlobs: new Map<string, Blob>() };
  const zip = new JSZip();
  const taskIds = new Set(snapshot.state.tasks.map((task) => task.id));
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
    attachments.push({ ...meta, contentHash: await hashBlob(blob), path });
  }

  const exportedAt = new Date().toISOString();
  const metadata = await createSnapshotMetadata({ ...snapshot, attachments: attachments.map(({ path: _path, ...meta }) => meta) }, exportedAt);
  const manifest: BackupManifestV6 = {
    format: "task-workbench-backup",
    ...metadata,
    appState: snapshot.state,
    workLogs,
    attachments,
  };
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function parseBackupPackage(file: File): Promise<BackupImportResult> {
  if (file.name.toLowerCase().endsWith(".json") || file.type.includes("json")) {
    const legacy = parseBackupFile(await file.text());
    return { ...legacy, workspace: emptyWorkspace(legacy.state), sourceVersion: "legacy-json" };
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
      const { path: _path, ...rawMeta } = entry;
      const blob = await source.async("blob");
      const contentHash = await hashBlob(blob);
      if (rawMeta.contentHash && rawMeta.contentHash !== contentHash) return invalidResult(`附件校验失败：${rawMeta.name}`);
      const meta = { ...rawMeta, contentHash };
      attachments.push(meta);
      attachmentBlobs.set(meta.id, blob);
    }

    const state = hydrateState(parsed.appState);
    const workspace: WorkspaceSnapshot = { state, workLogs, attachments, attachmentBlobs };
    if (parsed.schemaVersion === 6) workspace.metadata = manifestMetadata(parsed);
    return {
      state,
      workspace,
      recovered: true,
      message: parsed.schemaVersion === 6 ? "备份已解析，可以预览合并。" : "旧版备份已解析，将采用保守合并规则。",
      sourceVersion: parsed.schemaVersion,
    };
  } catch {
    return invalidResult("备份包无法解析，未导入。");
  }
}

function isBackupManifest(value: unknown): value is BackupManifest {
  if (!isRecord(value) || value.format !== "task-workbench-backup" || ![5, 6].includes(Number(value.schemaVersion))) return false;
  if (!isRecord(value.appState) || !Array.isArray(value.workLogs) || !Array.isArray(value.attachments)) return false;
  if (value.schemaVersion === 6 && !isV6Metadata(value)) return false;
  const validLogs = value.workLogs.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.taskId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(item.workDate)) && typeof item.path === "string");
  const validAttachments = value.attachments.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.taskId === "string" && typeof item.name === "string" && typeof item.path === "string" && typeof item.size === "number");
  return validLogs && validAttachments;
}

function isV6Metadata(value: Record<string, unknown>): boolean {
  if (typeof value.workspaceId !== "string" || typeof value.snapshotId !== "string" || typeof value.exportedAt !== "string") return false;
  if (value.parentSnapshotId !== null && typeof value.parentSnapshotId !== "string") return false;
  if (!isRecord(value.contentSummary) || !isRecord(value.entityRevisions) || !Array.isArray(value.tombstones)) return false;
  const summary = value.contentSummary;
  return ["tasks", "folders", "workLogs", "attachments", "attachmentBytes"].every((key) => typeof summary[key] === "number")
    && Object.values(value.entityRevisions).every((entry) => isRecord(entry) && typeof entry.revisionId === "string" && typeof entry.contentHash === "string")
    && value.tombstones.every((entry) => isRecord(entry) && typeof entry.deletionId === "string" && typeof entry.entityId === "string" && ["task", "folder", "worklog", "attachment"].includes(String(entry.entityType)) && typeof entry.deletedAt === "number");
}

function invalidResult(message: string): BackupImportResult {
  const state = hydrateState(null);
  return { state, workspace: emptyWorkspace(state), recovered: false, message, sourceVersion: 6 };
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

async function createSnapshotMetadata(snapshot: WorkspaceSnapshot, exportedAt: string): Promise<WorkspaceSnapshotMetadata> {
  const previous = snapshot.metadata;
  const snapshotId = randomId();
  const entityRevisions: Record<string, EntityRevisionMetadata> = {};
  const entities = [
    ...snapshot.state.tasks.map((value) => ["task", value] as const),
    ...snapshot.state.folders.map((value) => ["folder", value] as const),
    ...snapshot.workLogs.map((value) => ["worklog", value] as const),
    ...snapshot.attachments.map((value) => ["attachment", value] as const),
  ];
  for (const [kind, value] of entities) {
    const key = `${kind}:${value.id}`;
    const contentHash = await hashText(stableStringify(value));
    const prior = previous?.entityRevisions[key];
    entityRevisions[key] = prior?.contentHash === contentHash
      ? prior
      : {
          revisionId: randomId(),
          parentRevisionId: prior?.revisionId ?? null,
          createdAt: "createdAt" in value && typeof value.createdAt === "number" ? value.createdAt : Date.now(),
          updatedAt: "updatedAt" in value && typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
          contentHash,
        };
  }
  return {
    schemaVersion: 6,
    workspaceId: previous?.workspaceId ?? randomId(),
    snapshotId,
    parentSnapshotId: previous?.snapshotId ?? null,
    exportedAt,
    contentSummary: {
      tasks: snapshot.state.tasks.length,
      folders: snapshot.state.folders.length,
      workLogs: snapshot.workLogs.length,
      attachments: snapshot.attachments.length,
      attachmentBytes: snapshot.attachments.reduce((total, item) => total + item.size, 0),
    },
    entityRevisions,
    tombstones: previous?.tombstones ?? [],
  };
}

function manifestMetadata(manifest: BackupManifestV6): WorkspaceSnapshotMetadata {
  return {
    schemaVersion: 6,
    workspaceId: manifest.workspaceId,
    snapshotId: manifest.snapshotId,
    parentSnapshotId: manifest.parentSnapshotId,
    exportedAt: manifest.exportedAt,
    contentSummary: manifest.contentSummary,
    entityRevisions: manifest.entityRevisions,
    tombstones: manifest.tombstones,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function hashText(value: string): Promise<string> {
  return hashBlob(new Blob([value]));
}

async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

import type { AppState, AttachmentMeta, Folder, Task, WorkLog } from "./types.js";
import { hydrateState } from "./domain.js";
import type {
  DeletionTombstone,
  EntityRevisionMetadata,
  SnapshotEntityType,
  WorkspaceSnapshot,
} from "./workspace-backend.js";

export type MergeItemStatus = "new" | "safe-update" | "unchanged" | "suspected-duplicate" | "conflict" | "deletion";
export type MergeDecision = "keep-current" | "use-imported" | "keep-both" | "skip";

export interface MergePlanItem {
  key: string;
  entityType: SnapshotEntityType;
  entityId: string;
  label: string;
  status: MergeItemStatus;
  reason: string;
  defaultDecision: MergeDecision;
  allowedDecisions: MergeDecision[];
  matchedCurrentId?: string;
  tombstone?: DeletionTombstone;
}

export interface MergePlanSummary {
  added: number;
  updated: number;
  unchanged: number;
  suspectedDuplicates: number;
  conflicts: number;
  deletions: number;
}

export interface MergePlan {
  current: WorkspaceSnapshot;
  incoming: WorkspaceSnapshot;
  items: MergePlanItem[];
  summary: MergePlanSummary;
  compatibilityNotes: string[];
}

export interface MergeApplyResult {
  workspace: WorkspaceSnapshot;
  applied: number;
  skipped: number;
  conflictsKept: number;
}

export function analyzeMerge(current: WorkspaceSnapshot, incoming: WorkspaceSnapshot): MergePlan {
  const items: MergePlanItem[] = [];
  const compatibilityNotes: string[] = [];
  if (!incoming.metadata) compatibilityNotes.push("旧版备份缺少修订链信息；同标识但内容不同的项目将按冲突处理。");

  compareEntities("folder", current.state.folders, incoming.state.folders, current, incoming, items, folderLabel, findSimilarFolder);
  compareTasks(current, incoming, items);
  compareEntities("worklog", current.workLogs, incoming.workLogs, current, incoming, items, workLogLabel);
  compareAttachments(current, incoming, items);
  compareTombstones(current, incoming, items);

  const summary: MergePlanSummary = {
    added: count(items, "new"),
    updated: count(items, "safe-update"),
    unchanged: count(items, "unchanged"),
    suspectedDuplicates: count(items, "suspected-duplicate"),
    conflicts: count(items, "conflict"),
    deletions: count(items, "deletion"),
  };
  return { current, incoming, items, summary, compatibilityNotes };
}

export function applyMergePlan(plan: MergePlan, decisions: Readonly<Record<string, MergeDecision>> = {}): MergeApplyResult {
  const folderMap = new Map<string, string>();
  const taskMap = new Map<string, string>();
  const folders = [...plan.current.state.folders];
  const tasks = [...plan.current.state.tasks];
  const workLogs = [...plan.current.workLogs];
  const attachments = [...plan.current.attachments];
  const blobs = new Map(plan.current.attachmentBlobs);
  let applied = 0;
  let skipped = 0;
  let conflictsKept = 0;

  for (const item of plan.items.filter((entry) => entry.entityType === "folder" && !entry.tombstone)) {
    const incoming = plan.incoming.state.folders.find((entry) => entry.id === item.entityId)!;
    const decision = selectedDecision(item, decisions);
    const currentIndex = folders.findIndex((entry) => entry.id === item.entityId);
    if (decision === "use-imported") {
      const next = { ...incoming, parentId: remapNullable(incoming.parentId, folderMap) };
      if (currentIndex >= 0) folders[currentIndex] = next; else folders.push(next);
      folderMap.set(incoming.id, incoming.id);
      applied += item.status === "unchanged" ? 0 : 1;
    } else if (decision === "keep-both") {
      const candidate = { ...incoming, parentId: remapNullable(incoming.parentId, folderMap), createdAt: importedCreatedAt(incoming.updatedAt) };
      const copy = keepBothCopy("folder", incoming.id, item.key, folders, candidate);
      if (copy.alreadyApplied) skipped += 1; else { folders.push(copy.value); applied += 1; }
      folderMap.set(incoming.id, copy.value.id);
    } else {
      folderMap.set(incoming.id, item.matchedCurrentId ?? incoming.id);
      skipped += item.status === "unchanged" ? 0 : 1;
      if (item.status === "conflict") conflictsKept += 1;
    }
  }

  for (const item of plan.items.filter((entry) => entry.entityType === "task" && !entry.tombstone)) {
    const incoming = plan.incoming.state.tasks.find((entry) => entry.id === item.entityId)!;
    const decision = selectedDecision(item, decisions);
    const currentIndex = tasks.findIndex((entry) => entry.id === item.entityId);
    const current = currentIndex >= 0 ? tasks[currentIndex] : undefined;
    const folderId = remapNullable(incoming.folderId, folderMap);
    if (decision === "use-imported") {
      const next = { ...incoming, ...mergeTaskEvents(current, incoming, "incoming"), folderId };
      if (currentIndex >= 0) tasks[currentIndex] = next; else tasks.push(next);
      taskMap.set(incoming.id, incoming.id);
      applied += item.status === "unchanged" ? 0 : 1;
    } else if (decision === "keep-both") {
      const candidate = { ...incoming, folderId, createdAt: importedCreatedAt(incoming.updatedAt), updatedAt: importedCreatedAt(incoming.updatedAt) };
      const copy = keepBothCopy("task", incoming.id, item.key, tasks, candidate);
      if (copy.alreadyApplied) skipped += 1; else { tasks.push(copy.value); applied += 1; }
      taskMap.set(incoming.id, copy.value.id);
    } else {
      if (current && item.entityId === current.id) tasks[currentIndex] = { ...current, ...mergeTaskEvents(current, incoming, "current") };
      taskMap.set(incoming.id, item.matchedCurrentId ?? incoming.id);
      skipped += item.status === "unchanged" ? 0 : 1;
      if (item.status === "conflict") conflictsKept += 1;
    }
  }

  const availableTaskIds = new Set(tasks.map((task) => task.id));
  for (const item of plan.items.filter((entry) => entry.entityType === "worklog" && !entry.tombstone)) {
    const incoming = plan.incoming.workLogs.find((entry) => entry.id === item.entityId)!;
    const decision = selectedDecision(item, decisions);
    const taskId = taskMap.get(incoming.taskId) ?? incoming.taskId;
    if (!availableTaskIds.has(taskId)) { skipped += 1; continue; }
    const currentIndex = workLogs.findIndex((entry) => entry.id === incoming.id);
    if (decision === "use-imported") {
      const next = { ...incoming, taskId };
      if (currentIndex >= 0) workLogs[currentIndex] = next; else workLogs.push(next);
      applied += item.status === "unchanged" ? 0 : 1;
    } else if (decision === "keep-both") {
      const candidate: Omit<WorkLog, "id"> = { ...incoming, taskId, conflictOrigin: "imported", updatedAt: importedCreatedAt(incoming.updatedAt) };
      const copy = keepBothCopy("worklog", incoming.id, item.key, workLogs, candidate);
      if (copy.alreadyApplied) skipped += 1; else { workLogs.push(copy.value); applied += 1; }
    } else {
      skipped += item.status === "unchanged" ? 0 : 1;
      if (item.status === "conflict") conflictsKept += 1;
    }
  }

  for (const item of plan.items.filter((entry) => entry.entityType === "attachment" && !entry.tombstone)) {
    const incoming = plan.incoming.attachments.find((entry) => entry.id === item.entityId)!;
    const decision = selectedDecision(item, decisions);
    const taskId = taskMap.get(incoming.taskId) ?? incoming.taskId;
    if (!availableTaskIds.has(taskId)) { skipped += 1; continue; }
    const sourceBlob = plan.incoming.attachmentBlobs.get(incoming.id);
    const currentIndex = attachments.findIndex((entry) => entry.id === incoming.id);
    if (decision === "use-imported" && sourceBlob) {
      const next = { ...incoming, taskId };
      if (currentIndex >= 0) attachments[currentIndex] = next; else attachments.push(next);
      blobs.set(next.id, sourceBlob);
      applied += item.status === "unchanged" ? 0 : 1;
    } else if (decision === "keep-both" && sourceBlob) {
      const candidate = { ...incoming, taskId, createdAt: importedCreatedAt(incoming.createdAt) };
      const copy = keepBothCopy("attachment", incoming.id, item.key, attachments, candidate);
      if (copy.alreadyApplied) skipped += 1; else { attachments.push(copy.value); blobs.set(copy.value.id, sourceBlob); applied += 1; }
    } else {
      skipped += item.status === "unchanged" ? 0 : 1;
      if (item.status === "conflict") conflictsKept += 1;
    }
  }

  applyDeletions(plan, decisions, folders, tasks, workLogs, attachments, blobs);
  const taskIds = new Set(tasks.map((task) => task.id));
  const folderIds = new Set(folders.map((folder) => folder.id));
  const state: AppState = hydrateState({
    ...plan.current.state,
    preferences: plan.current.state.preferences,
    folders: folders.filter((folder) => folder.parentId === null || folderIds.has(folder.parentId)),
    tasks: tasks.filter((task) => taskIds.has(task.id) && (task.folderId === null || folderIds.has(task.folderId))),
  });
  const workspace: WorkspaceSnapshot = {
      state,
      workLogs: workLogs.filter((record) => taskIds.has(record.taskId)),
      attachments: attachments.filter((meta) => taskIds.has(meta.taskId)),
      attachmentBlobs: blobs,
  };
  workspace.metadata = materializeMetadata(plan, workspace);
  return {
    workspace,
    applied,
    skipped,
    conflictsKept,
  };
}

function materializeMetadata(plan: MergePlan, workspace: WorkspaceSnapshot): NonNullable<WorkspaceSnapshot["metadata"]> {
  const currentMetadata = plan.current.metadata;
  const incomingMetadata = plan.incoming.metadata;
  const entities = [
    ...workspace.state.tasks.map((value) => ["task", value] as const),
    ...workspace.state.folders.map((value) => ["folder", value] as const),
    ...workspace.workLogs.map((value) => ["worklog", value] as const),
    ...workspace.attachments.map((value) => ["attachment", value] as const),
  ];
  const entityRevisions: Record<string, EntityRevisionMetadata> = {};
  for (const [entityType, value] of entities) {
    const key = entityKey(entityType, value.id);
    const finalHash = contentHash(value);
    const currentValue = entityValue(plan.current, entityType, value.id);
    const incomingValue = entityValue(plan.incoming, entityType, value.id);
    if (currentValue && contentHash(currentValue) === finalHash && currentMetadata?.entityRevisions[key]) {
      entityRevisions[key] = currentMetadata.entityRevisions[key];
    } else if (incomingValue && contentHash(incomingValue) === finalHash && incomingMetadata?.entityRevisions[key]) {
      entityRevisions[key] = incomingMetadata.entityRevisions[key];
    } else {
      const parent = currentMetadata?.entityRevisions[key] ?? incomingMetadata?.entityRevisions[key];
      entityRevisions[key] = {
        revisionId: `revision-${hashString(`${key}:${finalHash}`)}`,
        parentRevisionId: parent?.revisionId ?? null,
        createdAt: value.createdAt,
        updatedAt: "updatedAt" in value ? value.updatedAt : value.createdAt,
        contentHash: finalHash,
      };
    }
  }
  const existingKeys = new Set(entities.map(([type, value]) => entityKey(type, value.id)));
  const tombstones = [...currentMetadata?.tombstones ?? [], ...incomingMetadata?.tombstones ?? []]
    .filter((item, index, all) => !existingKeys.has(entityKey(item.entityType, item.entityId)) && all.findIndex((entry) => entry.deletionId === item.deletionId) === index);
  const snapshotSeed = stableStringify({ parent: currentMetadata?.snapshotId ?? null, revisions: entityRevisions, tombstones });
  return {
    schemaVersion: 6,
    workspaceId: currentMetadata?.workspaceId ?? incomingMetadata?.workspaceId ?? `workspace-${hashString(snapshotSeed)}`,
    snapshotId: `snapshot-${hashString(snapshotSeed)}`,
    parentSnapshotId: currentMetadata?.snapshotId ?? null,
    exportedAt: incomingMetadata?.exportedAt ?? currentMetadata?.exportedAt ?? new Date(0).toISOString(),
    contentSummary: {
      tasks: workspace.state.tasks.length,
      folders: workspace.state.folders.length,
      workLogs: workspace.workLogs.length,
      attachments: workspace.attachments.length,
      attachmentBytes: workspace.attachments.reduce((total, item) => total + item.size, 0),
    },
    entityRevisions,
    tombstones,
  };
}

function entityValue(snapshot: WorkspaceSnapshot, entityType: SnapshotEntityType, id: string): unknown {
  if (entityType === "task") return snapshot.state.tasks.find((item) => item.id === id);
  if (entityType === "folder") return snapshot.state.folders.find((item) => item.id === id);
  if (entityType === "worklog") return snapshot.workLogs.find((item) => item.id === id);
  return snapshot.attachments.find((item) => item.id === id);
}

function compareTasks(current: WorkspaceSnapshot, incoming: WorkspaceSnapshot, output: MergePlanItem[]): void {
  const currentById = new Map(current.state.tasks.map((item) => [item.id, item]));
  for (const item of incoming.state.tasks) {
    const key = entityKey("task", item.id);
    const existing = currentById.get(item.id);
    if (!existing) {
      const similar = findSimilarTask(item, current.state.tasks, current.state, incoming.state);
      if (similar) {
        const entry = planItem(key, "task", item.id, taskLabel(item), "suspected-duplicate", "标识不同，但名称、创建时间和位置高度相似。", "skip", ["skip", "use-imported", "keep-both"]);
        entry.matchedCurrentId = similar.id;
        output.push(entry);
      } else output.push(planItem(key, "task", item.id, taskLabel(item), "new", "当前工作区中不存在该标识。", "use-imported", ["use-imported", "skip"]));
      continue;
    }

    const eventConflict = hasEventConflict(existing.rescheduleHistory, item.rescheduleHistory)
      || hasEventConflict(existing.statusHistory, item.statusHistory);
    if (contentHash(existing) === contentHash(item)) {
      output.push(planItem(key, "task", item.id, taskLabel(item), "unchanged", "标识、字段和事件历史均相同。", "keep-current", ["keep-current"]));
    } else if (eventConflict) {
      output.push(planItem(key, "task", item.id, taskLabel(item), "conflict", "同一事件标识包含不同内容，需要明确选择版本。", "keep-current", ["keep-current", "use-imported", "keep-both"]));
    } else if (taskCoreHash(existing) === taskCoreHash(item)) {
      output.push(planItem(key, "task", item.id, taskLabel(item), "safe-update", "任务字段相同，导入项包含可按事件标识安全并入的新历史。", "use-imported", ["keep-current", "use-imported"]));
    } else if (isDirectRevision(current.metadata?.entityRevisions[key], incoming.metadata?.entityRevisions[key])) {
      output.push(planItem(key, "task", item.id, taskLabel(item), "safe-update", "修订链证明导入项是当前项的后继版本。", "use-imported", ["keep-current", "use-imported"]));
    } else {
      output.push(planItem(key, "task", item.id, taskLabel(item), "conflict", "同一任务标识包含不同字段内容，无法安全判定应保留哪一版。", "keep-current", ["keep-current", "use-imported", "keep-both"]));
    }
  }
}

function taskCoreHash(task: Task): string {
  const { rescheduleHistory: _rescheduleHistory, statusHistory: _statusHistory, ...core } = task;
  return contentHash(core);
}

function hasEventConflict<T extends { eventId: string }>(current: T[] = [], incoming: T[] = []): boolean {
  const currentById = new Map(current.map((event) => [event.eventId, event]));
  return incoming.some((event) => {
    const existing = currentById.get(event.eventId);
    return Boolean(existing && contentHash(existing) !== contentHash(event));
  });
}

function mergeTaskEvents(current: Task | undefined, incoming: Task, preferred: "current" | "incoming"): Pick<Task, "rescheduleHistory" | "statusHistory"> {
  return {
    rescheduleHistory: mergeEvents(current?.rescheduleHistory ?? [], incoming.rescheduleHistory ?? [], preferred),
    statusHistory: mergeEvents(current?.statusHistory ?? [], incoming.statusHistory ?? [], preferred),
  };
}

function mergeEvents<T extends { eventId: string; changedAt: number }>(current: T[], incoming: T[], preferred: "current" | "incoming"): T[] {
  const merged = new Map<string, T>();
  const ordered = preferred === "incoming" ? [current, incoming] : [incoming, current];
  for (const events of ordered) for (const event of events) merged.set(event.eventId, event);
  return [...merged.values()].sort((a, b) => a.changedAt - b.changedAt || a.eventId.localeCompare(b.eventId));
}

function compareEntities<T extends { id: string }>(
  entityType: SnapshotEntityType,
  currentItems: T[],
  incomingItems: T[],
  current: WorkspaceSnapshot,
  incoming: WorkspaceSnapshot,
  output: MergePlanItem[],
  label: (item: T) => string,
  findSimilar?: (item: T, currentItems: T[], currentState: AppState, incomingState: AppState) => T | undefined,
): void {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  for (const item of incomingItems) {
    const key = entityKey(entityType, item.id);
    const existing = currentById.get(item.id);
    if (existing) {
      if (contentHash(existing) === contentHash(item)) {
        output.push(planItem(key, entityType, item.id, label(item), "unchanged", "标识和内容均相同。", "keep-current", ["keep-current"]));
      } else if (isDirectRevision(current.metadata?.entityRevisions[key], incoming.metadata?.entityRevisions[key])) {
        output.push(planItem(key, entityType, item.id, label(item), "safe-update", "修订链证明导入项是当前项的后继版本。", "use-imported", ["keep-current", "use-imported"]));
      } else {
        output.push(planItem(key, entityType, item.id, label(item), "conflict", "同一标识包含不同内容，无法安全判定应保留哪一版。", "keep-current", ["keep-current", "use-imported", ...(entityType === "task" || entityType === "folder" || entityType === "worklog" ? ["keep-both" as const] : [])]));
      }
      continue;
    }
    const similar = findSimilar?.(item, currentItems, current.state, incoming.state);
    if (similar) {
      const entry = planItem(key, entityType, item.id, label(item), "suspected-duplicate", "标识不同，但名称、创建时间和位置高度相似。", "skip", ["skip", "use-imported", "keep-both"]);
      entry.matchedCurrentId = similar.id;
      output.push(entry);
    } else {
      output.push(planItem(key, entityType, item.id, label(item), "new", "当前工作区中不存在该标识。", "use-imported", ["use-imported", "skip"]));
    }
  }
}

function compareAttachments(current: WorkspaceSnapshot, incoming: WorkspaceSnapshot, output: MergePlanItem[]): void {
  const currentById = new Map(current.attachments.map((item) => [item.id, item]));
  const currentByHash = new Map(current.attachments.filter((item) => item.contentHash).map((item) => [item.contentHash!, item]));
  for (const item of incoming.attachments) {
    const key = entityKey("attachment", item.id);
    const existing = currentById.get(item.id);
    if (existing) {
      if (attachmentHash(existing) === attachmentHash(item)) output.push(planItem(key, "attachment", item.id, item.name, "unchanged", "附件标识和内容哈希相同。", "keep-current", ["keep-current"]));
      else output.push(planItem(key, "attachment", item.id, item.name, "conflict", "同一附件标识对应不同内容。", "keep-current", ["keep-current", "use-imported", "keep-both"]));
      continue;
    }
    const duplicate = item.contentHash ? currentByHash.get(item.contentHash) : undefined;
    if (duplicate) {
      const entry = planItem(key, "attachment", item.id, item.name, "unchanged", `内容与现有附件“${duplicate.name}”相同，按哈希去重。`, "skip", ["skip"]);
      entry.matchedCurrentId = duplicate.id;
      output.push(entry);
    } else output.push(planItem(key, "attachment", item.id, item.name, "new", "附件内容在当前工作区中不存在。", "use-imported", ["use-imported", "skip"]));
  }
}

function compareTombstones(current: WorkspaceSnapshot, incoming: WorkspaceSnapshot, output: MergePlanItem[]): void {
  const currentIds = new Set([
    ...current.state.tasks.map((item) => entityKey("task", item.id)),
    ...current.state.folders.map((item) => entityKey("folder", item.id)),
    ...current.workLogs.map((item) => entityKey("worklog", item.id)),
    ...current.attachments.map((item) => entityKey("attachment", item.id)),
  ]);
  for (const tombstone of incoming.metadata?.tombstones ?? []) {
    const key = entityKey(tombstone.entityType, tombstone.entityId);
    if (!currentIds.has(key)) continue;
    output.push({
      ...planItem(`delete:${key}`, tombstone.entityType, tombstone.entityId, `删除 ${tombstone.entityId}`, "deletion", "导入备份记录了删除操作；默认保留当前内容。", "keep-current", ["keep-current", "use-imported"]),
      tombstone,
    });
  }
}

function applyDeletions(plan: MergePlan, decisions: Readonly<Record<string, MergeDecision>>, folders: Folder[], tasks: Task[], workLogs: WorkLog[], attachments: AttachmentMeta[], blobs: Map<string, Blob>): void {
  for (const item of plan.items.filter((entry) => entry.tombstone && selectedDecision(entry, decisions) === "use-imported")) {
    const id = item.entityId;
    if (item.entityType === "task") removeById(tasks, id);
    if (item.entityType === "folder") removeById(folders, id);
    if (item.entityType === "worklog") removeById(workLogs, id);
    if (item.entityType === "attachment") { removeById(attachments, id); blobs.delete(id); }
  }
  const taskIds = new Set(tasks.map((item) => item.id));
  for (let index = workLogs.length - 1; index >= 0; index -= 1) {
    const record = workLogs[index];
    if (record && !taskIds.has(record.taskId)) workLogs.splice(index, 1);
  }
  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    const attachment = attachments[index];
    if (attachment && !taskIds.has(attachment.taskId)) { blobs.delete(attachment.id); attachments.splice(index, 1); }
  }
}

function selectedDecision(item: MergePlanItem, decisions: Readonly<Record<string, MergeDecision>>): MergeDecision {
  const selected = decisions[item.key] ?? item.defaultDecision;
  return item.allowedDecisions.includes(selected) ? selected : item.defaultDecision;
}

function findSimilarTask(item: Task, currentItems: Task[], currentState: AppState, incomingState: AppState): Task | undefined {
  const path = folderPath(item.folderId, incomingState.folders);
  return currentItems.find((candidate) => candidate.createdAt === item.createdAt && normalize(candidate.title) === normalize(item.title) && folderPath(candidate.folderId, currentState.folders) === path);
}

function findSimilarFolder(item: Folder, currentItems: Folder[], currentState: AppState, incomingState: AppState): Folder | undefined {
  const parentPath = folderPath(item.parentId, incomingState.folders);
  return currentItems.find((candidate) => candidate.createdAt === item.createdAt && normalize(candidate.name) === normalize(item.name) && folderPath(candidate.parentId, currentState.folders) === parentPath);
}

function folderPath(id: string | null, folders: Folder[]): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = id;
  while (current && !visited.has(current)) {
    visited.add(current);
    const folder = byId.get(current);
    if (!folder) break;
    names.unshift(normalize(folder.name));
    current = folder.parentId;
  }
  return names.join("/");
}

function isDirectRevision(current: EntityRevisionMetadata | undefined, incoming: EntityRevisionMetadata | undefined): boolean {
  return Boolean(current && incoming && incoming.parentRevisionId === current.revisionId);
}

function contentHash(value: unknown): string {
  return hashString(stableStringify(value));
}

function attachmentHash(value: AttachmentMeta): string {
  return value.contentHash ?? contentHash(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function importedId(kind: SnapshotEntityType, id: string, key: string): string {
  return `${kind}-imported-${hashString(`${id}:${key}`)}`;
}

// TEST-V08-009：keep-both 副本生成必须是幂等的。确定性基础 ID 已存在时：
// 内容相同视为已应用（跳过）；内容不同则生成受内容哈希区分的新冲突 ID。
function keepBothCopy<T extends { id: string }>(kind: SnapshotEntityType, incomingId: string, key: string, collection: ReadonlyArray<T>, candidate: Omit<T, "id">): { value: T; alreadyApplied: boolean } {
  const base = importedId(kind, incomingId, key);
  const byId = new Map(collection.map((entry) => [entry.id, entry]));
  const baseValue = { ...candidate, id: base } as T;
  const existing = byId.get(base);
  if (!existing) return { value: baseValue, alreadyApplied: false };
  if (copyContentHash(existing) === copyContentHash(baseValue)) return { value: baseValue, alreadyApplied: true };
  let discriminator = copyContentHash(baseValue);
  let nextId = `${kind}-imported-${hashString(`${incomingId}:${key}`)}-${discriminator}`;
  while (byId.has(nextId) && copyContentHash(byId.get(nextId) as T) !== copyContentHash(baseValue)) {
    discriminator = hashString(`${discriminator}:next`);
    nextId = `${kind}-imported-${hashString(`${incomingId}:${key}`)}-${discriminator}`;
  }
  return { value: { ...baseValue, id: nextId } as T, alreadyApplied: byId.has(nextId) };
}

// 副本内容指纹不包含 id 与 order：id 由 keepBothCopy 生成，order 会在 hydrateState 中按位置重新归一化。
function copyContentHash(value: { id: string; order?: number }): string {
  const { id: _id, order: _order, ...withoutId } = value;
  return contentHash(withoutId);
}

function importedCreatedAt(updatedAt: number): number {
  return Math.max(1, updatedAt + 1);
}

function remapNullable(id: string | null, mapping: Map<string, string>): string | null {
  return id === null ? null : mapping.get(id) ?? id;
}

function removeById(items: Array<{ id: string }>, id: string): void {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) items.splice(index, 1);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function entityKey(type: SnapshotEntityType, id: string): string {
  return `${type}:${id}`;
}

function taskLabel(item: Task): string { return item.title; }
function folderLabel(item: Folder): string { return item.name; }
function workLogLabel(item: WorkLog): string { return `${item.workDate} 工作记录`; }

function count(items: MergePlanItem[], status: MergeItemStatus): number {
  return items.filter((item) => item.status === status).length;
}

function planItem(key: string, entityType: SnapshotEntityType, entityId: string, label: string, status: MergeItemStatus, reason: string, defaultDecision: MergeDecision, allowedDecisions: MergeDecision[]): MergePlanItem {
  return { key, entityType, entityId, label, status, reason, defaultDecision, allowedDecisions };
}

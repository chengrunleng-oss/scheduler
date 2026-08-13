import type {
  AppState,
  DefaultTaskDueDate,
  Folder,
  FolderDraft,
  FolderScope,
  PendingResolution,
  Preferences,
  Priority,
  RescheduleRecord,
  RescheduleSource,
  Task,
  TaskDraft,
  TaskFilter,
  TaskStatus,
  ThemeMode,
  ViewMode,
} from "./types.js";

export const SCHEMA_VERSION = 5;
export const DEFAULT_WORKSPACE_WIDTH = 620;
export const MAX_FOLDER_DEPTH = 4;

export const PRIORITY_LABELS: Record<Priority, string> = { high: "高", low: "低" };
export const STATUS_LABELS: Record<TaskStatus, string> = {
  active: "待办",
  completed: "已完成",
  discarded: "不再需要",
};
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, low: 1 };

type UnknownRecord = Record<string, unknown>;

export interface BackupValidation {
  valid: boolean;
  message: string;
  kind?: "current" | "v4" | "v3" | "v2" | "legacy";
}

export type DueDateGroup = "overdue" | "today" | "next_seven_days" | "later" | "unscheduled";

export function createDefaultState(now = Date.now()): AppState {
  const today = toISODate(now);
  const workFolder = createFolder({ name: "工作", parentId: null }, now - 2_000, "folder-work", 0);
  const personalFolder = createFolder({ name: "个人", parentId: null }, now - 1_000, "folder-personal", 1);
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: {
      activeStatusFilter: "all",
      theme: "system",
      viewMode: "tree_manual",
      folderScope: "all",
      defaultTaskDueDate: "today",
      defaultTaskPriority: "low",
      expandedHandledContainers: [],
      navigationCollapsedFolders: [],
      workspaceWidth: DEFAULT_WORKSPACE_WIDTH,
    },
    folders: [workFolder, personalFolder],
    tasks: [
      createTask(
        {
          title: "确定今天最重要的一件事",
          notes: "写下明确结果，并安排第一个可执行步骤。",
          priority: "high",
          dueDate: today,
          tag: "重点",
          status: "active",
          folderId: workFolder.id,
        },
        now - 7_200_000,
        "task-1",
        0,
      ),
      createTask(
        {
          title: "安排一段不被打扰的专注时间",
          notes: "",
          priority: "low",
          dueDate: "",
          tag: "日常",
          status: "active",
          folderId: personalFolder.id,
        },
        now - 3_600_000,
        "task-2",
        0,
      ),
    ],
  };
}

export function createEmptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: {
      activeStatusFilter: "all",
      theme: "system",
      viewMode: "tree_manual",
      folderScope: "all",
      defaultTaskDueDate: "today",
      defaultTaskPriority: "low",
      expandedHandledContainers: [],
      navigationCollapsedFolders: [],
      workspaceWidth: DEFAULT_WORKSPACE_WIDTH,
    },
    folders: [],
    tasks: [],
  };
}

export function createTask(draft: TaskDraft, now = Date.now(), id = createId("task", now), order = 0): Task {
  const status = coerceTaskStatus(draft.status);
  return {
    id,
    title: normalizeText(draft.title),
    notes: normalizeMultiline(draft.notes),
    descriptionMarkdown: "",
    priority: coercePriority(draft.priority),
    dueDate: normalizeDate(draft.dueDate),
    tag: normalizeText(draft.tag),
    status,
    folderId: normalizeNullableId(draft.folderId),
    order: coerceOrder(order),
    resolvedAt: status === "active" ? null : now,
    pendingResolution: null,
    rescheduleHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTask(task: Task, draft: TaskDraft, now = Date.now(), order = task.order): Task {
  const status = coerceTaskStatus(draft.status);
  return {
    ...task,
    title: normalizeText(draft.title),
    notes: normalizeMultiline(draft.notes),
    priority: coercePriority(draft.priority),
    dueDate: normalizeDate(draft.dueDate),
    tag: normalizeText(draft.tag),
    status,
    folderId: normalizeNullableId(draft.folderId),
    order: coerceOrder(order),
    resolvedAt: status === "active" ? null : task.resolvedAt ?? now,
    pendingResolution: status === task.status ? task.pendingResolution : null,
    updatedAt: now,
  };
}

export function taskMatchesDraft(task: Task, draft: TaskDraft): boolean {
  return (
    task.title === normalizeText(draft.title) &&
    task.notes === normalizeMultiline(draft.notes) &&
    task.priority === coercePriority(draft.priority) &&
    task.dueDate === normalizeDate(draft.dueDate) &&
    task.tag === normalizeText(draft.tag) &&
    task.status === coerceTaskStatus(draft.status) &&
    task.folderId === normalizeNullableId(draft.folderId)
  );
}

export function createFolder(draft: FolderDraft, now = Date.now(), id = createId("folder", now), order = 0): Folder {
  return {
    id,
    name: normalizeText(draft.name),
    parentId: normalizeNullableId(draft.parentId),
    order: coerceOrder(order),
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createId(prefix: string, now = Date.now()): string {
  return `${prefix}-${now}-${Math.random().toString(16).slice(2, 10)}`;
}

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeMultiline(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

export function normalizeDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function normalizeNullableId(value: unknown): string | null {
  return normalizeText(value) || null;
}

export function coercePriority(value: unknown): Priority {
  return value === "high" || value === "高" ? "high" : "low";
}

export function coerceTaskStatus(value: unknown): TaskStatus {
  return value === "completed" || value === "discarded" ? value : "active";
}

export function coerceFilter(value: unknown): TaskFilter {
  if (value === "active" || value === "completed" || value === "discarded" || value === "all") return value;
  if (value === "open") return "active";
  if (value === "done") return "completed";
  return "all";
}

export function coerceTheme(value: unknown): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

export function coerceViewMode(value: unknown): ViewMode {
  if (value === "global_priority" || value === "priority") return "global_priority";
  if (value === "global_due_date" || value === "due_date") return "global_due_date";
  if (value === "priority_then_due_date") return value;
  return "tree_manual";
}

export function coerceDefaultDueDate(value: unknown): DefaultTaskDueDate {
  if (value === "tomorrow" || value === "next_workday" || value === "none") return value;
  return "today";
}

export function priorityRank(priority: Priority): number {
  return PRIORITY_RANK[priority];
}

export function toISODate(value: number | Date = Date.now()): string {
  const date = typeof value === "number" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function resolveDefaultDueDate(value: DefaultTaskDueDate, now = Date.now()): string {
  const today = toISODate(now);
  if (value === "none") return "";
  if (value === "tomorrow") return addDays(today, 1);
  if (value === "next_workday") {
    let next = new Date(`${addDays(today, 1)}T00:00:00`);
    while (next.getDay() === 0 || next.getDay() === 6) next = new Date(`${addDays(toISODate(next), 1)}T00:00:00`);
    return toISODate(next);
  }
  return today;
}

export function isOverdue(task: Task, todayISO = toISODate()): boolean {
  return isEffectivelyActive(task) && Boolean(task.dueDate) && task.dueDate < todayISO;
}

export function isDueOrOverdue(task: Task, todayISO = toISODate()): boolean {
  return isEffectivelyActive(task) && Boolean(task.dueDate) && task.dueDate <= todayISO;
}

export function overdueDays(task: Task, todayISO = toISODate()): number {
  if (!task.dueDate || task.dueDate >= todayISO) return 0;
  const elapsed = new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${task.dueDate}T00:00:00`).getTime();
  return Math.max(1, Math.round(elapsed / 86_400_000));
}

export function dueDateGroup(task: Task, todayISO = toISODate()): DueDateGroup {
  if (!task.dueDate) return "unscheduled";
  if (task.dueDate < todayISO) return "overdue";
  if (task.dueDate === todayISO) return "today";
  return task.dueDate <= addDays(todayISO, 7) ? "next_seven_days" : "later";
}

export function getFolderDescendantIds(folders: Folder[], folderId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const folder of folders) {
      if (folder.parentId === parentId && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return descendants;
}

export function getFolderDepth(folders: Folder[], folderId: string | null): number {
  if (!folderId) return 0;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  let currentId: string | null = folderId;
  let depth = 0;
  while (currentId) {
    if (visited.has(currentId)) return Number.POSITIVE_INFINITY;
    visited.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) return Number.POSITIVE_INFINITY;
    depth += 1;
    currentId = folder.parentId;
  }
  return depth;
}

export function getFolderPath(folders: Folder[], folderId: string | null): string {
  if (!folderId) return "未分类";
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" / ") || "未分类";
}

export function getFolderAncestorIds(folders: Folder[], folderId: string | null): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ids: string[] = [];
  let current = folderId ? byId.get(folderId) : undefined;
  while (current) {
    ids.unshift(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return ids;
}

export function canMoveFolder(folders: Folder[], folderId: string, parentId: string | null): boolean {
  if (!folders.some((item) => item.id === folderId) || parentId === folderId) return false;
  if (parentId && !folders.some((item) => item.id === parentId)) return false;
  if (getFolderDescendantIds(folders, folderId).has(parentId ?? "")) return false;
  const baseDepth = getFolderDepth(folders, parentId) + 1;
  let subtreeHeight = 1;
  for (const descendantId of getFolderDescendantIds(folders, folderId)) {
    subtreeHeight = Math.max(subtreeHeight, getRelativeFolderDepth(folders, descendantId, folderId) + 1);
  }
  return Number.isFinite(baseDepth) && baseDepth + subtreeHeight - 1 <= MAX_FOLDER_DEPTH;
}

export function canAddFolder(folders: Folder[], parentId: string | null): boolean {
  return (!parentId || folders.some((folder) => folder.id === parentId)) && getFolderDepth(folders, parentId) + 1 <= MAX_FOLDER_DEPTH;
}

export function selectVisibleTasks(state: AppState, query: string): Task[] {
  const normalizedQuery = normalizeText(query).toLowerCase();
  const scopedFolderIds = getScopedFolderIds(state.folders, state.preferences.folderScope);
  return state.tasks
    .filter((task) => {
      const effectiveStatus = task.pendingResolution ? "active" : task.status;
      const matchesStatus = state.preferences.activeStatusFilter === "all" || effectiveStatus === state.preferences.activeStatusFilter;
      const matchesScope =
        state.preferences.folderScope === "all" ||
        (state.preferences.folderScope === "root"
          ? task.folderId === null
          : Boolean(task.folderId && scopedFolderIds.has(task.folderId)));
      const haystack = `${task.title} ${task.notes} ${task.tag} ${PRIORITY_LABELS[task.priority]} ${STATUS_LABELS[task.status]}`.toLowerCase();
      return matchesStatus && matchesScope && (!normalizedQuery || haystack.includes(normalizedQuery));
    })
    .sort(taskComparator(state.preferences.viewMode));
}

function isEffectivelyActive(task: Task): boolean {
  return task.status === "active" || Boolean(task.pendingResolution);
}

export function taskComparator(viewMode: ViewMode): (a: Task, b: Task) => number {
  return (a, b) => {
    if (viewMode === "global_due_date") return compareDueDates(a, b) || priorityRank(a.priority) - priorityRank(b.priority) || stableTaskOrder(a, b);
    if (viewMode === "priority_then_due_date") return priorityRank(a.priority) - priorityRank(b.priority) || compareDueDates(a, b) || stableTaskOrder(a, b);
    if (viewMode === "global_priority") return priorityRank(a.priority) - priorityRank(b.priority) || stableTaskOrder(a, b);
    return stableTaskOrder(a, b);
  };
}

export function hydrateState(input: unknown, now = Date.now()): AppState {
  if (!isRecord(input)) return createDefaultState(now);
  if (input.schemaVersion === 5 || input.schemaVersion === 4 || input.schemaVersion === 3 || Array.isArray(input.folders)) return hydrateStructuredState(input, now);
  return migrateLegacyState(input, now);
}

export function validateBackupPayload(input: unknown): BackupValidation {
  return validatePayload(input, "备份文件");
}

export function validateStoredPayload(input: unknown): BackupValidation {
  return validatePayload(input, "本地数据");
}

function validatePayload(input: unknown, sourceLabel: string): BackupValidation {
  if (!isRecord(input)) return invalid(sourceLabel, "根节点必须是对象。");
  if (input.schemaVersion === 5) {
    if (!isRecord(input.preferences) || !isValidV5Preferences(input.preferences)) return invalid(sourceLabel, "preferences 中存在无效偏好设置。");
    if (!Array.isArray(input.tasks) || input.tasks.some((task) => !isValidV5Task(task))) return invalid(sourceLabel, "tasks 中存在无效任务。");
    if (!Array.isArray(input.folders) || input.folders.some((folder) => !isValidFolder(folder))) return invalid(sourceLabel, "folders 中存在无效文件夹。");
    return { valid: true, message: "", kind: "current" };
  }
  if (input.schemaVersion === 4) {
    if (!isRecord(input.preferences) || !isValidV4Preferences(input.preferences)) return invalid(sourceLabel, "preferences 中存在无效偏好设置。");
    if (!Array.isArray(input.tasks) || input.tasks.some((task) => !isValidV4Task(task))) return invalid(sourceLabel, "tasks 中存在无效任务。");
    if (!Array.isArray(input.folders) || input.folders.some((folder) => !isValidFolder(folder))) return invalid(sourceLabel, "folders 中存在无效文件夹。");
    return { valid: true, message: "", kind: "v4" };
  }
  if (input.schemaVersion === 3 && isRecord(input.preferences) && Array.isArray(input.tasks) && Array.isArray(input.folders)) {
    if (input.tasks.some((task) => !isValidV3Task(task)) || input.folders.some((folder) => !isValidFolder(folder))) return invalid(sourceLabel, "v3 数据结构不完整。");
    return { valid: true, message: "", kind: "v3" };
  }
  if (isV2Payload(input)) return { valid: true, message: "", kind: "v2" };
  if (isLegacyBackupPayload(input)) return { valid: true, message: "", kind: "legacy" };
  return invalid(sourceLabel, "缺少可迁移的任务数据。");
}

function invalid(sourceLabel: string, detail: string): BackupValidation {
  return { valid: false, message: `${sourceLabel}结构无效：${detail}` };
}

function hydrateStructuredState(source: UnknownRecord, now: number): AppState {
  const rawFolders = Array.isArray(source.folders)
    ? source.folders.map((value, index) => hydrateFolder(value, now + index)).filter(isFolder)
    : [];
  const folders = sanitizeFolders(uniqueById(rawFolders));
  const folderIds = new Set(folders.map((folder) => folder.id));
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map((value, index) => hydrateTask(value, now + index, index, folderIds)).filter(isTask)
    : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: hydratePreferences(source.preferences, source, folderIds),
    folders,
    tasks: normalizeTaskOrders(uniqueById(tasks)),
  };
}

function migrateLegacyState(source: UnknownRecord, now: number): AppState {
  const sourcePreferences = isRecord(source.preferences) ? source.preferences : source;
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map((value, index) => migrateLegacyTask(value, now + index, index)).filter(isTask)
    : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: {
      activeStatusFilter: coerceFilter(sourcePreferences.activeStatusFilter ?? sourcePreferences.activeFilter),
      theme: coerceTheme(sourcePreferences.theme),
      viewMode: "tree_manual",
      folderScope: "all",
      defaultTaskDueDate: "today",
      defaultTaskPriority: "low",
      expandedHandledContainers: [],
      navigationCollapsedFolders: [],
      workspaceWidth: DEFAULT_WORKSPACE_WIDTH,
    },
    folders: [],
    tasks: normalizeTaskOrders(uniqueById(tasks)),
  };
}

function hydratePreferences(value: unknown, legacyRoot: UnknownRecord, folderIds: Set<string>): Preferences {
  const source = isRecord(value) ? value : legacyRoot;
  const rawScope = normalizeText(source.folderScope);
  const folderScope: FolderScope = rawScope === "root" || rawScope === "all" || folderIds.has(rawScope) ? rawScope : "all";
  return {
    activeStatusFilter: coerceFilter(source.activeStatusFilter ?? source.activeFilter),
    theme: coerceTheme(source.theme),
    viewMode: coerceViewMode(source.viewMode),
    folderScope,
    defaultTaskDueDate: coerceDefaultDueDate(source.defaultTaskDueDate),
    defaultTaskPriority: coercePriority(source.defaultTaskPriority),
    expandedHandledContainers: stringArray(source.expandedHandledContainers).filter((id) => id === "root" || folderIds.has(id)),
    navigationCollapsedFolders: stringArray(source.navigationCollapsedFolders).filter((id) => folderIds.has(id)),
    workspaceWidth: coerceWorkspaceWidth(source.workspaceWidth),
  };
}

function hydrateTask(value: unknown, now: number, fallbackOrder: number, folderIds: Set<string>): Task | null {
  if (!isRecord(value)) return null;
  const title = normalizeText(value.title);
  if (!title) return null;
  const createdAt = toTimestamp(value.createdAt, now);
  const updatedAt = toTimestamp(value.updatedAt, createdAt);
  const folderId = normalizeNullableId(value.folderId);
  const status = isTaskStatus(value.status) ? value.status : Boolean(value.done) ? "completed" : "active";
  const pendingResolution = hydratePendingResolution(value.pendingResolution, status);
  return {
    id: normalizeText(value.id) || createId("task", now),
    title,
    notes: normalizeMultiline(value.notes),
    descriptionMarkdown: normalizeMarkdown(value.descriptionMarkdown),
    priority: coercePriority(value.priority),
    dueDate: normalizeDate(value.dueDate) || normalizeDate(value.date),
    tag: normalizeText(value.tag),
    status,
    folderId: folderId && folderIds.has(folderId) ? folderId : null,
    order: coerceOrder(value.order, fallbackOrder),
    resolvedAt: status === "active" || pendingResolution ? null : toTimestamp(value.resolvedAt, updatedAt),
    pendingResolution,
    rescheduleHistory: hydrateRescheduleHistory(value.rescheduleHistory),
    createdAt,
    updatedAt,
  };
}

function migrateLegacyTask(value: unknown, now: number, order: number): Task | null {
  if (!isRecord(value) || !normalizeText(value.title)) return null;
  const createdAt = toTimestamp(value.createdAt, now);
  const status: TaskStatus = Boolean(value.done) ? "completed" : "active";
  const updatedAt = toTimestamp(value.updatedAt, createdAt);
  return {
    id: normalizeText(value.id) || createId("task", now),
    title: normalizeText(value.title),
    notes: normalizeMultiline(value.notes),
    descriptionMarkdown: "",
    priority: coercePriority(value.priority),
    dueDate: normalizeDate(value.dueDate) || normalizeDate(value.date),
    tag: normalizeText(value.tag),
    status,
    folderId: null,
    order,
    resolvedAt: status === "active" ? null : updatedAt,
    pendingResolution: null,
    rescheduleHistory: [],
    createdAt,
    updatedAt,
  };
}

function hydratePendingResolution(value: unknown, status: TaskStatus): PendingResolution | null {
  if (!isRecord(value) || status === "active") return null;
  if (value.targetStatus !== "completed" && value.targetStatus !== "discarded") return null;
  if (typeof value.executeAt !== "number" || !Number.isFinite(value.executeAt)) return null;
  return {
    targetStatus: value.targetStatus,
    executeAt: value.executeAt,
    originFolderId: normalizeNullableId(value.originFolderId),
    originOrder: coerceOrder(value.originOrder),
    originPriority: coercePriority(value.originPriority),
  };
}

function hydrateRescheduleHistory(value: unknown): RescheduleRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RescheduleRecord[] => {
    if (!isRecord(item)) return [];
    const fromDate = normalizeDate(item.fromDate);
    const toDate = normalizeDate(item.toDate);
    if (!toDate || typeof item.changedAt !== "number" || !Number.isFinite(item.changedAt)) return [];
    const source: RescheduleSource = item.source === "detail" ? "detail" : "quick";
    return [{ fromDate, toDate, changedAt: item.changedAt, reason: normalizeText(item.reason), source }];
  });
}

function hydrateFolder(value: unknown, now: number): Folder | null {
  if (!isRecord(value) || !normalizeText(value.name)) return null;
  const createdAt = toTimestamp(value.createdAt, now);
  return {
    id: normalizeText(value.id) || createId("folder", now),
    name: normalizeText(value.name),
    parentId: normalizeNullableId(value.parentId),
    order: coerceOrder(value.order),
    collapsed: Boolean(value.collapsed),
    createdAt,
    updatedAt: toTimestamp(value.updatedAt, createdAt),
  };
}

function normalizeTaskOrders(tasks: Task[]): Task[] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.folderId ?? "__root__";
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  const orderById = new Map<string, number>();
  for (const group of groups.values()) {
    group
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || stableTaskOrder(a, b))
      .forEach((task, index) => orderById.set(task.id, index));
  }
  return tasks.map((task) => ({ ...task, order: orderById.get(task.id) ?? task.order }));
}

function sanitizeFolders(folders: Folder[]): Folder[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const sanitized = folders.map((folder) => ({
    ...folder,
    parentId: folder.parentId && folder.parentId !== folder.id && ids.has(folder.parentId) ? folder.parentId : null,
  }));
  return sanitized.map((folder) => {
    const depth = getFolderDepth(sanitized, folder.id);
    return Number.isFinite(depth) && depth <= MAX_FOLDER_DEPTH ? folder : { ...folder, parentId: null };
  });
}

function getScopedFolderIds(folders: Folder[], scope: FolderScope): Set<string> {
  return scope === "all" || scope === "root" ? new Set() : new Set([scope, ...getFolderDescendantIds(folders, scope)]);
}

function getRelativeFolderDepth(folders: Folder[], folderId: string, ancestorId: string): number {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(folderId);
  let depth = 0;
  while (current && current.id !== ancestorId) {
    depth += 1;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return current?.id === ancestorId ? depth : Number.POSITIVE_INFINITY;
}

function compareDueDates(a: Task, b: Task): number {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function stableTaskOrder(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function coerceOrder(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function toTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}

function isValidV4Task(value: unknown): boolean {
  if (!isValidV3Task(value) || !isRecord(value)) return false;
  if (value.priority !== "high" && value.priority !== "low") return false;
  if (value.resolvedAt !== null && (typeof value.resolvedAt !== "number" || !Number.isFinite(value.resolvedAt))) return false;
  if (value.pendingResolution !== null && !hydratePendingResolution(value.pendingResolution, coerceTaskStatus(value.status))) return false;
  return Array.isArray(value.rescheduleHistory) && hydrateRescheduleHistory(value.rescheduleHistory).length === value.rescheduleHistory.length;
}

function isValidV5Task(value: unknown): boolean {
  return isValidV4Task(value) && isRecord(value) && typeof value.descriptionMarkdown === "string";
}

function isValidV3Task(value: unknown): boolean {
  if (!isRecord(value) || !normalizeText(value.id) || !normalizeText(value.title)) return false;
  if (!(value.priority === "high" || value.priority === "medium" || value.priority === "low") || !isTaskStatus(value.status)) return false;
  if (typeof value.notes !== "string" || typeof value.dueDate !== "string" || typeof value.tag !== "string") return false;
  if (value.dueDate && !normalizeDate(value.dueDate)) return false;
  if (value.folderId !== null && typeof value.folderId !== "string") return false;
  return [value.order, value.createdAt, value.updatedAt].every((item) => typeof item === "number" && Number.isFinite(item));
}

function isValidFolder(value: unknown): boolean {
  if (!isRecord(value) || !normalizeText(value.id) || !normalizeText(value.name)) return false;
  if (value.parentId !== null && typeof value.parentId !== "string") return false;
  return typeof value.collapsed === "boolean" && [value.order, value.createdAt, value.updatedAt].every((item) => typeof item === "number" && Number.isFinite(item));
}

function isValidV4Preferences(value: UnknownRecord): boolean {
  return (
    (value.activeStatusFilter === "all" || isTaskStatus(value.activeStatusFilter)) &&
    (value.theme === "system" || value.theme === "light" || value.theme === "dark") &&
    ["tree_manual", "global_priority", "global_due_date", "priority_then_due_date"].includes(String(value.viewMode)) &&
    typeof value.folderScope === "string" &&
    ["today", "tomorrow", "next_workday", "none"].includes(String(value.defaultTaskDueDate)) &&
    (value.defaultTaskPriority === "high" || value.defaultTaskPriority === "low") &&
    Array.isArray(value.expandedHandledContainers) &&
    Array.isArray(value.navigationCollapsedFolders)
  );
}

function isValidV5Preferences(value: UnknownRecord): boolean {
  return isValidV4Preferences(value) && typeof value.workspaceWidth === "number" && value.workspaceWidth >= 560 && value.workspaceWidth <= 680;
}

function coerceWorkspaceWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(560, Math.min(680, Math.round(value))) : DEFAULT_WORKSPACE_WIDTH;
}

function normalizeMarkdown(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : "";
}

function isV2Payload(input: UnknownRecord): boolean {
  return input.schemaVersion === 2 && isRecord(input.preferences) && Array.isArray(input.tasks) && isRecord(input.currentIteration) && input.tasks.every(isLegacyTask);
}

function isLegacyBackupPayload(input: UnknownRecord): boolean {
  if (isRecord(input.preferences) || !Array.isArray(input.tasks) || !isRecord(input.currentIteration)) return false;
  return typeof input.currentIteration.number === "number" && Boolean(normalizeText(input.currentIteration.title)) && input.tasks.every(isLegacyTask);
}

function isLegacyTask(value: unknown): boolean {
  return isRecord(value) && Boolean(normalizeText(value.title));
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "active" || value === "completed" || value === "discarded";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTask(value: Task | null): value is Task {
  return value !== null;
}

function isFolder(value: Folder | null): value is Folder {
  return value !== null;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

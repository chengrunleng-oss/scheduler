export const SCHEMA_VERSION = 3;
export const MAX_FOLDER_DEPTH = 4;
export const PRIORITY_LABELS = {
    high: "高",
    medium: "中",
    low: "低",
};
export const STATUS_LABELS = {
    active: "待办",
    completed: "已完成",
    discarded: "不再需要",
};
export const PRIORITY_RANK = {
    high: 0,
    medium: 1,
    low: 2,
};
export function createDefaultState(now = Date.now()) {
    const today = toISODate(now);
    const workFolder = createFolder({ name: "工作", parentId: null }, now - 2_000, "folder-work", 0);
    const personalFolder = createFolder({ name: "个人", parentId: null }, now - 1_000, "folder-personal", 1);
    return {
        schemaVersion: SCHEMA_VERSION,
        preferences: {
            activeStatusFilter: "all",
            theme: "system",
            viewMode: "tree",
            sortMode: "manual",
            folderScope: "all",
        },
        folders: [workFolder, personalFolder],
        tasks: [
            createTask({
                title: "确定今天最重要的一件事",
                notes: "写下明确结果，并安排第一个可执行步骤。",
                priority: "high",
                dueDate: today,
                tag: "重点",
                status: "active",
                folderId: workFolder.id,
            }, now - 7_200_000, "task-1", 0),
            createTask({
                title: "安排一段不被打扰的专注时间",
                notes: "",
                priority: "medium",
                dueDate: "",
                tag: "日常",
                status: "active",
                folderId: personalFolder.id,
            }, now - 3_600_000, "task-2", 0),
        ],
    };
}
export function createTask(draft, now = Date.now(), id = createId("task", now), order = 0) {
    return {
        id,
        title: normalizeText(draft.title),
        notes: normalizeMultiline(draft.notes),
        priority: coercePriority(draft.priority),
        dueDate: normalizeDate(draft.dueDate),
        tag: normalizeText(draft.tag),
        status: coerceTaskStatus(draft.status),
        folderId: normalizeNullableId(draft.folderId),
        order: coerceOrder(order),
        createdAt: now,
        updatedAt: now,
    };
}
export function updateTask(task, draft, now = Date.now(), order = task.order) {
    return {
        ...task,
        title: normalizeText(draft.title),
        notes: normalizeMultiline(draft.notes),
        priority: coercePriority(draft.priority),
        dueDate: normalizeDate(draft.dueDate),
        tag: normalizeText(draft.tag),
        status: coerceTaskStatus(draft.status),
        folderId: normalizeNullableId(draft.folderId),
        order: coerceOrder(order),
        updatedAt: now,
    };
}
export function taskMatchesDraft(task, draft) {
    return (task.title === normalizeText(draft.title) &&
        task.notes === normalizeMultiline(draft.notes) &&
        task.priority === coercePriority(draft.priority) &&
        task.dueDate === normalizeDate(draft.dueDate) &&
        task.tag === normalizeText(draft.tag) &&
        task.status === coerceTaskStatus(draft.status) &&
        task.folderId === normalizeNullableId(draft.folderId));
}
export function createFolder(draft, now = Date.now(), id = createId("folder", now), order = 0) {
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
export function createId(prefix, now = Date.now()) {
    const random = Math.random().toString(16).slice(2, 10);
    return `${prefix}-${now}-${random}`;
}
export function normalizeText(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
export function normalizeMultiline(value) {
    return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}
export function normalizeDate(value) {
    if (typeof value !== "string")
        return "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
export function normalizeNullableId(value) {
    const normalized = normalizeText(value);
    return normalized || null;
}
export function coercePriority(value) {
    if (value === "high" || value === "高")
        return "high";
    if (value === "low" || value === "低")
        return "low";
    return "medium";
}
export function coerceTaskStatus(value) {
    if (value === "completed")
        return "completed";
    if (value === "discarded")
        return "discarded";
    return "active";
}
export function coerceFilter(value) {
    if (value === "active" || value === "completed" || value === "discarded" || value === "all")
        return value;
    if (value === "open")
        return "active";
    if (value === "done")
        return "completed";
    return "all";
}
export function coerceTheme(value) {
    if (value === "light" || value === "dark" || value === "system")
        return value;
    return "system";
}
export function coerceViewMode(value) {
    if (value === "priority" || value === "due_date" || value === "tree")
        return value;
    return "tree";
}
export function coerceSortMode(value) {
    if (value === "priority" || value === "due_date" || value === "manual")
        return value;
    return "manual";
}
export function priorityRank(priority) {
    return PRIORITY_RANK[priority] ?? 3;
}
export function toISODate(value = Date.now()) {
    const date = typeof value === "number" ? new Date(value) : value;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
export function isDueOrOverdue(task, todayISO = toISODate()) {
    return task.status === "active" && Boolean(task.dueDate) && task.dueDate <= todayISO;
}
export function dueDateGroup(task, todayISO = toISODate()) {
    if (!task.dueDate)
        return "unscheduled";
    if (task.dueDate < todayISO)
        return "overdue";
    if (task.dueDate === todayISO)
        return "today";
    const boundary = new Date(`${todayISO}T00:00:00`);
    boundary.setDate(boundary.getDate() + 7);
    return task.dueDate <= toISODate(boundary) ? "next_seven_days" : "later";
}
export function getFolderDescendantIds(folders, folderId) {
    const descendants = new Set();
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
export function getFolderDepth(folders, folderId) {
    if (!folderId)
        return 0;
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const visited = new Set();
    let currentId = folderId;
    let depth = 0;
    while (currentId) {
        if (visited.has(currentId))
            return Number.POSITIVE_INFINITY;
        visited.add(currentId);
        const folder = byId.get(currentId);
        if (!folder)
            return Number.POSITIVE_INFINITY;
        depth += 1;
        currentId = folder.parentId;
    }
    return depth;
}
export function canMoveFolder(folders, folderId, parentId) {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder)
        return false;
    if (parentId === folderId)
        return false;
    if (parentId && !folders.some((item) => item.id === parentId))
        return false;
    if (getFolderDescendantIds(folders, folderId).has(parentId ?? ""))
        return false;
    const baseDepth = getFolderDepth(folders, parentId) + 1;
    let subtreeHeight = 1;
    for (const descendantId of getFolderDescendantIds(folders, folderId)) {
        const relativeDepth = getRelativeFolderDepth(folders, descendantId, folderId);
        subtreeHeight = Math.max(subtreeHeight, relativeDepth + 1);
    }
    return Number.isFinite(baseDepth) && baseDepth + subtreeHeight - 1 <= MAX_FOLDER_DEPTH;
}
export function canAddFolder(folders, parentId) {
    if (parentId && !folders.some((folder) => folder.id === parentId))
        return false;
    return getFolderDepth(folders, parentId) + 1 <= MAX_FOLDER_DEPTH;
}
export function selectVisibleTasks(state, query) {
    const normalizedQuery = normalizeText(query).toLowerCase();
    const scopedFolderIds = getScopedFolderIds(state.folders, state.preferences.folderScope);
    return state.tasks
        .filter((task) => {
        const matchesStatus = state.preferences.activeStatusFilter === "all" || task.status === state.preferences.activeStatusFilter;
        const matchesScope = state.preferences.folderScope === "all" ||
            (state.preferences.folderScope === "root" ? task.folderId === null : Boolean(task.folderId && scopedFolderIds.has(task.folderId)));
        const haystack = `${task.title} ${task.notes} ${task.tag} ${PRIORITY_LABELS[task.priority]} ${STATUS_LABELS[task.status]}`.toLowerCase();
        return matchesStatus && matchesScope && (!normalizedQuery || haystack.includes(normalizedQuery));
    })
        .sort(taskComparator(state.preferences.sortMode));
}
export function taskComparator(sortMode) {
    return (a, b) => {
        if (sortMode === "priority") {
            return priorityRank(a.priority) - priorityRank(b.priority) || compareDueDates(a, b) || stableTaskOrder(a, b);
        }
        if (sortMode === "due_date") {
            return compareDueDates(a, b) || priorityRank(a.priority) - priorityRank(b.priority) || stableTaskOrder(a, b);
        }
        return stableTaskOrder(a, b);
    };
}
export function hydrateState(input, now = Date.now()) {
    if (!isRecord(input))
        return createDefaultState(now);
    const source = input;
    const isV3 = source.schemaVersion === SCHEMA_VERSION || Array.isArray(source.folders);
    return isV3 ? hydrateV3State(source, now) : migrateLegacyState(source, now);
}
export function validateBackupPayload(input) {
    return validatePayload(input, "备份文件");
}
export function validateStoredPayload(input) {
    return validatePayload(input, "本地数据");
}
function validatePayload(input, sourceLabel) {
    if (!isRecord(input)) {
        return invalid(sourceLabel, "根节点必须是对象。");
    }
    if (input.schemaVersion === SCHEMA_VERSION || Array.isArray(input.folders)) {
        if (!isRecord(input.preferences))
            return invalid(sourceLabel, "缺少 preferences。");
        if (!isValidV3Preferences(input.preferences))
            return invalid(sourceLabel, "preferences 中存在无效偏好设置。");
        if (!Array.isArray(input.tasks))
            return invalid(sourceLabel, "缺少 tasks 数组。");
        if (!Array.isArray(input.folders))
            return invalid(sourceLabel, "缺少 folders 数组。");
        if (input.tasks.some((task) => !isValidV3Task(task)))
            return invalid(sourceLabel, "tasks 中存在无效任务。");
        if (input.folders.some((folder) => !isValidV3Folder(folder)))
            return invalid(sourceLabel, "folders 中存在无效文件夹。");
        return { valid: true, message: "", kind: "current" };
    }
    if (isV2Payload(input)) {
        return { valid: true, message: "", kind: "v2" };
    }
    if (isLegacyBackupPayload(input)) {
        return { valid: true, message: "", kind: "legacy" };
    }
    return invalid(sourceLabel, "缺少可迁移的任务数据。");
}
function invalid(sourceLabel, detail) {
    return { valid: false, message: `${sourceLabel}结构无效：${detail}` };
}
function isV2Payload(input) {
    if (input.schemaVersion !== 2 || !isRecord(input.preferences) || !Array.isArray(input.tasks))
        return false;
    if (!isRecord(input.currentIteration))
        return false;
    return input.tasks.every((task) => isLegacyTask(task));
}
function isLegacyBackupPayload(input) {
    if (isRecord(input.preferences) || !Array.isArray(input.tasks) || !isRecord(input.currentIteration))
        return false;
    const iteration = input.currentIteration;
    return (typeof iteration.number === "number" &&
        normalizeText(iteration.title).length > 0 &&
        input.tasks.every((task) => isLegacyTask(task)));
}
function isLegacyTask(value) {
    return isRecord(value) && Boolean(normalizeText(value.title));
}
function isValidV3Task(value) {
    if (!isRecord(value) || !normalizeText(value.id) || !normalizeText(value.title))
        return false;
    if (!isPriority(value.priority) || !isTaskStatus(value.status))
        return false;
    if (typeof value.notes !== "string" || typeof value.dueDate !== "string" || typeof value.tag !== "string")
        return false;
    if (value.dueDate && !normalizeDate(value.dueDate))
        return false;
    if (value.folderId !== null && typeof value.folderId !== "string")
        return false;
    return (typeof value.order === "number" &&
        Number.isFinite(value.order) &&
        typeof value.createdAt === "number" &&
        Number.isFinite(value.createdAt) &&
        typeof value.updatedAt === "number" &&
        Number.isFinite(value.updatedAt));
}
function isValidV3Folder(value) {
    if (!isRecord(value) || !normalizeText(value.id) || !normalizeText(value.name))
        return false;
    if (value.parentId !== null && typeof value.parentId !== "string")
        return false;
    return (typeof value.order === "number" &&
        Number.isFinite(value.order) &&
        typeof value.collapsed === "boolean" &&
        typeof value.createdAt === "number" &&
        Number.isFinite(value.createdAt) &&
        typeof value.updatedAt === "number" &&
        Number.isFinite(value.updatedAt));
}
function isValidV3Preferences(value) {
    return ((value.activeStatusFilter === "all" || isTaskStatus(value.activeStatusFilter)) &&
        (value.theme === "system" || value.theme === "light" || value.theme === "dark") &&
        (value.viewMode === "tree" || value.viewMode === "priority" || value.viewMode === "due_date") &&
        (value.sortMode === "manual" || value.sortMode === "priority" || value.sortMode === "due_date") &&
        typeof value.folderScope === "string");
}
function hydrateV3State(source, now) {
    const rawFolders = Array.isArray(source.folders)
        ? source.folders.map((value, index) => hydrateFolder(value, now + index)).filter(isFolder)
        : [];
    const folders = sanitizeFolders(uniqueById(rawFolders));
    const folderIds = new Set(folders.map((folder) => folder.id));
    const tasks = Array.isArray(source.tasks)
        ? source.tasks.map((value, index) => hydrateTask(value, now + index, index, folderIds)).filter(isTask)
        : [];
    const preferences = hydratePreferences(source.preferences, source, folderIds);
    return { schemaVersion: SCHEMA_VERSION, preferences, folders, tasks: uniqueById(tasks) };
}
function migrateLegacyState(source, now) {
    const sourcePreferences = isRecord(source.preferences) ? source.preferences : source;
    const tasks = Array.isArray(source.tasks)
        ? source.tasks
            .map((value, index) => migrateLegacyTask(value, now + index, index))
            .filter(isTask)
        : [];
    return {
        schemaVersion: SCHEMA_VERSION,
        preferences: {
            activeStatusFilter: coerceFilter(sourcePreferences.activeStatusFilter ?? sourcePreferences.activeFilter),
            theme: coerceTheme(sourcePreferences.theme),
            viewMode: "tree",
            sortMode: "manual",
            folderScope: "all",
        },
        folders: [],
        tasks: uniqueById(tasks),
    };
}
function hydratePreferences(value, legacyRoot, folderIds) {
    const source = isRecord(value) ? value : legacyRoot;
    const rawScope = normalizeText(source.folderScope);
    const folderScope = rawScope === "root" || rawScope === "all" || folderIds.has(rawScope) ? rawScope : "all";
    return {
        activeStatusFilter: coerceFilter(source.activeStatusFilter ?? source.activeFilter),
        theme: coerceTheme(source.theme),
        viewMode: coerceViewMode(source.viewMode),
        sortMode: coerceSortMode(source.sortMode),
        folderScope,
    };
}
function hydrateTask(value, now, fallbackOrder, folderIds) {
    if (!isRecord(value))
        return null;
    const title = normalizeText(value.title);
    if (!title)
        return null;
    const createdAt = toTimestamp(value.createdAt, now);
    const folderId = normalizeNullableId(value.folderId);
    return {
        id: normalizeText(value.id) || createId("task", now),
        title,
        notes: normalizeMultiline(value.notes),
        priority: coercePriority(value.priority),
        dueDate: normalizeDate(value.dueDate) || normalizeDate(value.date),
        tag: normalizeText(value.tag),
        status: isTaskStatus(value.status) ? value.status : Boolean(value.done) ? "completed" : "active",
        folderId: folderId && folderIds.has(folderId) ? folderId : null,
        order: coerceOrder(value.order, fallbackOrder),
        createdAt,
        updatedAt: toTimestamp(value.updatedAt, createdAt),
    };
}
function migrateLegacyTask(value, now, order) {
    if (!isRecord(value))
        return null;
    const title = normalizeText(value.title);
    if (!title)
        return null;
    const createdAt = toTimestamp(value.createdAt, now);
    return {
        id: normalizeText(value.id) || createId("task", now),
        title,
        notes: "",
        priority: coercePriority(value.priority),
        dueDate: normalizeDate(value.dueDate) || normalizeDate(value.date),
        tag: normalizeText(value.tag),
        status: Boolean(value.done) ? "completed" : "active",
        folderId: null,
        order,
        createdAt,
        updatedAt: toTimestamp(value.updatedAt, createdAt),
    };
}
function hydrateFolder(value, now) {
    if (!isRecord(value))
        return null;
    const name = normalizeText(value.name);
    if (!name)
        return null;
    const createdAt = toTimestamp(value.createdAt, now);
    return {
        id: normalizeText(value.id) || createId("folder", now),
        name,
        parentId: normalizeNullableId(value.parentId),
        order: coerceOrder(value.order),
        collapsed: Boolean(value.collapsed),
        createdAt,
        updatedAt: toTimestamp(value.updatedAt, createdAt),
    };
}
function sanitizeFolders(folders) {
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
function getScopedFolderIds(folders, scope) {
    if (scope === "all" || scope === "root")
        return new Set();
    return new Set([scope, ...getFolderDescendantIds(folders, scope)]);
}
function getRelativeFolderDepth(folders, folderId, ancestorId) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    let current = byId.get(folderId);
    let depth = 0;
    while (current && current.id !== ancestorId) {
        depth += 1;
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return current?.id === ancestorId ? depth : Number.POSITIVE_INFINITY;
}
function compareDueDates(a, b) {
    if (!a.dueDate && !b.dueDate)
        return 0;
    if (!a.dueDate)
        return 1;
    if (!b.dueDate)
        return -1;
    return a.dueDate.localeCompare(b.dueDate);
}
function stableTaskOrder(a, b) {
    return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
function coerceOrder(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
function toTimestamp(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function isPriority(value) {
    return value === "high" || value === "medium" || value === "low";
}
function isTaskStatus(value) {
    return value === "active" || value === "completed" || value === "discarded";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTask(value) {
    return value !== null;
}
function isFolder(value) {
    return value !== null;
}
function uniqueById(items) {
    const seen = new Set();
    return items.filter((item) => {
        if (seen.has(item.id))
            return false;
        seen.add(item.id);
        return true;
    });
}

import {
  canAddFolder,
  canMoveFolder,
  createDefaultState,
  createFolder,
  createId,
  createTask,
  getFolderDescendantIds,
  isOverdue,
  normalizeDate,
  normalizeText,
  taskMatchesDraft,
  toISODate,
  updateTask,
} from "./domain.js";
import type { AppState, Folder, Priority, RescheduleRecord, StateAction, StatusEvent, StatusEventSource, Task, TaskStatus } from "./types.js";

type Listener = (state: AppState, previous: AppState | null) => void;

export interface AppStore {
  getState(): AppState;
  dispatch(action: StateAction): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: Listener): () => void;
}

export function createStore(initialState: AppState): AppStore {
  let state = initialState;
  let previousState: AppState | null = null;
  const past: AppState[] = [];
  const future: AppState[] = [];
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of listeners) listener(state, previousState);
  };

  return {
    getState: () => state,
    dispatch(action) {
      const next = reduceState(state, action);
      if (next === state) return;
      previousState = state;
      if (action.type === "replace-state") {
        past.length = 0;
        future.length = 0;
      } else if (isHistoryAction(action)) {
        past.push(state);
        future.length = 0;
      }
      state = next;
      notify();
    },
    undo() {
      const snapshot = past.pop();
      if (!snapshot) return;
      future.push(state);
      previousState = state;
      state = snapshot;
      notify();
    },
    redo() {
      const snapshot = future.pop();
      if (!snapshot) return;
      past.push(state);
      previousState = state;
      state = snapshot;
      notify();
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function reduceState(state: AppState, action: StateAction): AppState {
  switch (action.type) {
    case "add-task": {
      if (!normalizeText(action.draft.title)) return state;
      if (action.draft.folderId && !state.folders.some((folder) => folder.id === action.draft.folderId)) return state;
      const order = nextTaskOrder(state.tasks, action.draft.folderId);
      const task = createTask({ ...action.draft, status: "active" }, action.now, undefined, order);
      return normalizeActiveOrders({ ...state, tasks: [...state.tasks, task] });
    }

    case "update-task": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || !normalizeText(action.draft.title) || taskMatchesDraft(target, action.draft)) return state;
      if (action.draft.folderId && !state.folders.some((folder) => folder.id === action.draft.folderId)) return state;
      const now = action.now ?? Date.now();
      const moved = target.folderId !== action.draft.folderId || target.priority !== action.draft.priority;
      const order = moved ? nextTaskOrder(state.tasks, action.draft.folderId) : target.order;
      let updated = updateTask(target, action.draft, now, order);
      if (target.dueDate && updated.dueDate > target.dueDate) {
        updated = { ...updated, rescheduleHistory: [...target.rescheduleHistory, createRescheduleRecord(target.dueDate, updated.dueDate, action.rescheduleReason, "detail", now)] };
      }
      if (target.status === "active" && updated.status !== "active") {
        updated = {
          ...updated,
          resolvedAt: null,
          pendingResolution: {
            targetStatus: updated.status,
            executeAt: now + 8_000,
            originFolderId: target.folderId,
            originOrder: target.order,
            originPriority: target.priority,
          },
        };
      }
      return normalizeActiveOrders(updateOneTask(state, target.id, updated));
    }

    case "set-task-description": {
      const target = state.tasks.find((task) => task.id === action.id);
      const descriptionMarkdown = action.descriptionMarkdown.replace(/\r\n?/g, "\n");
      if (!target || target.descriptionMarkdown === descriptionMarkdown) return state;
      return updateOneTask(state, target.id, { ...target, descriptionMarkdown, updatedAt: action.now ?? Date.now() });
    }

    case "move-task": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || target.status !== "active" || isOverdue(target, toISODate(action.now))) return state;
      if (action.folderId && !state.folders.some((folder) => folder.id === action.folderId)) return state;
      return moveTask(state, target, action.folderId, action.priority, action.targetIndex, action.now ?? Date.now());
    }

    case "set-task-priority": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || target.status !== "active" || target.priority === action.priority || isOverdue(target, toISODate(action.now))) return state;
      const count = state.tasks.filter((task) => task.id !== target.id && task.status === "active" && task.folderId === target.folderId && task.priority === action.priority && !isOverdue(task, toISODate(action.now))).length;
      return moveTask(state, target, target.folderId, action.priority, count, action.now ?? Date.now());
    }

    case "move-priority-divider": {
      const today = toISODate(action.now);
      const candidates = state.tasks
        .filter((task) => task.status === "active" && task.folderId === action.folderId && !isOverdue(task, today))
        .sort(stableTaskOrder);
      const highCount = Math.max(0, Math.min(candidates.length, Math.round(action.highCount)));
      const nextPriorities = new Map(candidates.map((task, index) => [task.id, index < highCount ? "high" as const : "low" as const]));
      if (candidates.every((task) => task.priority === nextPriorities.get(task.id))) return state;
      const now = action.now ?? Date.now();
      return normalizeActiveOrders({
        ...state,
        tasks: state.tasks.map((task) => nextPriorities.has(task.id) ? { ...task, priority: nextPriorities.get(task.id) ?? task.priority, updatedAt: now } : task),
      });
    }

    case "start-task-resolution": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || target.status !== "active") return state;
      const now = action.now ?? Date.now();
      return updateOneTask(state, target.id, {
        ...target,
        status: action.targetStatus,
        resolvedAt: null,
        pendingResolution: {
          targetStatus: action.targetStatus,
          executeAt: action.executeAt ?? now + 8_000,
          originFolderId: target.folderId,
          originOrder: target.order,
          originPriority: target.priority,
        },
        updatedAt: now,
      });
    }

    case "cancel-task-resolution": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target?.pendingResolution) return state;
      const origin = target.pendingResolution;
      return normalizeActiveOrders(updateOneTask(state, target.id, {
        ...target,
        status: "active",
        folderId: origin.originFolderId,
        order: origin.originOrder,
        priority: origin.originPriority,
        resolvedAt: null,
        pendingResolution: null,
        updatedAt: action.now ?? Date.now(),
      }));
    }

    case "finalize-task-resolution": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target?.pendingResolution) return state;
      const changedAt = action.now ?? target.pendingResolution.executeAt;
      return updateOneTask(state, target.id, {
        ...target,
        status: target.pendingResolution.targetStatus,
        resolvedAt: changedAt,
        pendingResolution: null,
        statusHistory: [...target.statusHistory, createStatusEvent("active", target.pendingResolution.targetStatus, changedAt, "resolution")],
        updatedAt: changedAt,
      });
    }

    case "finalize-expired-resolutions": {
      const now = action.now ?? Date.now();
      let changed = false;
      const tasks = state.tasks.map((task) => {
        if (!task.pendingResolution || task.pendingResolution.executeAt > now) return task;
        changed = true;
        return {
          ...task,
          status: task.pendingResolution.targetStatus,
          resolvedAt: task.pendingResolution.executeAt,
          pendingResolution: null,
          statusHistory: [...task.statusHistory, createStatusEvent("active", task.pendingResolution.targetStatus, task.pendingResolution.executeAt, "resolution")],
          updatedAt: task.pendingResolution.executeAt,
        };
      });
      return changed ? { ...state, tasks } : state;
    }

    case "restore-task": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || target.status === "active") return state;
      const changedAt = action.now ?? Date.now();
      return normalizeActiveOrders(updateOneTask(state, target.id, {
        ...target,
        status: "active",
        resolvedAt: null,
        pendingResolution: null,
        statusHistory: [...target.statusHistory, createStatusEvent(target.status, "active", changedAt, "restore")],
        updatedAt: changedAt,
      }));
    }

    case "reschedule-task": {
      const target = state.tasks.find((task) => task.id === action.id);
      const dueDate = normalizeDate(action.dueDate);
      if (!target || !dueDate || dueDate === target.dueDate) return state;
      const today = toISODate(action.now);
      if (action.source === "quick" && isOverdue(target, today) && dueDate <= today) return state;
      const now = action.now ?? Date.now();
      const record = createRescheduleRecord(target.dueDate, dueDate, action.reason, action.source, now);
      return updateOneTask(state, target.id, { ...target, dueDate, rescheduleHistory: [...target.rescheduleHistory, record], updatedAt: now });
    }

    case "apply-suggested-order": {
      const today = toISODate(action.now);
      const candidates = state.tasks.filter((task) => task.status === "active" && task.folderId === action.folderId && !isOverdue(task, today));
      const sorted = [...candidates].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || compareDueDates(a, b) || stableTaskOrder(a, b));
      if (sorted.every((task, index) => task.id === [...candidates].sort(stableTaskOrder)[index]?.id)) return state;
      const orders = new Map(sorted.map((task, index) => [task.id, index]));
      const now = action.now ?? Date.now();
      return { ...state, tasks: state.tasks.map((task) => orders.has(task.id) ? { ...task, order: orders.get(task.id) ?? task.order, updatedAt: now } : task) };
    }

    case "delete-task":
      return state.tasks.some((task) => task.id === action.id) ? { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) } : state;

    case "set-status-filter":
      return state.preferences.activeStatusFilter === action.filter ? state : { ...state, preferences: { ...state.preferences, activeStatusFilter: action.filter } };

    case "set-theme":
      return state.preferences.theme === action.theme ? state : { ...state, preferences: { ...state.preferences, theme: action.theme } };

    case "set-view-mode":
      return state.preferences.viewMode === action.viewMode ? state : { ...state, preferences: { ...state.preferences, viewMode: action.viewMode } };

    case "set-folder-scope": {
      const validScope = action.folderScope === "all" || action.folderScope === "root" || state.folders.some((folder) => folder.id === action.folderScope);
      return !validScope || state.preferences.folderScope === action.folderScope ? state : { ...state, preferences: { ...state.preferences, folderScope: action.folderScope } };
    }

    case "set-default-task-values":
      return state.preferences.defaultTaskDueDate === action.dueDate && state.preferences.defaultTaskPriority === action.priority
        ? state
        : { ...state, preferences: { ...state.preferences, defaultTaskDueDate: action.dueDate, defaultTaskPriority: action.priority } };

    case "set-recent-worklog-days": {
      const days = Number.isInteger(action.days) ? Math.max(0, Math.min(90, action.days)) : 7;
      return state.preferences.recentWorklogDays === days ? state : { ...state, preferences: { ...state.preferences, recentWorklogDays: days } };
    }

    case "set-workspace-width": {
      const width = Math.max(560, Math.min(680, Math.round(action.width)));
      return state.preferences.workspaceWidth === width ? state : { ...state, preferences: { ...state.preferences, workspaceWidth: width } };
    }

    case "toggle-handled-section":
      return { ...state, preferences: { ...state.preferences, expandedHandledContainers: toggleId(state.preferences.expandedHandledContainers, action.containerId) } };

    case "toggle-navigation-folder":
      return state.folders.some((folder) => folder.id === action.id)
        ? { ...state, preferences: { ...state.preferences, navigationCollapsedFolders: toggleId(state.preferences.navigationCollapsedFolders, action.id) } }
        : state;

    case "add-folder": {
      const name = normalizeText(action.draft.name);
      if (!name || !canAddFolder(state.folders, action.draft.parentId)) return state;
      return { ...state, folders: [...state.folders, createFolder({ ...action.draft, name }, action.now, undefined, nextFolderOrder(state.folders, action.draft.parentId))] };
    }

    case "update-folder": {
      const folder = state.folders.find((item) => item.id === action.id);
      const name = normalizeText(action.draft.name);
      if (!folder || !name || !canMoveFolder(state.folders, folder.id, action.draft.parentId)) return state;
      if (folder.name === name && folder.parentId === action.draft.parentId) return state;
      const order = folder.parentId === action.draft.parentId ? folder.order : nextFolderOrder(state.folders, action.draft.parentId);
      return { ...state, folders: state.folders.map((item) => item.id === folder.id ? { ...item, name, parentId: action.draft.parentId, order, updatedAt: action.now ?? Date.now() } : item) };
    }

    case "move-folder":
      return moveFolder(state, action.id, action.parentId, action.targetIndex, action.now ?? Date.now());

    case "toggle-folder": {
      const folder = state.folders.find((item) => item.id === action.id);
      if (!folder) return state;
      const collapsed = action.collapsed ?? !folder.collapsed;
      return folder.collapsed === collapsed ? state : { ...state, folders: state.folders.map((item) => item.id === folder.id ? { ...item, collapsed } : item) };
    }

    case "delete-folder":
      return deleteFolder(state, action.id, action.strategy);

    case "replace-state":
      return action.state === state ? state : action.state;

    case "reset":
      return createDefaultState(action.now);
  }
}

function moveTask(state: AppState, target: Task, folderId: string | null, priority: Priority, targetIndex: number, now: number): AppState {
  const today = toISODate(now);
  const targetGroup = state.tasks
    .filter((task) => task.id !== target.id && task.status === "active" && task.folderId === folderId && task.priority === priority && !isOverdue(task, today))
    .sort(stableTaskOrder);
  const index = Math.max(0, Math.min(targetGroup.length, Math.round(targetIndex)));
  targetGroup.splice(index, 0, { ...target, folderId, priority, updatedAt: now });
  const groupOrders = new Map(targetGroup.map((task, order) => [task.id, order]));
  const tasks = state.tasks.map((task) => {
    if (task.id === target.id) return { ...task, folderId, priority, order: groupOrders.get(task.id) ?? 0, updatedAt: now };
    if (groupOrders.has(task.id)) return { ...task, order: groupOrders.get(task.id) ?? task.order };
    return task;
  });
  return normalizeActiveOrders({ ...state, tasks });
}

function normalizeActiveOrders(state: AppState): AppState {
  const groups = new Map<string, Task[]>();
  for (const task of state.tasks.filter((item) => item.status === "active")) {
    const key = task.folderId ?? "__root__";
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  }
  const orders = new Map<string, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || stableTaskOrder(a, b)).forEach((task, index) => orders.set(task.id, index));
  }
  let changed = false;
  const tasks = state.tasks.map((task) => {
    const order = orders.get(task.id);
    if (order === undefined || order === task.order) return task;
    changed = true;
    return { ...task, order };
  });
  return changed ? { ...state, tasks } : state;
}

function updateOneTask(state: AppState, id: string, replacement: Task): AppState {
  return { ...state, tasks: state.tasks.map((task) => task.id === id ? replacement : task) };
}

function moveFolder(state: AppState, id: string, parentId: string | null, targetIndex: number, now: number): AppState {
  const folder = state.folders.find((item) => item.id === id);
  if (!folder || !canMoveFolder(state.folders, id, parentId)) return state;
  const oldParentId = folder.parentId;
  const targetSiblings = state.folders
    .filter((item) => item.id !== id && item.parentId === parentId)
    .sort(stableFolderOrder);
  const index = Math.max(0, Math.min(targetSiblings.length, Math.round(targetIndex)));
  targetSiblings.splice(index, 0, { ...folder, parentId, updatedAt: now });
  const targetOrders = new Map(targetSiblings.map((item, order) => [item.id, order]));
  const oldOrders = oldParentId === parentId
    ? new Map<string, number>()
    : new Map(state.folders.filter((item) => item.id !== id && item.parentId === oldParentId).sort(stableFolderOrder).map((item, order) => [item.id, order]));
  const folders = state.folders.map((item) => {
    if (item.id === id) return { ...item, parentId, order: targetOrders.get(id) ?? 0, updatedAt: now };
    if (targetOrders.has(item.id)) return { ...item, order: targetOrders.get(item.id) ?? item.order };
    if (oldOrders.has(item.id)) return { ...item, order: oldOrders.get(item.id) ?? item.order };
    return item;
  });
  const unchanged = folders.every((item, itemIndex) => {
    const previous = state.folders[itemIndex];
    return previous && item.parentId === previous.parentId && item.order === previous.order;
  });
  return unchanged ? state : { ...state, folders };
}

function deleteFolder(state: AppState, id: string, strategy: "move-contents" | "delete-branch"): AppState {
  const folder = state.folders.find((item) => item.id === id);
  if (!folder) return state;
  const descendants = getFolderDescendantIds(state.folders, id);
  const deletedIds = new Set([id, ...descendants]);
  const repairPendingOrigin = (task: Task, destination: string | null): Task => {
    if (!task.pendingResolution || task.pendingResolution.originFolderId !== id) return task;
    return { ...task, pendingResolution: { ...task.pendingResolution, originFolderId: destination } };
  };
  if (strategy === "move-contents") {
    const destination = folder.parentId;
    return normalizeActiveOrders({
      ...state,
      folders: state.folders.filter((item) => item.id !== id).map((item) => item.parentId === id ? { ...item, parentId: destination } : item),
      tasks: state.tasks.map((task) => repairPendingOrigin(task.folderId === id ? { ...task, folderId: destination } : task, destination)),
      preferences: {
        ...state.preferences,
        folderScope: state.preferences.folderScope === id ? destination ?? "root" : state.preferences.folderScope,
        expandedHandledContainers: state.preferences.expandedHandledContainers.filter((item) => item !== id),
        navigationCollapsedFolders: state.preferences.navigationCollapsedFolders.filter((item) => item !== id),
      },
    });
  }
  const scopeDeleted = deletedIds.has(state.preferences.folderScope);
  return {
    ...state,
    folders: state.folders.filter((item) => !deletedIds.has(item.id)),
    tasks: state.tasks.filter((task) => !task.folderId || !deletedIds.has(task.folderId)),
    preferences: {
      ...state.preferences,
      folderScope: scopeDeleted ? folder.parentId ?? "root" : state.preferences.folderScope,
      expandedHandledContainers: state.preferences.expandedHandledContainers.filter((item) => !deletedIds.has(item)),
      navigationCollapsedFolders: state.preferences.navigationCollapsedFolders.filter((item) => !deletedIds.has(item)),
    },
  };
}

function createRescheduleRecord(fromDate: string, toDate: string, reason: string | undefined, source: "quick" | "detail", changedAt: number): RescheduleRecord {
  return { eventId: createId("event", changedAt), fromDate, toDate, changedAt, reason: normalizeText(reason), source };
}

function createStatusEvent(fromStatus: TaskStatus, toStatus: TaskStatus, changedAt: number, source: StatusEventSource): StatusEvent {
  return { eventId: createId("status-event", changedAt), fromStatus, toStatus, changedAt, source };
}

function nextTaskOrder(tasks: Task[], folderId: string | null): number {
  const orders = tasks.filter((task) => task.folderId === folderId && task.status === "active").map((task) => task.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function nextFolderOrder(folders: Folder[], parentId: string | null): number {
  const orders = folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
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

function stableFolderOrder(a: Folder, b: Folder): number {
  return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function priorityRank(priority: Priority): number {
  return priority === "high" ? 0 : 1;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function isHistoryAction(action: StateAction): boolean {
  return ![
    "set-status-filter",
    "set-theme",
    "set-view-mode",
    "set-folder-scope",
    "set-default-task-values",
    "set-workspace-width",
    "set-task-description",
    "toggle-handled-section",
    "toggle-navigation-folder",
    "toggle-folder",
    "finalize-task-resolution",
    "finalize-expired-resolutions",
    "replace-state",
  ].includes(action.type);
}

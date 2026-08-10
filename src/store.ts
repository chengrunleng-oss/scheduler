import {
  canAddFolder,
  canMoveFolder,
  createDefaultState,
  createFolder,
  createTask,
  getFolderDescendantIds,
  normalizeText,
  taskMatchesDraft,
  updateTask,
} from "./domain.js";
import type { AppState, Folder, Priority, StateAction, Task } from "./types.js";

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

  function notify(): void {
    for (const listener of listeners) listener(state, previousState);
  }

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
      const task = createTask(action.draft, action.now, undefined, order);
      return { ...state, tasks: [...state.tasks, task] };
    }

    case "update-task": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || !normalizeText(action.draft.title) || taskMatchesDraft(target, action.draft)) return state;
      if (action.draft.folderId && !state.folders.some((folder) => folder.id === action.draft.folderId)) return state;
      const order = target.folderId === action.draft.folderId ? target.order : nextTaskOrder(state.tasks, action.draft.folderId);
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.id ? updateTask(task, action.draft, action.now, order) : task)),
      };
    }

    case "set-task-status": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target || target.status === action.status) return state;
      return updateOneTask(state, target.id, { ...target, status: action.status, updatedAt: action.now ?? Date.now() });
    }

    case "adjust-task-priority": {
      const target = state.tasks.find((task) => task.id === action.id);
      if (!target) return state;
      const priority = adjacentPriority(target.priority, action.direction);
      if (priority === target.priority) return state;
      return updateOneTask(state, target.id, { ...target, priority, updatedAt: action.now ?? Date.now() });
    }

    case "delete-task":
      if (!state.tasks.some((task) => task.id === action.id)) return state;
      return { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) };

    case "set-status-filter":
      if (state.preferences.activeStatusFilter === action.filter) return state;
      return { ...state, preferences: { ...state.preferences, activeStatusFilter: action.filter } };

    case "set-theme":
      if (state.preferences.theme === action.theme) return state;
      return { ...state, preferences: { ...state.preferences, theme: action.theme } };

    case "set-view-mode":
      if (state.preferences.viewMode === action.viewMode) return state;
      return { ...state, preferences: { ...state.preferences, viewMode: action.viewMode } };

    case "set-sort-mode":
      if (state.preferences.sortMode === action.sortMode) return state;
      return { ...state, preferences: { ...state.preferences, sortMode: action.sortMode } };

    case "set-folder-scope": {
      const validScope =
        action.folderScope === "all" ||
        action.folderScope === "root" ||
        state.folders.some((folder) => folder.id === action.folderScope);
      if (!validScope || state.preferences.folderScope === action.folderScope) return state;
      return { ...state, preferences: { ...state.preferences, folderScope: action.folderScope } };
    }

    case "add-folder": {
      const name = normalizeText(action.draft.name);
      if (!name || !canAddFolder(state.folders, action.draft.parentId)) return state;
      const order = nextFolderOrder(state.folders, action.draft.parentId);
      return { ...state, folders: [...state.folders, createFolder({ ...action.draft, name }, action.now, undefined, order)] };
    }

    case "update-folder": {
      const folder = state.folders.find((item) => item.id === action.id);
      const name = normalizeText(action.draft.name);
      if (!folder || !name || !canMoveFolder(state.folders, folder.id, action.draft.parentId)) return state;
      if (folder.name === name && folder.parentId === action.draft.parentId) return state;
      const order = folder.parentId === action.draft.parentId ? folder.order : nextFolderOrder(state.folders, action.draft.parentId);
      return {
        ...state,
        folders: state.folders.map((item) =>
          item.id === folder.id
            ? { ...item, name, parentId: action.draft.parentId, order, updatedAt: action.now ?? Date.now() }
            : item,
        ),
      };
    }

    case "toggle-folder": {
      const folder = state.folders.find((item) => item.id === action.id);
      if (!folder) return state;
      return {
        ...state,
        folders: state.folders.map((item) => (item.id === folder.id ? { ...item, collapsed: !item.collapsed } : item)),
      };
    }

    case "delete-folder":
      return deleteFolder(state, action.id, action.strategy);

    case "replace-state":
      return action.state === state ? state : action.state;

    case "reset":
      return createDefaultState(action.now);

    default:
      return state;
  }
}

function updateOneTask(state: AppState, id: string, replacement: Task): AppState {
  return { ...state, tasks: state.tasks.map((task) => (task.id === id ? replacement : task)) };
}

function adjacentPriority(priority: Priority, direction: "raise" | "lower"): Priority {
  const priorities: Priority[] = ["high", "medium", "low"];
  const index = priorities.indexOf(priority);
  const nextIndex = direction === "raise" ? Math.max(0, index - 1) : Math.min(priorities.length - 1, index + 1);
  return priorities[nextIndex] ?? priority;
}

function deleteFolder(state: AppState, id: string, strategy: "move-contents" | "delete-branch"): AppState {
  const folder = state.folders.find((item) => item.id === id);
  if (!folder) return state;
  const descendants = getFolderDescendantIds(state.folders, id);
  const deletedIds = new Set([id, ...descendants]);

  if (strategy === "move-contents") {
    return {
      ...state,
      folders: state.folders
        .filter((item) => item.id !== id)
        .map((item) => (item.parentId === id ? { ...item, parentId: folder.parentId } : item)),
      tasks: state.tasks.map((task) => (task.folderId === id ? { ...task, folderId: folder.parentId } : task)),
      preferences: {
        ...state.preferences,
        folderScope: state.preferences.folderScope === id ? folder.parentId ?? "root" : state.preferences.folderScope,
      },
    };
  }

  const scopeDeleted = typeof state.preferences.folderScope === "string" && deletedIds.has(state.preferences.folderScope);
  return {
    ...state,
    folders: state.folders.filter((item) => !deletedIds.has(item.id)),
    tasks: state.tasks.filter((task) => !task.folderId || !deletedIds.has(task.folderId)),
    preferences: {
      ...state.preferences,
      folderScope: scopeDeleted ? folder.parentId ?? "root" : state.preferences.folderScope,
    },
  };
}

function nextTaskOrder(tasks: Task[], folderId: string | null): number {
  const orders = tasks.filter((task) => task.folderId === folderId).map((task) => task.order);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

function nextFolderOrder(folders: Folder[], parentId: string | null): number {
  const orders = folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.order);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

function isHistoryAction(action: StateAction): boolean {
  return ![
    "set-status-filter",
    "set-theme",
    "set-view-mode",
    "set-sort-mode",
    "set-folder-scope",
    "toggle-folder",
    "replace-state",
  ].includes(action.type);
}

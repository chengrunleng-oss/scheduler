import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState } from "../dist/domain.js";
import { createStore, reduceState } from "../dist/store.js";
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  loadStateFromStorage,
  parseBackupFile,
  saveStateToStorage,
} from "../dist/storage.js";

const now = 1_800_000_000_000;

function taskDraft(overrides = {}) {
  return {
    title: "新增测试任务",
    notes: "测试说明",
    priority: "low",
    dueDate: "2027-01-16",
    tag: "测试",
    status: "active",
    folderId: null,
    ...overrides,
  };
}

function legacyV2State() {
  return {
    schemaVersion: 2,
    preferences: { activeFilter: "open", theme: "system" },
    currentIteration: { number: 2, title: "旧版", completed: [], next: [] },
    tasks: [{ id: "legacy", title: "旧任务", priority: "高", date: "2027-01-15", done: false }],
    iterations: [],
  };
}

test("reduceState adds a schema v3 task without mutating the original state", () => {
  const state = createDefaultState(now);
  const next = reduceState(state, { type: "add-task", now: now + 1_000, draft: taskDraft() });

  assert.equal(state.tasks.length, 2);
  assert.equal(next.tasks.length, 3);
  assert.equal(next.tasks[2].title, "新增测试任务");
  assert.equal(next.tasks[2].notes, "测试说明");
  assert.equal(next.tasks[2].status, "active");
  assert.equal(next.tasks[2].order, 0);
});

test("task status actions cover completion, discard, and restore flows", () => {
  const state = createDefaultState(now);
  const completed = reduceState(state, { type: "set-task-status", id: "task-1", status: "completed", now: now + 1 });
  const restored = reduceState(completed, { type: "set-task-status", id: "task-1", status: "active", now: now + 2 });
  const discarded = reduceState(restored, { type: "set-task-status", id: "task-1", status: "discarded", now: now + 3 });
  const restoredAgain = reduceState(discarded, { type: "set-task-status", id: "task-1", status: "active", now: now + 4 });

  assert.equal(completed.tasks[0].status, "completed");
  assert.equal(restored.tasks[0].status, "active");
  assert.equal(discarded.tasks[0].status, "discarded");
  assert.equal(restoredAgain.tasks[0].status, "active");
});

test("priority boundary actions are no-ops and do not create undo history", () => {
  const store = createStore(createDefaultState(now));
  store.dispatch({ type: "adjust-task-priority", id: "task-1", direction: "raise", now: now + 1 });

  assert.equal(store.getState().tasks[0].priority, "high");
  assert.equal(store.canUndo(), false);

  store.dispatch({ type: "adjust-task-priority", id: "task-1", direction: "lower", now: now + 2 });
  assert.equal(store.getState().tasks[0].priority, "medium");
  assert.equal(store.canUndo(), true);
});

test("detail updates can be undone and redone", () => {
  const store = createStore(createDefaultState(now));
  const original = store.getState().tasks[0];
  store.dispatch({
    type: "update-task",
    id: original.id,
    now: now + 1,
    draft: taskDraft({ title: "详情中修改", folderId: "folder-personal", priority: "high" }),
  });

  assert.equal(store.getState().tasks[0].title, "详情中修改");
  assert.equal(store.getState().tasks[0].folderId, "folder-personal");
  store.undo();
  assert.equal(store.getState().tasks[0].title, original.title);
  store.redo();
  assert.equal(store.getState().tasks[0].title, "详情中修改");
});

test("folder reducer prevents cycles and fifth-level nesting", () => {
  let state = createDefaultState(now);
  state = reduceState(state, { type: "add-folder", draft: { name: "二级", parentId: "folder-work" }, now: now + 1 });
  const level2 = state.folders.at(-1);
  state = reduceState(state, { type: "add-folder", draft: { name: "三级", parentId: level2.id }, now: now + 2 });
  const level3 = state.folders.at(-1);
  state = reduceState(state, { type: "add-folder", draft: { name: "四级", parentId: level3.id }, now: now + 3 });
  const level4 = state.folders.at(-1);

  const tooDeep = reduceState(state, { type: "add-folder", draft: { name: "五级", parentId: level4.id }, now: now + 4 });
  assert.equal(tooDeep, state);

  const cycle = reduceState(state, {
    type: "update-folder",
    id: "folder-work",
    draft: { name: "工作", parentId: level3.id },
    now: now + 5,
  });
  assert.equal(cycle, state);
});

test("deleting a non-empty folder can move contents to its parent", () => {
  const state = createDefaultState(now);
  const withChild = {
    ...state,
    folders: [
      ...state.folders,
      {
        id: "child",
        name: "子目录",
        parentId: "folder-work",
        order: 0,
        collapsed: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  const next = reduceState(withChild, { type: "delete-folder", id: "folder-work", strategy: "move-contents" });

  assert.equal(next.folders.some((folder) => folder.id === "folder-work"), false);
  assert.equal(next.folders.find((folder) => folder.id === "child").parentId, null);
  assert.equal(next.tasks.find((task) => task.id === "task-1").folderId, null);
});

test("deleting a folder branch removes descendant folders and their tasks", () => {
  const state = createDefaultState(now);
  const next = reduceState(state, { type: "delete-folder", id: "folder-work", strategy: "delete-branch" });

  assert.equal(next.folders.some((folder) => folder.id === "folder-work"), false);
  assert.equal(next.tasks.some((task) => task.id === "task-1"), false);
  assert.equal(next.tasks.some((task) => task.id === "task-2"), true);
});

test("view, sorting, filter, and collapsed preferences are persisted in state without undo noise", () => {
  const store = createStore(createDefaultState(now));
  store.dispatch({ type: "set-view-mode", viewMode: "due_date" });
  store.dispatch({ type: "set-sort-mode", sortMode: "priority" });
  store.dispatch({ type: "set-status-filter", filter: "discarded" });
  store.dispatch({ type: "set-folder-scope", folderScope: "folder-personal" });
  store.dispatch({ type: "toggle-folder", id: "folder-personal" });

  assert.deepEqual(store.getState().preferences, {
    activeStatusFilter: "discarded",
    theme: "system",
    viewMode: "due_date",
    sortMode: "priority",
    folderScope: "folder-personal",
  });
  assert.equal(store.getState().folders.find((folder) => folder.id === "folder-personal").collapsed, true);
  assert.equal(store.canUndo(), false);
});

test("replace-state clears undo history because import is a confirmed replacement", () => {
  const store = createStore(createDefaultState(now));
  store.dispatch({ type: "add-task", draft: taskDraft(), now: now + 1 });
  assert.equal(store.canUndo(), true);

  store.dispatch({ type: "replace-state", state: createDefaultState(now + 2) });
  assert.equal(store.canUndo(), false);
  assert.equal(store.canRedo(), false);
});

test("storage falls back to valid v2 data when the v3 entry is damaged", () => {
  const values = new Map([
    [STORAGE_KEY, "{broken"],
    [LEGACY_STORAGE_KEYS[0], JSON.stringify(legacyV2State())],
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem() {},
  };

  const loaded = loadStateFromStorage(storage);
  assert.equal(loaded.recovered, true);
  assert.match(loaded.message, /迁移旧版/);
  assert.equal(loaded.state.schemaVersion, 3);
  assert.equal(loaded.state.tasks[0].title, "旧任务");
});

test("backup parsing migrates v2 and rejects unrelated JSON", () => {
  const migrated = parseBackupFile(JSON.stringify(legacyV2State()));
  assert.equal(migrated.recovered, true);
  assert.match(migrated.message, /迁移并导入/);
  assert.equal(migrated.state.schemaVersion, 3);

  const unrelated = parseBackupFile("{}");
  assert.equal(unrelated.recovered, false);
  assert.match(unrelated.message, /备份文件结构无效/);
});

test("storage save writes the v3 key and handles browser storage exceptions", () => {
  let savedKey = "";
  const storage = {
    getItem() {
      return null;
    },
    setItem(key) {
      savedKey = key;
    },
  };
  assert.equal(saveStateToStorage(createDefaultState(now), storage).saved, true);
  assert.equal(savedKey, STORAGE_KEY);

  const throwingStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.match(loadStateFromStorage(throwingStorage).message, /存储不可用/);
  assert.equal(saveStateToStorage(createDefaultState(now), throwingStorage).saved, false);
});

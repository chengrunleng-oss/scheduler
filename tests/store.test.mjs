import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState } from "../dist/domain.js";
import { createStore, reduceState } from "../dist/store.js";
import { loadStateFromStorage, parseBackupFile, saveStateToStorage } from "../dist/storage.js";

test("reduceState adds a task without mutating the original state", () => {
  const state = createDefaultState(1_800_000_000_000);
  const next = reduceState(state, {
    type: "add-task",
    now: 1_800_000_001_000,
    draft: {
      title: "新增测试任务",
      priority: "low",
      dueDate: "2026-07-08",
      tag: "测试",
    },
  });

  assert.equal(state.tasks.length, 2);
  assert.equal(next.tasks.length, 3);
  assert.equal(next.tasks[0].title, "新增测试任务");
  assert.equal(next.tasks[0].priority, "low");
});

test("reducer no-op actions return the original state", () => {
  const state = createDefaultState(1_800_000_000_000);
  const task = state.tasks[0];

  assert.equal(reduceState(state, { type: "update-task", id: "missing", draft: task }), state);
  assert.equal(reduceState(state, { type: "toggle-task", id: "missing", done: true }), state);
  assert.equal(reduceState(state, { type: "delete-task", id: "missing" }), state);
  assert.equal(reduceState(state, { type: "set-filter", filter: state.preferences.activeFilter }), state);
  assert.equal(reduceState(state, { type: "set-theme", theme: state.preferences.theme }), state);
});

test("createStore supports undo and redo for history actions", () => {
  const store = createStore(createDefaultState(1_800_000_000_000));

  store.dispatch({
    type: "add-task",
    now: 1_800_000_001_000,
    draft: {
      title: "可撤销任务",
      priority: "medium",
      dueDate: "",
      tag: "",
    },
  });

  assert.equal(store.getState().tasks.length, 3);
  assert.equal(store.canUndo(), true);

  store.undo();
  assert.equal(store.getState().tasks.length, 2);
  assert.equal(store.canRedo(), true);

  store.redo();
  assert.equal(store.getState().tasks.length, 3);
});

test("replace-state clears undo history because import is confirmed replacement", () => {
  const store = createStore(createDefaultState(1_800_000_000_000));
  store.dispatch({
    type: "add-task",
    now: 1_800_000_001_000,
    draft: {
      title: "临时任务",
      priority: "medium",
      dueDate: "",
      tag: "",
    },
  });

  assert.equal(store.canUndo(), true);
  store.dispatch({ type: "replace-state", state: createDefaultState(1_800_000_002_000) });
  assert.equal(store.canUndo(), false);
  assert.equal(store.canRedo(), false);
});

test("apply-feedback creates a feedback task and concrete next items", () => {
  const state = createDefaultState(1_800_000_000_000);
  const next = reduceState(state, {
    type: "apply-feedback",
    feedback: "需要深色主题和备份恢复",
    now: 1_800_000_001_000,
  });

  assert.equal(next.tasks[0].tag, "反馈");
  assert.match(next.tasks[0].title, /深色主题和备份恢复/);
  assert.ok(next.currentIteration.next.some((item) => item.text.includes("备份恢复")));
});

test("parseBackupFile rejects invalid json and unrelated valid json", () => {
  const invalidJson = parseBackupFile("{broken");
  assert.equal(invalidJson.recovered, false);
  assert.match(invalidJson.message, /不是有效 JSON/);

  const unrelatedJson = parseBackupFile("{}");
  assert.equal(unrelatedJson.recovered, false);
  assert.match(unrelatedJson.message, /结构无效/);
});

test("storage load and save handle browser storage exceptions", () => {
  const throwingStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  const loaded = loadStateFromStorage(throwingStorage);
  assert.equal(loaded.recovered, false);
  assert.match(loaded.message, /存储不可用/);

  const saved = saveStateToStorage(createDefaultState(1_800_000_000_000), throwingStorage);
  assert.equal(saved.saved, false);
  assert.match(saved.message, /存储不可用/);
});

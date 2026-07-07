import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState } from "../dist/domain.js";
import { createStore, reduceState } from "../dist/store.js";
import { parseBackupFile } from "../dist/storage.js";

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

test("parseBackupFile validates invalid json", () => {
  const result = parseBackupFile("{broken");

  assert.equal(result.recovered, false);
  assert.match(result.message, /不是有效 JSON/);
});

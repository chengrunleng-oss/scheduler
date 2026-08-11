import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createSourceLoader } from "./vite-source-loader.mjs";

const source = await createSourceLoader();
const { createDefaultState, hydrateState } = await source.load("domain.ts");
const { createStore, reduceState } = await source.load("store.ts");
const { LEGACY_STORAGE_KEYS, STORAGE_KEY, loadStateFromStorage, parseBackupFile, saveStateToStorage } = await source.load("storage.ts");
after(() => source.close());

const now = new Date(2026, 7, 10, 10).getTime();

function taskDraft(overrides = {}) {
  return { title: "新增测试任务", notes: "测试说明", priority: "low", dueDate: "2026-08-16", tag: "测试", status: "active", folderId: null, ...overrides };
}

function addTasks(state, drafts) {
  return drafts.reduce((current, draft, index) => reduceState(current, { type: "add-task", draft: taskDraft(draft), now: now + index + 1 }), state);
}

function legacyV2State() {
  return {
    schemaVersion: 2,
    preferences: { activeFilter: "open", theme: "system" },
    currentIteration: { number: 2, title: "旧版", completed: [], next: [] },
    tasks: [{ id: "legacy", title: "旧任务", priority: "高", date: "2026-08-15", done: false }],
    iterations: [],
  };
}

test("add-task creates the complete schema v4 shape without mutating original", () => {
  const state = createDefaultState(now);
  const next = reduceState(state, { type: "add-task", now: now + 1_000, draft: taskDraft() });
  assert.equal(state.tasks.length, 2);
  assert.equal(next.tasks.length, 3);
  assert.equal(next.tasks[2].resolvedAt, null);
  assert.equal(next.tasks[2].pendingResolution, null);
  assert.deepEqual(next.tasks[2].rescheduleHistory, []);
});

test("move-task atomically changes folder, priority, and target position and is undoable", () => {
  let state = addTasks(createDefaultState(now), [
    { title: "低一", folderId: "folder-personal", priority: "low" },
    { title: "低二", folderId: "folder-personal", priority: "low" },
  ]);
  const store = createStore(state);
  store.dispatch({ type: "move-task", id: "task-1", folderId: "folder-personal", priority: "low", targetIndex: 1, now: now + 10 });
  const moved = store.getState().tasks.find((task) => task.id === "task-1");
  assert.equal(moved.folderId, "folder-personal");
  assert.equal(moved.priority, "low");
  const ordered = store.getState().tasks.filter((task) => task.status === "active" && task.folderId === "folder-personal").sort((a, b) => a.order - b.order);
  assert.equal(ordered[1].id, "task-1");
  store.undo();
  assert.equal(store.getState().tasks.find((task) => task.id === "task-1").folderId, "folder-work");
  store.redo();
  assert.equal(store.getState().tasks.find((task) => task.id === "task-1").priority, "low");
});

test("priority divider changes every crossed task in one history entry", () => {
  const state = addTasks(createDefaultState(now), [
    { title: "第三项", folderId: "folder-work", priority: "low" },
    { title: "第四项", folderId: "folder-work", priority: "low" },
  ]);
  const store = createStore(state);
  store.dispatch({ type: "move-priority-divider", folderId: "folder-work", highCount: 3, now: now + 10 });
  const work = store.getState().tasks.filter((task) => task.folderId === "folder-work" && task.status === "active").sort((a, b) => a.order - b.order);
  assert.deepEqual(work.map((task) => task.priority), ["high", "high", "high"]);
  store.undo();
  assert.deepEqual(store.getState().tasks.filter((task) => task.folderId === "folder-work").map((task) => task.priority), ["high", "low", "low"]);
});

test("resolution status changes immediately, can be cancelled, and finalizes after executeAt", () => {
  const state = createDefaultState(now);
  const pending = reduceState(state, { type: "start-task-resolution", id: "task-1", targetStatus: "completed", now, executeAt: now + 8_000 });
  assert.equal(pending.tasks[0].status, "completed");
  assert.equal(pending.tasks[0].resolvedAt, null);
  assert.equal(pending.tasks[0].pendingResolution.executeAt, now + 8_000);

  const tooEarly = reduceState(pending, { type: "finalize-expired-resolutions", now: now + 7_999 });
  assert.equal(tooEarly, pending);
  const cancelled = reduceState(pending, { type: "cancel-task-resolution", id: "task-1", now: now + 2_000 });
  assert.equal(cancelled.tasks[0].status, "active");
  assert.equal(cancelled.tasks[0].pendingResolution, null);

  const finalized = reduceState(pending, { type: "finalize-expired-resolutions", now: now + 9_000 });
  assert.equal(finalized.tasks[0].status, "completed");
  assert.equal(finalized.tasks[0].resolvedAt, now + 8_000);
  assert.equal(finalized.tasks[0].pendingResolution, null);
  const restored = reduceState(finalized, { type: "restore-task", id: "task-1", now: now + 10_000 });
  assert.equal(restored.tasks[0].status, "active");
  assert.equal(restored.tasks[0].resolvedAt, null);
});

test("independent pending timers finalize only tasks whose executeAt has elapsed", () => {
  let state = addTasks(createDefaultState(now), [{ title: "第二个待决", folderId: "folder-work", priority: "low" }]);
  const secondId = state.tasks.at(-1).id;
  state = reduceState(state, { type: "start-task-resolution", id: "task-1", targetStatus: "completed", executeAt: now + 5_000, now });
  state = reduceState(state, { type: "start-task-resolution", id: secondId, targetStatus: "discarded", executeAt: now + 9_000, now });
  const partly = reduceState(state, { type: "finalize-expired-resolutions", now: now + 6_000 });
  assert.equal(partly.tasks.find((task) => task.id === "task-1").pendingResolution, null);
  assert.notEqual(partly.tasks.find((task) => task.id === secondId).pendingResolution, null);
});

test("quick reschedule requires a future date for overdue tasks and records history", () => {
  const state = { ...createDefaultState(now), tasks: createDefaultState(now).tasks.map((task, index) => index === 0 ? { ...task, dueDate: "2026-08-01" } : task) };
  const rejected = reduceState(state, { type: "reschedule-task", id: "task-1", dueDate: "2026-08-10", source: "quick", now });
  assert.equal(rejected, state);
  const moved = reduceState(state, { type: "reschedule-task", id: "task-1", dueDate: "2026-08-13", reason: "等待依赖", source: "quick", now });
  assert.equal(moved.tasks[0].dueDate, "2026-08-13");
  assert.deepEqual(moved.tasks[0].rescheduleHistory[0], { fromDate: "2026-08-01", toDate: "2026-08-13", changedAt: now, reason: "等待依赖", source: "quick" });
});

test("detail postponement records history and undo restores date and timeline together", () => {
  const store = createStore(createDefaultState(now));
  const task = store.getState().tasks[0];
  store.dispatch({ type: "update-task", id: task.id, now: now + 1, rescheduleReason: "范围调整", draft: taskDraft({
    title: task.title, notes: task.notes, priority: task.priority, dueDate: "2026-08-20", tag: task.tag, folderId: task.folderId,
  }) });
  assert.equal(store.getState().tasks[0].rescheduleHistory.length, 1);
  store.undo();
  assert.equal(store.getState().tasks[0].dueDate, task.dueDate);
  assert.equal(store.getState().tasks[0].rescheduleHistory.length, 0);
  store.redo();
  assert.equal(store.getState().tasks[0].dueDate, "2026-08-20");
});

test("four views, defaults, filters, and navigation collapse persist without undo noise", () => {
  const store = createStore(createDefaultState(now));
  store.dispatch({ type: "set-view-mode", viewMode: "priority_then_due_date" });
  store.dispatch({ type: "set-status-filter", filter: "discarded" });
  store.dispatch({ type: "set-folder-scope", folderScope: "folder-personal" });
  store.dispatch({ type: "set-default-task-values", dueDate: "next_workday", priority: "high" });
  store.dispatch({ type: "toggle-navigation-folder", id: "folder-personal" });
  assert.equal(store.getState().preferences.viewMode, "priority_then_due_date");
  assert.equal(store.getState().preferences.defaultTaskDueDate, "next_workday");
  assert.deepEqual(store.getState().preferences.navigationCollapsedFolders, ["folder-personal"]);
  assert.equal(store.canUndo(), false);
});

test("folder deletion moves direct contents and repairs pending origin", () => {
  let state = createDefaultState(now);
  state = reduceState(state, { type: "start-task-resolution", id: "task-1", targetStatus: "completed", now });
  const next = reduceState(state, { type: "delete-folder", id: "folder-work", strategy: "move-contents" });
  const task = next.tasks.find((item) => item.id === "task-1");
  assert.equal(task.folderId, null);
  assert.equal(task.pendingResolution.originFolderId, null);
});

test("storage migrates v2 fallback to v4 and writes the v4 key", () => {
  const values = new Map([[STORAGE_KEY, "{broken"], [LEGACY_STORAGE_KEYS[1], JSON.stringify(legacyV2State())]]);
  const storage = { getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); } };
  const loaded = loadStateFromStorage(storage);
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.state.schemaVersion, 4);
  assert.match(loaded.message, /迁移旧版/);
  assert.equal(saveStateToStorage(createDefaultState(now), storage).saved, true);
  assert.ok(values.has("task-workbench-state-v4"));
});

test("backup parsing migrates v2 and rejects unrelated JSON", () => {
  const migrated = parseBackupFile(JSON.stringify(legacyV2State()));
  assert.equal(migrated.recovered, true);
  assert.equal(migrated.state.schemaVersion, 4);
  assert.match(migrated.message, /迁移并导入/);
  assert.equal(parseBackupFile("{}").recovered, false);
});

test("hydration finalizes neither pending timer before its deadline", () => {
  const state = createDefaultState(now);
  const pending = reduceState(state, { type: "start-task-resolution", id: "task-1", targetStatus: "discarded", executeAt: now + 8_000, now });
  const hydrated = hydrateState(JSON.parse(JSON.stringify(pending)), now + 1_000);
  assert.equal(hydrated.tasks[0].pendingResolution.executeAt, now + 8_000);
});

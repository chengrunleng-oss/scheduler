import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createSourceLoader } from "./vite-source-loader.mjs";

const source = await createSourceLoader();
const {
  canAddFolder,
  canMoveFolder,
  createDefaultState,
  dueDateGroup,
  getFolderDepth,
  getFolderPath,
  hydrateState,
  isDueOrOverdue,
  isOverdue,
  resolveDefaultDueDate,
  selectVisibleTasks,
  toISODate,
  validateBackupPayload,
  validateStoredPayload,
} = await source.load("domain.ts");
after(() => source.close());

const now = new Date(2026, 7, 10, 10, 0, 0).getTime();

function legacyV2State() {
  return {
    schemaVersion: 2,
    preferences: { activeFilter: "open", theme: "dark" },
    currentIteration: { number: 2, title: "旧版", completed: [], next: [] },
    tasks: [{ id: "legacy", title: "旧任务", priority: "中", date: "2026-08-11", done: false }],
    iterations: [],
  };
}

test("schema v3 migrates to v5, removes medium priority, and maps views", () => {
  const base = createDefaultState(now);
  const v3 = {
    schemaVersion: 3,
    preferences: { activeStatusFilter: "all", theme: "system", viewMode: "priority", sortMode: "due_date", folderScope: "all" },
    folders: base.folders,
    tasks: base.tasks.map(({ resolvedAt, pendingResolution, rescheduleHistory, ...task }, index) => ({ ...task, priority: index === 0 ? "medium" : task.priority })),
  };
  const state = hydrateState(v3, now);

  assert.equal(state.schemaVersion, 5);
  assert.equal(state.preferences.viewMode, "global_priority");
  assert.equal(state.preferences.defaultTaskPriority, "low");
  assert.ok(state.tasks.every((task) => task.priority === "high" || task.priority === "low"));
  assert.ok(state.tasks.every((task) => task.pendingResolution === null && Array.isArray(task.rescheduleHistory)));
  assert.ok(state.tasks.every((task) => task.descriptionMarkdown === ""));
  assert.equal(state.preferences.workspaceWidth, 620);
});

test("schema v3 resolved tasks receive resolvedAt while active tasks do not", () => {
  const base = createDefaultState(now);
  const rawTasks = base.tasks.map(({ resolvedAt, pendingResolution, rescheduleHistory, ...task }, index) => ({
    ...task,
    status: index === 0 ? "completed" : "active",
  }));
  const state = hydrateState({ schemaVersion: 3, preferences: { ...base.preferences, viewMode: "tree", sortMode: "manual" }, folders: base.folders, tasks: rawTasks }, now);
  assert.equal(state.tasks[0].resolvedAt, state.tasks[0].updatedAt);
  assert.equal(state.tasks[1].resolvedAt, null);
});

test("validateBackupPayload enforces the complete v5 task and preference shape", () => {
  const state = createDefaultState(now);
  assert.deepEqual(validateBackupPayload(state), { valid: true, message: "", kind: "current" });
  const missingTimeline = structuredClone(state);
  delete missingTimeline.tasks[0].rescheduleHistory;
  assert.equal(validateBackupPayload(missingTimeline).valid, false);
  const invalidPriority = structuredClone(state);
  invalidPriority.tasks[0].priority = "medium";
  assert.equal(validateBackupPayload(invalidPriority).valid, false);
  const missingDescription = structuredClone(state);
  delete missingDescription.tasks[0].descriptionMarkdown;
  assert.equal(validateBackupPayload(missingDescription).valid, false);
});

test("v2 and legacy backups remain accepted for migration", () => {
  assert.equal(validateBackupPayload(legacyV2State()).kind, "v2");
  const legacy = { activeFilter: "open", currentIteration: { number: 1, title: "旧版" }, tasks: [{ id: "a", title: "任务", priority: "高", date: "2026-08-01" }] };
  assert.equal(validateBackupPayload(legacy).kind, "legacy");
  assert.equal(hydrateState(legacyV2State(), now).tasks[0].priority, "low");
});

test("stored payload validation uses local-data wording", () => {
  const result = validateStoredPayload({});
  assert.equal(result.valid, false);
  assert.match(result.message, /本地数据结构无效/);
  assert.doesNotMatch(result.message, /备份文件/);
});

test("orphaned task references and cyclic folders are repaired without task loss", () => {
  const base = createDefaultState(now);
  const input = {
    ...base,
    folders: [
      { id: "a", name: "A", parentId: "b", order: 0, collapsed: false, createdAt: 1, updatedAt: 1 },
      { id: "b", name: "B", parentId: "a", order: 0, collapsed: false, createdAt: 2, updatedAt: 2 },
    ],
    tasks: [{ ...base.tasks[0], folderId: "missing" }],
  };
  const state = hydrateState(input, now);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].folderId, null);
  assert.ok(state.folders.every((folder) => folder.parentId === null));
});

test("folder movement rejects cycles and hierarchy deeper than four levels", () => {
  const folders = [
    { id: "a", name: "A", parentId: null, order: 0, collapsed: false, createdAt: 1, updatedAt: 1 },
    { id: "b", name: "B", parentId: "a", order: 0, collapsed: false, createdAt: 2, updatedAt: 2 },
    { id: "c", name: "C", parentId: "b", order: 0, collapsed: false, createdAt: 3, updatedAt: 3 },
    { id: "d", name: "D", parentId: "c", order: 0, collapsed: false, createdAt: 4, updatedAt: 4 },
  ];
  assert.equal(getFolderDepth(folders, "d"), 4);
  assert.equal(canAddFolder(folders, "d"), false);
  assert.equal(canMoveFolder(folders, "a", "c"), false);
});

test("search and status/folder filters return the same task set for all four views", () => {
  const base = createDefaultState(now);
  const views = ["tree_manual", "global_priority", "global_due_date", "priority_then_due_date"];
  const resultSets = views.map((viewMode) => selectVisibleTasks({ ...base, preferences: { ...base.preferences, activeStatusFilter: "active", folderScope: "folder-work", viewMode } }, "重点").map((task) => task.id));
  assert.deepEqual(resultSets, [["task-1"], ["task-1"], ["task-1"], ["task-1"]]);
});

test("pending resolutions remain visible only as active until their timer finalizes", () => {
  const base = createDefaultState(now);
  const pending = {
    ...base.tasks[0],
    status: "completed",
    pendingResolution: {
      targetStatus: "completed",
      executeAt: now + 8_000,
      originFolderId: base.tasks[0].folderId,
      originOrder: base.tasks[0].order,
      originPriority: base.tasks[0].priority,
    },
  };
  const state = { ...base, tasks: [pending, ...base.tasks.slice(1)] };
  const active = selectVisibleTasks({ ...state, preferences: { ...state.preferences, activeStatusFilter: "active" } }, "");
  const completed = selectVisibleTasks({ ...state, preferences: { ...state.preferences, activeStatusFilter: "completed" } }, "");
  assert.ok(active.some((task) => task.id === pending.id));
  assert.ok(!completed.some((task) => task.id === pending.id));
  assert.equal(isOverdue({ ...pending, dueDate: "2026-08-09" }, "2026-08-10"), true);
});

test("overdue is strictly before local today while due metric includes today", () => {
  const task = { ...createDefaultState(now).tasks[0], dueDate: "2026-08-10" };
  assert.equal(isOverdue(task, "2026-08-10"), false);
  assert.equal(isDueOrOverdue(task, "2026-08-10"), true);
  assert.equal(dueDateGroup({ ...task, dueDate: "2026-08-09" }, "2026-08-10"), "overdue");
  assert.equal(isOverdue({ ...task, status: "completed", dueDate: "2026-08-09" }, "2026-08-10"), false);
});

test("default dates use local time and next workday skips weekends", () => {
  const friday = new Date(2026, 7, 14, 10).getTime();
  assert.equal(resolveDefaultDueDate("today", friday), "2026-08-14");
  assert.equal(resolveDefaultDueDate("tomorrow", friday), "2026-08-15");
  assert.equal(resolveDefaultDueDate("next_workday", friday), "2026-08-17");
  assert.equal(toISODate(new Date(2026, 6, 7, 0, 30)), "2026-07-07");
});

test("extended default due dates resolve to the intended calendar days (TEST-V08-031)", () => {
  const friday = new Date(2026, 7, 14, 10).getTime(); // 2026-08-14 周五
  const monday = new Date(2026, 7, 17, 10).getTime(); // 2026-08-17 周一
  assert.equal(resolveDefaultDueDate("in_3_days", friday), "2026-08-17");
  assert.equal(resolveDefaultDueDate("in_7_days", friday), "2026-08-21");
  assert.equal(resolveDefaultDueDate("this_friday", monday), "2026-08-21");
  assert.equal(resolveDefaultDueDate("this_friday", friday), "2026-08-21"); // 当天为周五时取下一个周五
  assert.equal(resolveDefaultDueDate("next_monday", friday), "2026-08-17");
  assert.equal(resolveDefaultDueDate("next_monday", monday), "2026-08-24"); // 当天为周一时取下周一
  assert.equal(resolveDefaultDueDate("none", friday), "");
});

test("folder paths include ancestors", () => {
  const folders = [
    { id: "a", name: "工作", parentId: null, order: 0, collapsed: false, createdAt: 1, updatedAt: 1 },
    { id: "b", name: "发布", parentId: "a", order: 0, collapsed: false, createdAt: 2, updatedAt: 2 },
  ];
  assert.equal(getFolderPath(folders, "b"), "工作 / 发布");
  assert.equal(getFolderPath(folders, null), "未分类");
});

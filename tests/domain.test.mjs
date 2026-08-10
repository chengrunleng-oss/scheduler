import test from "node:test";
import assert from "node:assert/strict";
import {
  canAddFolder,
  canMoveFolder,
  createDefaultState,
  dueDateGroup,
  getFolderDepth,
  hydrateState,
  isDueOrOverdue,
  selectVisibleTasks,
  toISODate,
  validateBackupPayload,
  validateStoredPayload,
} from "../dist/domain.js";

const now = 1_800_000_000_000;

function legacyV2State() {
  return {
    schemaVersion: 2,
    preferences: { activeFilter: "open", theme: "dark" },
    currentIteration: { number: 3, title: "旧轮次", completed: [], next: [] },
    iterations: [],
    tasks: [
      {
        id: "legacy-1",
        title: "旧任务",
        priority: "高",
        date: "2026-07-07",
        tag: "迁移",
        done: true,
        createdAt: 10,
        updatedAt: 20,
      },
    ],
  };
}

test("hydrateState migrates schema v2 tasks into schema v3 without iteration data", () => {
  const state = hydrateState(legacyV2State(), now);

  assert.equal(state.schemaVersion, 3);
  assert.equal(state.preferences.activeStatusFilter, "active");
  assert.equal(state.preferences.theme, "dark");
  assert.equal(state.preferences.viewMode, "tree");
  assert.equal(state.tasks[0].status, "completed");
  assert.equal(state.tasks[0].notes, "");
  assert.equal(state.tasks[0].folderId, null);
  assert.equal(state.tasks[0].order, 0);
  assert.equal("currentIteration" in state, false);
});

test("validateBackupPayload enforces the complete schema v3 task shape", () => {
  const state = createDefaultState(now);
  assert.deepEqual(validateBackupPayload(state), { valid: true, message: "", kind: "current" });

  const missingNotes = structuredClone(state);
  delete missingNotes.tasks[0].notes;
  assert.equal(validateBackupPayload(missingNotes).valid, false);

  const invalidStatus = structuredClone(state);
  invalidStatus.tasks[0].status = "done";
  assert.equal(validateBackupPayload(invalidStatus).valid, false);
});

test("validateBackupPayload accepts schema v2 and legacy backups for migration", () => {
  assert.deepEqual(validateBackupPayload(legacyV2State()), { valid: true, message: "", kind: "v2" });

  const legacy = {
    activeFilter: "open",
    currentIteration: { number: 1, title: "旧版本" },
    tasks: [{ id: "legacy-1", title: "旧任务", priority: "高", date: "2026-07-07" }],
  };
  assert.deepEqual(validateBackupPayload(legacy), { valid: true, message: "", kind: "legacy" });
});

test("stored payload validation uses local-data wording", () => {
  const result = validateStoredPayload({});
  assert.equal(result.valid, false);
  assert.match(result.message, /本地数据结构无效/);
  assert.doesNotMatch(result.message, /备份文件/);
});

test("orphaned task references and cyclic folders are repaired without losing tasks", () => {
  const base = createDefaultState(now);
  const input = {
    ...base,
    folders: [
      { id: "a", name: "A", parentId: "b", order: 0, collapsed: false, createdAt: 1, updatedAt: 1 },
      { id: "b", name: "B", parentId: "a", order: 0, collapsed: false, createdAt: 2, updatedAt: 2 },
    ],
    tasks: [
      { ...base.tasks[0], id: "cycle-task", folderId: "a" },
      { ...base.tasks[1], id: "orphan-task", folderId: "missing" },
    ],
  };
  const state = hydrateState(input, now);

  assert.equal(state.tasks.length, 2);
  assert.equal(state.tasks.find((task) => task.id === "cycle-task").folderId, "a");
  assert.equal(state.tasks.find((task) => task.id === "orphan-task").folderId, null);
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
  assert.equal(canMoveFolder(folders, "d", null), true);
});

test("search and status/folder filters return the same task set for every view", () => {
  const base = createDefaultState(now);
  const workFolder = base.folders.find((folder) => folder.id === "folder-work");
  assert.ok(workFolder);
  const resultSets = ["tree", "priority", "due_date"].map((viewMode) => {
    const state = {
      ...base,
      preferences: {
        ...base.preferences,
        activeStatusFilter: "active",
        folderScope: workFolder.id,
        viewMode,
      },
    };
    return selectVisibleTasks(state, "重点").map((task) => task.id);
  });

  assert.deepEqual(resultSets, [["task-1"], ["task-1"], ["task-1"]]);
});

test("due-date groups distinguish overdue, today, seven days, later, and unscheduled", () => {
  const task = { ...createDefaultState(now).tasks[0], dueDate: "" };
  const today = "2026-08-10";

  assert.equal(dueDateGroup({ ...task, dueDate: "2026-08-09" }, today), "overdue");
  assert.equal(dueDateGroup({ ...task, dueDate: today }, today), "today");
  assert.equal(dueDateGroup({ ...task, dueDate: "2026-08-17" }, today), "next_seven_days");
  assert.equal(dueDateGroup({ ...task, dueDate: "2026-08-18" }, today), "later");
  assert.equal(dueDateGroup(task, today), "unscheduled");
});

test("isDueOrOverdue ignores completed and discarded tasks", () => {
  const task = { ...createDefaultState(now).tasks[0], dueDate: "2026-07-06" };
  assert.equal(isDueOrOverdue({ ...task, status: "active" }, "2026-07-07"), true);
  assert.equal(isDueOrOverdue({ ...task, status: "completed" }, "2026-07-07"), false);
  assert.equal(isDueOrOverdue({ ...task, status: "discarded" }, "2026-07-07"), false);
});

test("toISODate uses local date fields instead of UTC slicing", () => {
  assert.equal(toISODate(new Date(2026, 6, 7, 0, 30, 0)), "2026-07-07");
});

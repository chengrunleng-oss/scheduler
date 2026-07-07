import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFeedbackSuggestions,
  createDefaultState,
  hydrateState,
  isDueOrOverdue,
  selectVisibleTasks,
  toISODate,
  validateBackupPayload,
} from "../dist/domain.js";
import { reduceState } from "../dist/store.js";

test("hydrateState fills missing nested fields and migrates legacy task date", () => {
  const state = hydrateState(
    {
      activeFilter: "open",
      tasks: [
        {
          id: "legacy-1",
          title: "旧任务",
          priority: "高",
          date: "2026-07-07",
          done: false,
        },
      ],
      currentIteration: {
        number: 3,
        title: "迁移测试",
      },
    },
    1_800_000_000_000,
  );

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.preferences.activeFilter, "open");
  assert.equal(state.preferences.theme, "system");
  assert.equal(state.tasks[0].priority, "high");
  assert.equal(state.tasks[0].dueDate, "2026-07-07");
  assert.ok(Array.isArray(state.currentIteration.completed));
  assert.ok(Array.isArray(state.currentIteration.next));
});

test("validateBackupPayload rejects unrelated json before hydration", () => {
  assert.equal(validateBackupPayload({}).valid, false);
  assert.equal(validateBackupPayload([]).valid, false);
  assert.equal(validateBackupPayload({ tasks: [] }).valid, false);
});

test("buildFeedbackSuggestions returns matched concrete suggestions", () => {
  const suggestions = buildFeedbackSuggestions("希望支持提醒、备份恢复和子任务");

  assert.deepEqual(suggestions, [
    "增加截止日期状态、到期提醒和逾期标记。",
    "完善 JSON 导入、备份恢复和数据校验提示。",
    "支持任务下的子任务清单和完成进度。",
  ]);
});

test("selectVisibleTasks filters by status and query without mutating defaults directly", () => {
  const base = createDefaultState(1_800_000_000_000);
  const withCompletedTask = reduceState(base, {
    type: "toggle-task",
    id: "task-1",
    done: true,
    now: 1_800_000_001_000,
  });
  const state = reduceState(withCompletedTask, { type: "set-filter", filter: "open" });

  const visible = selectVisibleTasks(state, "改进");

  assert.equal(visible.length, 1);
  assert.equal(visible[0].tag, "改进");
});

test("isDueOrOverdue ignores completed tasks", () => {
  const task = {
    id: "task",
    title: "检查提醒",
    priority: "high",
    dueDate: "2026-07-06",
    tag: "",
    done: true,
    createdAt: 1,
    updatedAt: 1,
  };

  assert.equal(isDueOrOverdue(task, "2026-07-07"), false);
});

test("toISODate uses local date fields instead of UTC slicing", () => {
  const date = new Date(2026, 6, 7, 0, 30, 0);

  assert.equal(toISODate(date), "2026-07-07");
});

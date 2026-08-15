import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

const primaryTask = "确定今天最重要的一件事";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry("workbench-test-workspace", { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      return root.getDirectoryHandle("workbench-test-workspace", { create: true });
    };
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("task-workbench-workspace-handles-v1");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.evaluate(() => localStorage.setItem("task-workbench-state-v5", JSON.stringify(globalThis.__createDefaultStateForTests?.())));
  await page.reload();
  await page.locator("#chooseWorkspaceDirectory").click();
  await Promise.all([
    page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
    page.locator("#workspaceSetupImport").click(),
  ]);
  await page.waitForFunction(() => Boolean(globalThis.__workspaceBackendForTests?.available));
});

async function createRootTask(page, title, options = {}) {
  await page.locator("#globalNewTask").click();
  const form = page.locator('form.inline-create[data-inline-kind="task"][data-folder-id="root"]');
  await form.locator('input[name="title"]').fill(title);
  if (options.priority) await form.locator('select[name="priority"]').selectOption(options.priority);
  if (options.dueDate !== undefined) await form.locator('input[name="dueDate"]').fill(options.dueDate);
  await form.locator('input[name="title"]').press("Enter");
  await waitForWorkspaceTask(page, title);
  return page.getByRole("option", { name: new RegExp(title) });
}

async function createFolderTask(page, folderName, title, priority = "high") {
  const heading = page.locator(".tree-group-heading").filter({ hasText: folderName }).first();
  await heading.getByRole("button", { name: "在此处新建任务" }).click();
  const form = page.locator('form.inline-create[data-inline-kind="task"]');
  await form.locator('input[name="title"]').fill(title);
  await form.locator('select[name="priority"]').selectOption(priority);
  await form.locator('input[name="title"]').press("Enter");
  await waitForWorkspaceTask(page, title);
  return page.getByRole("option", { name: new RegExp(title) });
}

async function persistDefaultState(page) {
  await page.locator("#themeSelect").selectOption("light");
}

async function waitForWorkspaceSave(page) {
  await expect.poll(() => page.evaluate(async () => {
    const backend = globalThis.__workspaceBackendForTests;
    if (!backend?.available || document.documentElement.dataset.workspaceSaveState !== "saved") return -1;
    return (await backend.loadWorkspace()).state.tasks.length;
  })).toBeGreaterThan(0);
}

async function waitForWorkspaceTask(page, title) {
  await expect.poll(() => page.evaluate(async (expectedTitle) => {
    const backend = globalThis.__workspaceBackendForTests;
    return Boolean(backend?.available && (await backend.loadWorkspace()).state.tasks.some((task) => task.title === expectedTitle));
  }, title)).toBe(true);
}

async function dragWithHover(page, source, hoverTarget, dropTarget = hoverTarget, hoverMs = 700) {
  const sourceBox = await source.boundingBox();
  const hoverBox = await hoverTarget.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(hoverBox).not.toBeNull();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2, { steps: 12 });
  await page.waitForTimeout(hoverMs);
  const dropBox = await dropTarget.boundingBox();
  expect(dropBox).not.toBeNull();
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("v5 only exposes high/low priority and four exclusive views", async ({ page }) => {
  await expect(page.locator("#defaultPriority option")).toHaveCount(2);
  await expect(page.locator('option[value="medium"]')).toHaveCount(0);
  await expect(page.locator("#sortMode")).toHaveCount(0);
  await expect(page.locator(".view-segment")).toHaveCount(4);
  await page.locator('[data-view="priority_then_due_date"]').click();
  await expect(page.locator('[data-view="priority_then_due_date"]')).toHaveAttribute("aria-pressed", "true");
});

test("folder headings create tasks and child folders inline", async ({ page }) => {
  const workHeading = page.locator(".tree-group-heading").filter({ hasText: "工作" }).first();
  await expect(workHeading.getByRole("button", { name: "建议按截止日期整理" })).toHaveCount(0);
  await workHeading.getByRole("button", { name: "在此处新建任务" }).click();
  const taskForm = page.locator('form.inline-create[data-inline-kind="task"]');
  await taskForm.locator('input[name="title"]').fill("行内创建任务");
  await taskForm.locator('select[name="priority"]').selectOption("low");
  await taskForm.locator('input[name="title"]').press("Enter");
  await expect(page.getByRole("option", { name: /行内创建任务/ })).toBeVisible();
  await expect(workHeading.getByRole("button", { name: "建议按截止日期整理" })).toBeVisible();

  await workHeading.getByRole("button", { name: "新建子文件夹" }).click();
  const folderForm = page.locator('form.inline-create[data-inline-kind="folder"]');
  await folderForm.locator('input[name="title"]').fill("发布准备");
  await folderForm.locator('input[name="title"]').press("Enter");
  await expect(page.locator(".tree-group-heading").filter({ hasText: "发布准备" })).toBeVisible();

  await workHeading.getByRole("button", { name: "新建子文件夹" }).click();
  await folderForm.locator('input[name="title"]').fill("取消创建");
  await folderForm.locator('input[name="title"]').press("Escape");
  await expect(page.locator(".tree-group-heading").filter({ hasText: "取消创建" })).toHaveCount(0);
});

test("main tree folder menu moves by parent and position, deletes with exact impact, and supports undo", async ({ page }) => {
  const workHeading = page.locator('[data-drop-folder-id="folder-work"]');
  await workHeading.locator('summary[aria-label^="管理文件夹"]').click();
  await workHeading.getByRole("button", { name: "移动" }).click();
  const moveDialog = page.locator("#folderMoveDialog");
  await moveDialog.getByLabel("目标上级").selectOption("folder-personal");
  await moveDialog.getByLabel("同级位置").selectOption("0");
  await moveDialog.getByRole("button", { name: "确认移动" }).click();
  expect(await page.locator('[data-tree-folder-id="folder-work"]').evaluate((node) => node.parentElement?.closest("[data-tree-folder-id]")?.dataset.treeFolderId)).toBe("folder-personal");
  await page.getByRole("button", { name: "撤销" }).click();
  expect(await page.locator('[data-tree-folder-id="folder-work"]').evaluate((node) => node.parentElement?.closest("[data-tree-folder-id]")?.dataset.treeFolderId)).toBe("root");

  await workHeading.locator('summary[aria-label^="管理文件夹"]').click();
  await workHeading.getByRole("button", { name: "删除" }).click();
  await expect(page.locator("#folderDeleteText")).toContainText("0 个子文件夹和 1 个任务");
  await page.locator("#folderDeleteMove").click();
  await expect(page.locator('[data-drop-folder-id="folder-work"]')).toHaveCount(0);
  await expect(page.getByRole("option", { name: new RegExp(primaryTask) })).toHaveAttribute("data-folder-id", "root");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.locator('[data-drop-folder-id="folder-work"]')).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(primaryTask) })).toHaveAttribute("data-folder-id", "folder-work");
});

test("root create actions stay at the tree end and use distinct accessible colors", async ({ page }) => {
  const actions = page.locator(".root-create-actions");
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((node) => node === node.parentElement?.lastElementChild)).toBe(true);
  const taskButton = actions.getByRole("button", { name: "新建未分类任务" });
  const folderButton = actions.getByRole("button", { name: "新建根文件夹" });
  const colors = await Promise.all([taskButton, folderButton].map((button) => button.evaluate((node) => getComputedStyle(node).color)));
  expect(colors[0]).not.toBe(colors[1]);

  await taskButton.click();
  let taskForm = page.locator('form.inline-create[data-folder-id="root"]');
  await taskForm.locator('input[name="title"]').press("Enter");
  await expect(taskForm).toBeVisible();
  await taskForm.locator('input[name="title"]').press("Escape");
  await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();

  await folderButton.click();
  const folderForm = page.locator('form.inline-create[data-inline-kind="folder"][data-folder-id="root"]');
  await folderForm.locator('input[name="title"]').fill("根级取消文件夹");
  await folderForm.locator('input[name="title"]').press("Escape");
  await expect(page.locator(".tree-group-heading").filter({ hasText: "根级取消文件夹" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();

  await taskButton.click();
  taskForm = page.locator('form.inline-create[data-folder-id="root"]');
  await taskForm.locator('input[name="title"]').fill("根级回车任务");
  await taskForm.locator('input[name="title"]').press("Enter");
  await expect(page.getByRole("option", { name: /根级回车任务/ })).toBeVisible();
  await expect(actions).toBeVisible();
  expect(await actions.evaluate((node) => node === node.parentElement?.lastElementChild)).toBe(true);
});

test("completion remains undoable across refresh and finalizes into handled section", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).getByRole("button", { name: "标记为已完成" }).click();
  await expect.poll(() => page.evaluate(async () => Boolean((await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks.find((task) => task.id === "task-1")?.pendingResolution))).toBe(true);
  let pending = page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) });
  await expect(pending).toHaveClass(/pending/);
  await expect(pending.getByRole("button", { name: "撤销处理" })).toBeVisible();

  await page.reload();
  pending = page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) });
  await expect(pending).toBeVisible();
  await expect(pending).toContainText(/秒内可撤销/);
  await expect(page.getByRole("button", { name: /已处理/ })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /已处理 1/ })).toBeVisible({ timeout: 10_000 });
  // 折叠态完全收起条目，先展开“已处理”区再操作恢复按钮。
  await expect(page.getByRole("option", { name: new RegExp(`${primaryTask}，已完成`) })).toHaveCount(0);
  await page.getByRole("button", { name: /已处理 1/ }).click();
  const completed = page.getByRole("option", { name: new RegExp(`${primaryTask}，已完成`) });
  await expect(completed.getByRole("button", { name: "恢复为待办" })).toBeVisible();
  await completed.getByRole("button", { name: "恢复为待办" }).click();
  await expect(page.getByRole("option", { name: new RegExp(`${primaryTask}，待办`) })).toBeVisible();
});

test("handled tasks render after child folders and collapse entirely until expanded (TEST-V08-016)", async ({ page }) => {
  await persistDefaultState(page);
  await page.evaluate(async () => {
    const state = (await globalThis.__workspaceBackendForTests.loadWorkspace()).state;
    const now = Date.now();
    state.folders.push({ id: "folder-work-child", name: "工作子文件夹", parentId: "folder-work", order: 0, collapsed: false, createdAt: now, updatedAt: now });
    for (let index = 0; index < 4; index += 1) {
      state.tasks.push({
        ...state.tasks[0], id: `handled-${index}`, title: `已处理-${index}`, status: "completed", pendingResolution: null,
        resolvedAt: now - index * 1_000, createdAt: now - index * 1_000, updatedAt: now - index * 1_000, order: index + 10,
      });
    }
    await globalThis.__workspaceBackendForTests.saveWorkspaceIndex(state);
  });
  await page.reload();

  const childHeading = page.locator('[data-drop-folder-id="folder-work-child"]');
  const handledHeading = page.locator('button[data-action="toggle-handled"][data-container-id="folder-work"]');
  await expect(childHeading).toBeVisible();
  await expect(handledHeading).toBeVisible();
  expect((await childHeading.boundingBox()).y).toBeLessThan((await handledHeading.boundingBox()).y);
  // 折叠态完全收起：标题可见但不渲染任何已处理条目。
  await expect(handledHeading).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("option", { name: /已处理-/ })).toHaveCount(0);
  await handledHeading.click();
  await expect(handledHeading).toHaveAttribute("aria-expanded", "true");
  for (const index of [0, 1, 2, 3]) await expect(page.getByRole("option", { name: new RegExp(`已处理-${index}`) })).toBeVisible();
  await handledHeading.click();
  await expect(handledHeading).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("option", { name: /已处理-/ })).toHaveCount(0);
});

test("pending resolution can be cancelled immediately", async ({ page }) => {
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  await row.getByRole("button", { name: "标记为不再需要" }).click();
  const pending = page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) });
  await pending.getByRole("button", { name: "撤销处理" }).click();
  await expect(page.getByRole("option", { name: new RegExp(`${primaryTask}，待办`) })).toBeVisible();
  await expect(page.locator("#metricDiscarded")).toHaveText("0");
});

test("active filter keeps independent pending tasks in place until each timer resolves", async ({ page }) => {
  await page.clock.install();
  await page.locator('[data-filter="active"]').click();
  const first = page.getByRole("option", { name: new RegExp(primaryTask) });
  const secondTitle = "安排一段不被打扰的专注时间";
  const second = page.getByRole("option", { name: new RegExp(secondTitle) });
  const beforeIds = await page.locator(".task-item").evaluateAll((rows) => rows.map((row) => row.dataset.id));

  await first.getByRole("button", { name: "标记为已完成" }).click();
  await expect(first).toHaveClass(/pending/);
  await expect(page.locator("#metricActive")).toHaveText("1");
  await expect(page.locator("#metricCompleted")).toHaveText("1");
  expect(await page.locator(".task-item").evaluateAll((rows) => rows.map((row) => row.dataset.id))).toEqual(beforeIds);

  await page.locator('[data-filter="completed"]').click();
  await expect(first).toHaveCount(0);
  await page.locator('[data-filter="active"]').click();
  await expect(first).toBeVisible();

  await page.clock.fastForward(1_000);
  await second.getByRole("button", { name: "标记为不再需要" }).click();
  await first.getByRole("button", { name: "撤销处理" }).click();
  await page.clock.fastForward(7_100);
  await expect(second).toHaveClass(/pending/);
  await expect(first).not.toHaveClass(/pending/);
  await page.clock.fastForward(1_000);
  await expect(second).toHaveCount(0);
  await expect(page.locator("#metricDiscarded")).toHaveText("1");
  await page.locator('[data-filter="discarded"]').click();
  await expect(page.getByRole("option", { name: new RegExp(secondTitle) })).toBeVisible();
});

test("overdue task is isolated, rescheduled to the future, and records a timeline", async ({ page }) => {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const past = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const overdue = await createRootTask(page, "逾期改期任务", { dueDate: past });
  await expect(overdue).toHaveClass(/overdue/);
  await expect(overdue.locator("time")).toContainText("已逾期 1 天");
  const actionLabels = await overdue.locator(".task-actions button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  expect(actionLabels).toEqual(["标记为已完成", "标记为不再需要", "重新安排截止日期", "更多任务操作"]);
  await overdue.locator(".task-main").click();
  await expect(page.locator("#timelineSection")).toBeHidden();
  await page.locator("#detailClose").click();

  await overdue.getByRole("button", { name: "更多任务操作" }).click();
  const moreDialog = page.locator("#moveDialog");
  await expect(moreDialog.locator("#moveRestriction")).toBeVisible();
  await expect(moreDialog.getByLabel("目标文件夹")).toBeDisabled();
  await expect(moreDialog.getByLabel("优先级")).toBeDisabled();
  await expect(moreDialog.getByRole("button", { name: "删除任务" })).toBeVisible();
  await expect(moreDialog.locator("#moveSubmit")).toBeHidden();
  await moreDialog.getByRole("button", { name: "关闭" }).click();

  await overdue.getByRole("button", { name: "重新安排截止日期" }).click();

  const dialog = page.locator("#rescheduleDialog");
  await dialog.getByRole("button", { name: "3 天后" }).click();
  await dialog.getByLabel("原因").fill("等待上游数据");
  await dialog.getByRole("button", { name: "确认改期" }).click();
  await expect(overdue).not.toHaveClass(/overdue/);
  await overdue.locator(".task-main").click();
  await expect(page.locator("#timelineSection")).toBeVisible();
  await expect(page.locator("#rescheduleTimeline")).toContainText("等待上游数据");
  await expect(page.locator("#rescheduleTimeline")).toContainText("快捷改期");
});

test("move menu changes folder and priority without drag", async ({ page }) => {
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  await row.getByRole("button", { name: "更多任务操作" }).click();
  const dialog = page.locator("#moveDialog");
  await dialog.getByLabel("目标文件夹").selectOption("folder-personal");
  await dialog.getByLabel("优先级").selectOption("low");
  await dialog.getByRole("button", { name: "移动到末尾" }).click();
  await expect(row).toHaveAttribute("data-folder-id", "folder-personal");
  await expect(row).toHaveAttribute("data-priority", "low");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(row).toHaveAttribute("data-folder-id", "folder-work");
});

test("task name, tag, and six-dot handle each start drag while click still selects", async ({ page }) => {
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  const target = page.locator(".tree-group-heading").filter({ hasText: "个人" }).first();

  await row.locator(".task-title-line strong").click();
  await expect(page.locator("#taskDetail")).toHaveClass(/is-open/);
  await page.locator("#detailClose").click();

  await row.locator(".task-title-line strong").dragTo(target);
  await expect(row).toHaveAttribute("data-folder-id", "folder-personal", { timeout: 20_000 });
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(row).toHaveAttribute("data-folder-id", "folder-work", { timeout: 20_000 });

  await row.locator(".task-meta").dragTo(target);
  await expect(row).toHaveAttribute("data-folder-id", "folder-personal", { timeout: 20_000 });
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(row).toHaveAttribute("data-folder-id", "folder-work", { timeout: 20_000 });

  await row.getByRole("button", { name: "拖动任务" }).dragTo(target);
  await expect(row).toHaveAttribute("data-folder-id", "folder-personal", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "撤销" })).toBeEnabled();
});

test("task drag supports exact reorder, undo, redo, root drop, and self-drop no-op", async ({ page }) => {
  await createFolderTask(page, "工作", "同组第二项", "high");
  await waitForWorkspaceSave(page);
  await page.reload();
  const workRows = page.locator('.task-item[data-folder-id="folder-work"][data-priority="high"]');
  const titles = () => workRows.locator("strong").allTextContents();
  await expect(workRows).toHaveCount(2);
  expect(await titles()).toEqual([primaryTask, "同组第二项"]);

  const first = page.getByRole("option", { name: new RegExp(primaryTask) });
  const second = page.getByRole("option", { name: /同组第二项/ });
  await first.getByRole("button", { name: "拖动任务" }).dragTo(second);
  expect(await titles()).toEqual(["同组第二项", primaryTask]);
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(workRows.locator("strong")).toHaveText([primaryTask, "同组第二项"]);
  await page.getByRole("button", { name: "重做" }).click();
  await expect(workRows.locator("strong")).toHaveText(["同组第二项", primaryTask]);

  await page.reload();
  await first.getByRole("button", { name: "拖动任务" }).dragTo(first);
  await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
  await first.getByRole("button", { name: "拖动任务" }).dragTo(page.locator('[data-drop-folder-id="root"]'));
  await expect(first).toHaveAttribute("data-folder-id", "root");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(first).toHaveAttribute("data-folder-id", "folder-work");
});

test("task drag previews the insertion and sibling motion before one atomic drop", async ({ page }) => {
  await createFolderTask(page, "工作", "实时预排列目标", "high");
  await waitForWorkspaceSave(page);
  await page.reload();
  await expect(page.locator('.task-item[data-folder-id="folder-work"][data-priority="high"]')).toHaveCount(2);
  const source = page.getByRole("option", { name: new RegExp(primaryTask) });
  const target = page.getByRole("option", { name: /实时预排列目标/ });
  const handleBox = await source.getByRole("button", { name: "拖动任务" }).boundingBox();
  expect(handleBox).not.toBeNull();
  const persistedBefore = await page.evaluate(async () => JSON.stringify((await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks));
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2 + 8, { steps: 4 });
  await expect(page.locator(".task-drop-placeholder")).toHaveCount(1);
  await expect(source).toHaveClass(/drag-source-collapsed/);
  const targetBefore = await target.boundingBox();
  expect(targetBefore).not.toBeNull();
  await page.mouse.move(targetBefore.x + targetBefore.width / 2, targetBefore.y + targetBefore.height * 0.8, { steps: 12 });
  const currentTarget = await target.boundingBox();
  await page.mouse.move(currentTarget.x + currentTarget.width / 2, currentTarget.y + currentTarget.height - 3);
  await page.waitForTimeout(35);
  const activeAnimations = await target.evaluate((node) => node.getAnimations().length);
  expect(activeAnimations).toBeGreaterThan(0);
  const placeholderAfterTarget = await page.locator(".task-drop-placeholder").evaluate((placeholder, targetId) => placeholder.previousElementSibling?.getAttribute("data-id") === targetId, await target.getAttribute("data-id"));
  expect(placeholderAfterTarget).toBe(true);
  await page.waitForTimeout(200);
  const targetAfter = await target.boundingBox();
  expect(Math.abs(targetAfter.y - targetBefore.y)).toBeGreaterThan(20);
  const persistedDuringPreview = await page.evaluate(async () => JSON.stringify((await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks));
  expect(persistedDuringPreview).toBe(persistedBefore);
  await page.mouse.up();
  await expect(page.locator(".task-drop-placeholder")).toHaveCount(0);
  const titles = await page.locator('.task-item[data-folder-id="folder-work"][data-priority="high"] strong').allTextContents();
  expect(titles).toEqual(["实时预排列目标", primaryTask]);
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.locator('.task-item[data-folder-id="folder-work"][data-priority="high"] strong')).toHaveText([primaryTask, "实时预排列目标"]);
});

test("invalid drop restores preview immediately and reduced motion skips FLIP animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createFolderTask(page, "工作", "取消拖拽目标", "high");
  await waitForWorkspaceSave(page);
  await page.reload();
  const source = page.getByRole("option", { name: new RegExp(primaryTask) });
  const target = page.getByRole("option", { name: /取消拖拽目标/ });
  const highPriorityTitles = page.locator('.task-item[data-folder-id="folder-work"][data-priority="high"] strong');
  await expect(highPriorityTitles).toHaveText([primaryTask, "取消拖拽目标"]);
  const orderBefore = await highPriorityTitles.allTextContents();
  const handleBox = await source.getByRole("button", { name: "拖动任务" }).boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2 + 8, { steps: 4 });
  const targetBox = await target.boundingBox();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.8, { steps: 10 });
  await expect(page.locator(".task-drop-placeholder")).toHaveCount(1);
  const animationCount = await page.locator(".task-list").evaluate((node) => node.getAnimations({ subtree: true }).length);
  expect(animationCount).toBe(0);
  await page.mouse.move(1438, 10);
  await page.mouse.up();
  await expect(page.locator(".task-drop-placeholder")).toHaveCount(0);
  await expect(source).not.toHaveClass(/drag-source-collapsed/);
  await expect(highPriorityTitles).toHaveText(orderBefore);
});

test("priority divider changes crossed priorities atomically and persists", async ({ page }) => {
  const low = await createFolderTask(page, "工作", "分界线低优先级", "low");
  await waitForWorkspaceSave(page);
  await page.reload();
  const divider = page.locator('[data-divider-folder-id="folder-work"]');
  await divider.dragTo(low);
  await expect(low).toHaveAttribute("data-priority", "high");
  await waitForWorkspaceSave(page);
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks.find((task) => task.title === "分界线低优先级")?.priority)).toBe("high");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(low).toHaveAttribute("data-priority", "low");
  await waitForWorkspaceSave(page);
  await page.getByRole("button", { name: "重做" }).click();
  await expect(low).toHaveAttribute("data-priority", "high");
  await waitForWorkspaceSave(page);
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks.find((task) => task.title === "分界线低优先级")?.priority)).toBe("high");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.getByRole("button", { name: "撤销" }).click();
    await expect(low).toHaveAttribute("data-priority", "low");
    await page.getByRole("button", { name: "重做" }).click();
    await expect(low).toHaveAttribute("data-priority", "high");
  }
  await waitForWorkspaceSave(page);
  await page.reload();
  await expect(low).toHaveAttribute("data-priority", "high");
});

test("priority groups use two compact full-row fills and a keyboard-adjustable left label", async ({ page }) => {
  const low = await createFolderTask(page, "工作", "冷色低优先级", "low");
  await waitForWorkspaceSave(page);
  await page.reload();
  const high = page.getByRole("option", { name: new RegExp(primaryTask) });
  const divider = page.locator('[data-divider-folder-id="folder-work"]');
  await expect(page.locator(".priority-heading")).toHaveCount(0);
  await expect(high).toHaveClass(/priority-band-high/);
  await expect(low).toHaveClass(/priority-band-low/);
  const colors = await Promise.all([high, low].map((row) => row.evaluate((node) => getComputedStyle(node).backgroundColor)));
  const surface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface").trim());
  expect(colors[0]).not.toBe(colors[1]);
  expect(colors[0]).not.toBe(surface);
  expect(colors[1]).not.toBe(surface);
  const geometry = await Promise.all([high, divider, low].map((item) => item.boundingBox()));
  expect(geometry.every(Boolean)).toBe(true);
  expect(geometry[1].width).toBeGreaterThanOrEqual(40);
  expect(geometry[1].height).toBeGreaterThanOrEqual(40);
  expect(geometry[2].y - (geometry[0].y + geometry[0].height)).toBeLessThan(20);
  await divider.focus();
  await page.keyboard.press("ArrowDown");
  await expect(low).toHaveAttribute("data-priority", "high");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(low).toHaveAttribute("data-priority", "low");
});

test("priority-aware selection stays distinct and every non-control task region selects the row", async ({ page }) => {
  const high = page.getByRole("option", { name: new RegExp(primaryTask) });
  const low = page.getByRole("option", { name: /安排一段不被打扰的专注时间/ });
  for (const theme of ["light", "dark"]) {
    await page.locator("#themeSelect").selectOption(theme);
    await high.locator(".task-meta").click();
    const highColor = await high.evaluate((node) => getComputedStyle(node).backgroundColor);
    await low.locator(".priority").click();
    const lowColor = await low.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(highColor).not.toBe(lowColor);
    await expect(low).toHaveAttribute("aria-selected", "true");
  }

  const actions = high.locator(".task-actions");
  await actions.click({ position: { x: 42, y: 20 } });
  await expect(high).toHaveAttribute("aria-selected", "true");
  await low.locator("time").click();
  await expect(low).toHaveAttribute("aria-selected", "true");
  await high.click({ position: { x: 8, y: 8 } });
  await expect(high).toHaveAttribute("aria-selected", "true");
});

test("priority threshold, folder headings, and workspace resizer use discoverable quiet styling", async ({ page }) => {
  const divider = page.locator('[data-divider-folder-id="folder-work"]');
  await expect(divider).toHaveAttribute("title", "拖动调整优先级分界");
  await expect(divider).toHaveText("");
  await expect(divider.locator(".priority-threshold-high")).toHaveCount(1);
  await expect(divider.locator(".priority-threshold-low")).toHaveCount(1);
  const threshold = await divider.locator(".priority-threshold").boundingBox();
  expect(Math.round(threshold.width)).toBe(28);
  expect(Math.round(threshold.height)).toBe(32);
  const folderBorders = await page.locator(".tree-group-heading").evaluateAll((headings) => headings.map((heading) => getComputedStyle(heading).borderBottomStyle));
  expect(folderBorders.every((style) => style === "none")).toBe(true);

  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-meta").click();
  const trackColor = await page.locator("#detailResizer").evaluate((node) => getComputedStyle(node, "::after").backgroundColor);
  expect(trackColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("collapsed folder expands after hover, restores when left, and stays open after drop", async ({ page }) => {
  const workHeading = page.locator('[data-drop-folder-id="folder-work"]');
  const rootHeading = page.locator('[data-drop-folder-id="root"]');
  const sourceTitle = "安排一段不被打扰的专注时间";
  const source = page.getByRole("option", { name: new RegExp(sourceTitle) });
  await workHeading.getByRole("button", { name: "折叠文件夹" }).click();
  await expect(workHeading.getByRole("button", { name: "展开文件夹" })).toBeVisible();

  await dragWithHover(page, source.getByRole("button", { name: "拖动任务" }), workHeading, rootHeading);
  await expect(source).toHaveAttribute("data-folder-id", "root");
  await expect(workHeading.getByRole("button", { name: "展开文件夹" })).toBeVisible();

  await dragWithHover(page, source.getByRole("button", { name: "拖动任务" }), workHeading);
  await expect(source).toHaveAttribute("data-folder-id", "folder-work");
  await expect(workHeading.getByRole("button", { name: "折叠文件夹" })).toBeVisible();
});

test("clicking the folder heading body toggles collapse while inner action buttons stay independent (TEST-V08-011)", async ({ page }) => {
  const workHeading = page.locator('[data-drop-folder-id="folder-work"]');
  await expect(workHeading.getByRole("button", { name: "折叠文件夹" })).toBeVisible();
  // 点击标题文字（不是箭头按钮）→ 折叠
  await workHeading.locator("strong").click();
  await expect(workHeading.getByRole("button", { name: "展开文件夹" })).toBeVisible();
  // 再点标题文字 → 展开
  await workHeading.locator("strong").click();
  await expect(workHeading.getByRole("button", { name: "折叠文件夹" })).toBeVisible();
  // 头部内的操作按钮保持独立行为，不会触发折叠
  await workHeading.getByRole("button", { name: "在此处新建任务" }).click();
  await expect(workHeading.getByRole("button", { name: "折叠文件夹" })).toBeVisible();
  await expect(page.locator('form.inline-create[data-inline-kind="task"]')).toBeVisible();
  await page.keyboard.press("Escape");
});

test("opening a task keeps the column header visible and animated in the wide layout (TEST-V08-012)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const head = page.locator(".list-head");
  await expect(head).toBeVisible();
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await expect(page.locator("#taskDetail.is-open")).toBeVisible();
  await expect(head).toBeVisible();
  for (const label of ["任务", "优先级", "截止日期", "操作"]) {
    await expect(head.locator("span").filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
  }
  const contract = await head.evaluate((node) => ({
    areas: getComputedStyle(node).gridTemplateAreas,
    display: getComputedStyle(node).display,
  }));
  expect(contract.display).toBe("grid");
  for (const area of ["title", "actions", "meta", "priority", "date"]) expect(contract.areas).toContain(area);
  const shellTransition = await page.locator("#appShell").evaluate((node) => getComputedStyle(node).transitionProperty);
  expect(shellTransition).toContain("grid-template-columns");
});

test("global folder path locates a task in the tree and clears blockers", async ({ page }) => {
  await page.locator('[data-view="global_priority"]').click();
  await page.locator("#searchInput").fill("重点");
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  await row.getByRole("button", { name: "工作" }).click();
  await expect(page.locator('[data-view="tree_manual"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#searchInput")).toHaveValue("");
  await expect(page.locator("#detailForm")).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(primaryTask) })).toHaveClass(/locating/);
});

test("task detail saves later due date and undo restores the timeline", async ({ page }) => {
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  await row.locator(".task-main").click();
  const future = new Date();
  future.setDate(future.getDate() + 10);
  const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  await page.locator("#detailDueDate").fill(date);
  await page.locator("#detailRescheduleReason").fill("交付范围变化");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.locator("#rescheduleTimeline")).toContainText("交付范围变化");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.locator("#timelineSection")).toBeHidden();
});

test("task workspace autosaves Markdown description and dated work log before switching tasks", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await expect(page.locator("#workspaceTabs")).toBeVisible();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#descriptionEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });

  const description = page.locator("#descriptionEditor [contenteditable='true'], #descriptionEditor textarea").first();
  const daily = page.locator("#worklogEditor [contenteditable='true'], #worklogEditor textarea").first();
  await description.fill("# 长期目标\n\n完成工作区升级");
  await daily.fill("- [x] 完成数据迁移\n- [ ] 验证附件备份");
  await page.locator("#worklogProgress").fill("65");
  await expect(page.locator("#descriptionSaveStatus")).toHaveText("已保存", { timeout: 5_000 });
  await expect(page.locator("#worklogSaveStatus")).toHaveText("已保存", { timeout: 5_000 });

  const saved = await page.evaluate(async () => {
    const task = (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks.find((item) => item.id === "task-1");
    return { description: task.descriptionMarkdown, log: (await globalThis.__workspaceBackendForTests.listWorkLogs("task-1"))[0] };
  });
  expect(saved.description).toContain("长期目标");
  expect(saved.log.contentMarkdown).toContain("完成数据迁移");
  expect(saved.log.progressPercent).toBe(65);

  await page.getByRole("option", { name: /安排一段不被打扰的专注时间/ }).locator(".task-main").click();
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await expect(page.locator("#descriptionEditor")).toContainText("长期目标", { timeout: 20_000 });
  await expect(page.locator("#worklogDate")).toHaveAttribute("max", /^\d{4}-\d{2}-\d{2}$/);
  const currentDate = await page.locator("#worklogDate").inputValue();
  await page.locator("#worklogDate").evaluate((input) => { input.value = "2999-01-01"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect(page.locator("#worklogDate")).toHaveValue(currentDate);

  await page.locator("#detailClose").click();
  await page.getByRole("option", { name: new RegExp(primaryTask) }).getByRole("button", { name: "标记为已完成" }).click();
  await page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) }).locator(".task-main").click();
  await expect(page.locator("#descriptionEditor textarea[readonly]")).toBeVisible();
  await page.locator("#detailClose").click();
  await page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) }).getByRole("button", { name: "撤销处理" }).click();
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await expect(page.locator("#descriptionEditor textarea:not([readonly])")).toBeVisible();
});

test("work logs support explicit create, open, delete, IndexedDB removal, and short undo", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });
  await page.locator("#newWorklog").click();
  const editor = page.locator("#worklogEditor [contenteditable='true'], #worklogEditor textarea").first();
  await editor.fill("今天完成了可撤销删除验证");
  await page.locator("#worklogProgress").fill("80");
  await expect(page.locator("#worklogSaveStatus")).toHaveText("已保存", { timeout: 5_000 });
  const history = page.locator(".worklog-history-item");
  await expect(history).toHaveCount(1);
  await history.getByRole("button", { name: /编辑/ }).click();
  await expect(editor).toHaveValue(/可撤销删除验证/);

  await history.getByRole("button", { name: /删除/ }).click();
  await page.locator("#confirmOk").click();
  await expect(page.locator("#worklogUndo")).toBeVisible();
  await expect(history).toHaveCount(0);
  expect(await page.evaluate(async () => (await globalThis.__workspaceBackendForTests.listWorkLogs("task-1")).length)).toBe(0);

  await page.locator("#undoWorklogDelete").click();
  await expect(page.locator("#worklogUndo")).toBeHidden();
  await expect(history).toHaveCount(1);
  await expect(editor).toHaveValue(/可撤销删除验证/);
});

test("worklog editor shows Markdown source while history renders compiled HTML (TEST-V08-014a)", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });
  await page.locator("#newWorklog").click();
  const editor = page.locator("#worklogEditor textarea").first();
  await editor.fill("# 今日标题\n\n**加粗结论** 与 [示例链接](https://example.com)");
  await expect(page.locator("#worklogSaveStatus")).toHaveText("已保存", { timeout: 5_000 });

  // 编辑区保留 Markdown 源码。
  await expect(editor).toHaveValue("# 今日标题\n\n**加粗结论** 与 [示例链接](https://example.com)");
  // 历史记录显示编译后的 HTML，而不是源码。
  const historyContent = page.locator("#worklogHistory .history-content");
  await expect(historyContent.locator("h1")).toHaveText("今日标题");
  await expect(historyContent.locator("strong")).toHaveText("加粗结论");
  await expect(historyContent.locator("a")).toHaveAttribute("href", "https://example.com");
  await expect(historyContent).not.toContainText("**");
});

test("image dropped into daily record is stored as an attachment reference and survives reload (TEST-V08-014b)", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });

  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const dragFile = (targetSelector, eventTypes) => page.evaluate(({ base64, selector, types }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const file = new File([bytes], "photo.png", { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const target = document.querySelector(selector);
    const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
    for (const type of types) target.dispatchEvent(new DragEvent(type, options));
  }, { base64: pngBase64, selector: targetSelector, types: eventTypes });

  // 真实拖放序列：dragenter/dragover（浏览器要求 preventDefault 才会交付文件），
  // 且落在预览区——监听只在 textarea 上时这里完全不生效。
  await dragFile("#worklogEditor .markdown-preview", ["dragenter", "dragover"]);
  await expect(page.locator("#worklogEditor .markdown-shell")).toHaveClass(/drag-active/);
  await dragFile("#worklogEditor .markdown-preview", ["drop"]);
  await expect(page.locator("#worklogEditor .markdown-shell")).not.toHaveClass(/drag-active/);

  // 编辑器源码出现 attachment: 引用，预览渲染为真实图片。
  await expect(page.locator("#worklogEditor textarea")).toHaveValue(/!\[photo\.png\]\(attachment:[^)]+\)/, { timeout: 20_000 });
  await expect(page.locator("#worklogEditor .markdown-preview img")).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
  await expect(page.locator("#worklogSaveStatus")).toHaveText("已保存", { timeout: 5_000 });

  // 照片落入附件分区（backend 附件清单），而不是嵌入会话链接。
  const attachment = await page.evaluate(async () => {
    const metas = await globalThis.__workspaceBackendForTests.listAttachments("task-1");
    return metas[0] ? { name: metas[0].name, kind: metas[0].kind, bytes: (await globalThis.__workspaceBackendForTests.readAttachment(metas[0].id)).size } : null;
  });
  expect(attachment).toMatchObject({ name: "photo.png", kind: "image" });
  expect(attachment.bytes).toBeGreaterThan(0);

  // 刷新后历史记录仍能解析 attachment: 引用并显示图片。
  await page.reload();
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogHistory .history-content img")).toHaveAttribute("src", /^blob:/, { timeout: 20_000 });
});

test("embedded data-uri images migrate into attachments (TEST-V08-014c)", async ({ page }) => {
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const date = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  await page.evaluate(async ({ workDate, base64 }) => {
    await globalThis.__workspaceBackendForTests.saveWorkLog({ taskId: "task-1", workDate, contentMarkdown: `![内嵌截图](data:image/png;base64,${base64})`, progressPercent: 0 });
  }, { workDate: date, base64: pngBase64 });

  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#attachmentsTab").click();
  await page.locator("#migrateEmbeddedImages").click();
  await expect(page.locator("#toast")).toContainText("已迁移 1 张内嵌图片", { timeout: 20_000 });

  const result = await page.evaluate(async () => {
    const attachments = await globalThis.__workspaceBackendForTests.listAttachments("task-1");
    const record = (await globalThis.__workspaceBackendForTests.listWorkLogs("task-1"))[0];
    return { attachments: attachments.map((meta) => ({ name: meta.name, kind: meta.kind })), content: record?.contentMarkdown ?? "" };
  });
  expect(result.attachments).toEqual([{ name: "内嵌截图.png", kind: "image" }]);
  expect(result.content).not.toContain("data:image");
  expect(result.content).toContain("attachment:");
});

test("attachments persist blobs, preview text, and insert image references into Markdown", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#attachmentsTab").click();
  await page.locator("#attachmentFile").setInputFiles([
    { name: "进展.log", mimeType: "text/plain", buffer: Buffer.from("build ok\nall checks passed") },
    { name: "截图.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") },
  ]);
  await expect(page.locator(".attachment-row")).toHaveCount(2, { timeout: 20_000 });
  const textRow = page.locator(".attachment-row").filter({ hasText: "进展.log" });
  await textRow.getByRole("button", { name: "预览附件" }).click();
  await expect(page.locator("#attachmentPreview")).toContainText("all checks passed");
  const imageRow = page.locator(".attachment-row").filter({ hasText: "截图.png" });
  await imageRow.getByRole("button", { name: "插入长期描述" }).click();
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks.find((task) => task.id === "task-1").descriptionMarkdown)).toContain("attachment:");
  const blobCount = await page.evaluate(async () => (await globalThis.__workspaceBackendForTests.listAttachments("task-1")).length);
  expect(blobCount).toBe(2);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportData").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/task-workbench-\d{4}-\d{2}-\d{2}\.zip/);
  const downloadPath = await download.path();
  const archive = await JSZip.loadAsync(await readFile(downloadPath));
  const manifest = JSON.parse(await archive.file("manifest.json").async("text"));
  expect(manifest.schemaVersion).toBe(6);
  expect(manifest.workspaceId).toBeTruthy();
  expect(manifest.snapshotId).toBeTruthy();
  expect(manifest.contentSummary.attachments).toBe(2);
  expect(manifest.attachments).toHaveLength(2);
  for (const item of manifest.attachments) {
    expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(archive.file(item.path)).not.toBeNull();
  }

  await page.locator("#resetDemo").click();
  await page.locator("#confirmOk").click();
  await page.locator("#importFile").setInputFiles(downloadPath);
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  await expect(page.locator("#importSourceMeta")).toContainText("v6");
  await expect(page.locator("#importItemList .import-item")).not.toHaveCount(0);
  const safetyDownloadPromise = page.waitForEvent("download");
  await page.locator("#importApplyMerge").click();
  const safetyDownload = await safetyDownloadPromise;
  expect(safetyDownload.suggestedFilename()).toMatch(/task-workbench-before-import-/);
  await expect(page.locator("#importResultDialog")).toBeVisible({ timeout: 20_000 });
  const reportDownloadPromise = page.waitForEvent("download");
  await page.locator("#importDownloadReport").click();
  expect((await reportDownloadPromise).suggestedFilename()).toMatch(/task-workbench-import-report-/);
  await page.locator("#importRollback").click();
  await expect(page.locator("#importResultDialog")).not.toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.listAttachments("task-1")).length), { timeout: 20_000 }).toBe(0);

  await page.locator("#importFile").setInputFiles(downloadPath);
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  const secondSafetyDownloadPromise = page.waitForEvent("download");
  await page.locator("#importApplyMerge").click();
  await secondSafetyDownloadPromise;
  await expect(page.locator("#importResultDialog")).toBeVisible({ timeout: 20_000 });
  await page.locator("#importResultDone").click();
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.listAttachments("task-1")).length), { timeout: 20_000, intervals: [100, 250, 500] }).toBe(2);
  await expect(page.getByRole("option", { name: new RegExp(primaryTask) })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await expect(page.locator("#taskDetail.is-open")).toBeVisible({ timeout: 20_000 });
  await page.locator("#attachmentsTab").evaluate((button) => button.click());
  await expect(page.locator(".attachment-row")).toHaveCount(2, { timeout: 20_000 });

  await page.reload();
  await page.locator("#importHistory").click();
  await expect(page.locator("#importResultDialog")).toBeVisible();
  await expect(page.locator("#importResultText")).toContainText("恢复点保存在工作区目录中");
  await expect(page.locator("#importRollback")).toBeEnabled();
  await page.locator("#importRollback").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmOk").click();
  await expect(page.locator("#importResultDialog")).not.toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.listAttachments("task-1")).length), { timeout: 20_000 }).toBe(0);
  await page.locator("#importHistory").click();
  await expect(page.locator("#importResultText")).toContainText("已于");
  await expect(page.locator("#importRollback")).toBeDisabled();
  await page.locator("#importResultDone").click();
});

test("import preview focuses conflicts and updates impact for individual and batch decisions", async ({ page }) => {
  const exportPromise = page.waitForEvent("download");
  await page.locator("#exportData").click();
  const exported = await exportPromise;
  const archive = await JSZip.loadAsync(await readFile(await exported.path()));
  const manifestFile = archive.file("manifest.json");
  expect(manifestFile).not.toBeNull();
  const manifest = JSON.parse(await manifestFile.async("text"));
  for (const [index, task] of manifest.appState.tasks.slice(0, 2).entries()) {
    task.title = `${task.title}（导入版本 ${index + 1}）`;
    task.updatedAt += 1;
  }
  archive.file("manifest.json", JSON.stringify(manifest, null, 2));
  const conflictBackup = await archive.generateAsync({ type: "nodebuffer" });

  await page.locator("#importFile").setInputFiles({ name: "双任务冲突.zip", mimeType: "application/zip", buffer: conflictBackup });
  const dialog = page.locator("#importCenterDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator('#importFilters [data-merge-filter="attention"]')).toHaveClass(/active/);
  await expect(page.locator("#importSourceMeta")).toContainText("导出于");
  await expect(page.locator("#importSourceMeta")).toContainText("来源");
  await expect(page.locator("#importVisibleCount")).toContainText("显示 2 /");
  await expect(page.locator("#importItemList .import-item:visible")).toHaveCount(2);

  const firstDifference = page.locator("#importItemList .import-item:visible .import-diff").first();
  await firstDifference.locator("summary").click();
  await expect(firstDifference).toContainText("当前：");
  await expect(firstDifference).toContainText("导入：");
  const impactValue = (label) => page.locator("#importSummary .import-stat", { hasText: label }).locator("strong");
  await expect(impactValue("将更新")).toHaveText("0");
  await expect(impactValue("跳过")).toHaveText("2");

  await page.locator("#importItemList .import-item:visible .import-decision").first().selectOption("use-imported");
  await expect(impactValue("将更新")).toHaveText("1");
  await expect(impactValue("跳过")).toHaveText("1");
  await page.locator("#importBatchGroup").selectOption("task:conflict");
  await page.locator("#importBatchDecision").selectOption("use-imported");
  await page.locator("#importBatchApply").click();
  await expect(impactValue("将更新")).toHaveText("2");
  await expect(impactValue("跳过")).toHaveText("0");
  await page.locator("#importCenterCancel").click();
  await expect(dialog).not.toBeVisible();
});

test("import content verification mismatch automatically restores the previous workspace", async ({ page }) => {
  const originalTitle = await page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks[0].title);
  const exportPromise = page.waitForEvent("download");
  await page.locator("#exportData").click();
  const exported = await exportPromise;
  const archive = await JSZip.loadAsync(await readFile(await exported.path()));
  const manifestFile = archive.file("manifest.json");
  const manifest = JSON.parse(await manifestFile.async("text"));
  manifest.appState.tasks[0].title = "写后校验故障注入版本";
  manifest.appState.tasks[0].updatedAt += 1;
  archive.file("manifest.json", JSON.stringify(manifest, null, 2));
  const backup = await archive.generateAsync({ type: "nodebuffer" });
  await page.locator("#importFile").setInputFiles({ name: "校验故障.zip", mimeType: "application/zip", buffer: backup });
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  await page.locator('#importItemList .import-item[data-merge-status="conflict"] .import-decision').first().selectOption("use-imported");

  await page.evaluate(() => {
    const backend = globalThis.__workspaceBackendForTests;
    const importSnapshot = backend.importSnapshot.bind(backend);
    const exportSnapshot = backend.exportSnapshot.bind(backend);
    let importCount = 0;
    let firstImportCompleted = false;
    let injected = false;
    backend.importSnapshot = async (snapshot) => {
      importCount += 1;
      await importSnapshot(snapshot);
      if (importCount === 1) firstImportCompleted = true;
    };
    backend.exportSnapshot = async () => {
      const snapshot = await exportSnapshot();
      if (firstImportCompleted && !injected) {
        injected = true;
        return { ...snapshot, state: { ...snapshot.state, tasks: snapshot.state.tasks.map((task, index) => index === 0 ? { ...task, title: "被截断的错误内容" } : task) } };
      }
      return snapshot;
    };
  });
  const safetyDownload = page.waitForEvent("download");
  await page.locator("#importApplyMerge").click();
  await safetyDownload;
  await expect(page.locator("#importProgressDialog")).not.toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#toast")).toContainText("导入失败，已自动回滚", { timeout: 20_000 });
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.tasks[0].title), { timeout: 20_000 }).toBe(originalTitle);
});

test("backup with a worklog passes write verification and merges the record (TEST-V08-013)", async ({ page }) => {
  // 导出当前工作区作为种子：appState 与当前一致，且不含工作记录。
  const exportPromise = page.waitForEvent("download");
  await page.locator("#exportData").click();
  const exported = await exportPromise;
  const archive = await JSZip.loadAsync(await readFile(await exported.path()));
  const manifest = JSON.parse(await archive.file("manifest.json").async("text"));
  expect(manifest.contentSummary.workLogs).toBe(0);

  // 注入一条不含 conflictOrigin 键的工作记录。JSON 序列化会丢弃 undefined 值，
  // 所以任何正常导出的备份其工作记录都没有该键——这正是修复前写后校验把
  // “键存在但值为 undefined”与“键不存在”误判为内容不同、导致含工作记录的
  // 导入全部自动回滚的回归种子。
  const worklog = {
    id: "task-1::2026-08-12",
    taskId: "task-1",
    workDate: "2026-08-12",
    progressPercent: 100,
    createdAt: 1786472141892,
    updatedAt: 1786472246085,
    path: "worklogs/task-1/2026-08-12.md",
  };
  manifest.workLogs = [worklog];
  manifest.contentSummary.workLogs = 1;
  archive.file("manifest.json", JSON.stringify(manifest, null, 2));
  archive.file(worklog.path, "K+K 相位测量回归验证");
  const backup = await archive.generateAsync({ type: "nodebuffer" });

  await page.locator("#importFile").setInputFiles({ name: "含工作记录备份.zip", mimeType: "application/zip", buffer: backup });
  await expect(page.locator("#importCenterDialog")).toBeVisible();
  const worklogItem = page.locator('#importItemList .import-item[data-merge-type="worklog"]');
  await expect(worklogItem).toHaveCount(1);
  await expect(worklogItem).toContainText("2026-08-12 工作记录");

  const safetyDownload = page.waitForEvent("download");
  await page.locator("#importApplyMerge").click();
  await safetyDownload;
  await expect(page.locator("#importProgressDialog")).not.toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#importResultDialog")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#importResultText")).toContainText("通过写入校验");
  await page.locator("#importResultDone").click();

  // 合并写入的工作记录通过写后校验并持久化。
  await expect.poll(() => page.evaluate(async () => (await globalThis.__workspaceBackendForTests.listWorkLogs("task-1"))[0]?.contentMarkdown), { timeout: 20_000 }).toBe("K+K 相位测量回归验证");
});

test("text attachments can be edited and saved through the active backend", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#attachmentsTab").click();
  await page.locator("#attachmentFile").setInputFiles({ name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("before") });
  const row = page.locator(".attachment-row").filter({ hasText: "notes.md" });
  await expect(row.getByRole("button", { name: "使用浏览器打开" })).toHaveCount(0);
  await row.getByRole("button", { name: "编辑文本附件" }).click();
  await page.locator(".attachment-text-editor").fill("after\nupdated");
  await page.locator("#attachmentPreview").getByRole("button", { name: "保存" }).click();
  await expect(page.locator("#toast")).toContainText("文本附件已保存");
  await page.locator("#overviewTab").click();
  const [toastBox, detailActionBox] = await Promise.all([page.locator("#toast").boundingBox(), page.locator("#cancelDetail").boundingBox()]);
  expect(toastBox).not.toBeNull();
  expect(detailActionBox).not.toBeNull();
  expect(toastBox.y + toastBox.height).toBeLessThan(detailActionBox.y);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toast").evaluate((toast) => { toast.hidden = false; toast.textContent = "移动端提示位置验证"; });
  const [mobileToastBox, mobileSaveBox] = await Promise.all([page.locator("#toast").boundingBox(), page.locator("#detailForm button[type='submit']").boundingBox()]);
  expect(mobileToastBox).not.toBeNull();
  expect(mobileSaveBox).not.toBeNull();
  expect(mobileToastBox.y + mobileToastBox.height).toBeLessThan(mobileSaveBox.y);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("#attachmentsTab").click();
  await row.getByRole("button", { name: "预览附件" }).click();
  await expect(page.locator("#attachmentPreview")).toContainText("after");
  await expect(page.locator("#attachmentPreview")).toContainText("updated");
});

test("HTML and SVG stay inert while PDF uses the dedicated preview", async ({ page }) => {
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await page.locator("#attachmentsTab").click();
  await page.locator("#attachmentFile").setInputFiles([
    { name: "unsafe.html", mimeType: "text/html", buffer: Buffer.from("<script>window.__unsafeExecuted = true</script><h1>HTML text</h1>") },
    { name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='window.__unsafeExecuted = true'><text>SVG text</text></svg>") },
    { name: "guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") },
  ]);
  await expect(page.locator(".attachment-row")).toHaveCount(3);
  for (const name of ["unsafe.html", "unsafe.svg"]) {
    const row = page.locator(".attachment-row").filter({ hasText: name });
    await expect(row.getByRole("button", { name: "使用浏览器打开" })).toHaveCount(0);
    await row.getByRole("button", { name: "预览附件" }).click();
    await expect(page.locator("#attachmentPreview .text-preview")).toContainText(name.endsWith("html") ? "<script>" : "<svg");
  }
  expect(await page.evaluate(() => Boolean(window.__unsafeExecuted))).toBe(false);
  const pdfRow = page.locator(".attachment-row").filter({ hasText: "guide.pdf" });
  await pdfRow.getByRole("button", { name: "预览附件" }).click();
  await expect(page.locator("#attachmentPreview iframe")).toHaveAttribute("title", "guide.pdf");
  await expect(pdfRow.getByRole("button", { name: "编辑文本附件" })).toHaveCount(0);
});

test("workspace width persists on wide desktop and becomes full-screen on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  await expect(page.locator("#taskDetail")).toHaveCSS("width", "620px");
  await page.locator("#detailResizer").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#taskDetail")).toHaveCSS("width", "636px");
  await expect(page.locator("html")).toHaveAttribute("data-workspace-save-state", "saved");
  await page.reload();
  await page.waitForFunction(() => Boolean(globalThis.__workspaceBackendForTests?.available));
  expect(await page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state.preferences.workspaceWidth)).toBe(636);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  const box = await page.locator("#taskDetail").boundingBox();
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.height)).toBe(844);
});

test("workspace-open task rows stay compact at all supported panel widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await persistDefaultState(page);
  for (const workspaceWidth of [560, 620, 680]) {
    await page.evaluate(async (width) => {
      const state = (await globalThis.__workspaceBackendForTests.loadWorkspace()).state;
      state.preferences.workspaceWidth = width;
      await globalThis.__workspaceBackendForTests.saveWorkspaceIndex(state);
    }, workspaceWidth);
    await page.reload();
    const row = page.getByRole("option", { name: new RegExp(primaryTask) });
    await row.locator(".task-meta").click();
    await expect(page.locator("#taskDetail")).toHaveCSS("width", `${workspaceWidth}px`);
    const metrics = await row.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const actions = node.querySelector(".task-actions").getBoundingClientRect();
      const title = node.querySelector(".task-title-line").getBoundingClientRect();
      const meta = node.querySelector(".task-meta").getBoundingClientRect();
      const priority = node.querySelector(".priority").getBoundingClientRect();
      const time = node.querySelector("time").getBoundingClientRect();
      const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return {
        height: rect.height,
        unusedAfterActions: rect.right - actions.right,
        titleActionsOverlap: overlap(title, actions),
        metaPriorityOverlap: overlap(meta, priority),
        priorityTimeOverlap: overlap(priority, time),
      };
    });
    expect(metrics.height).toBeLessThanOrEqual(112);
    expect(metrics.unusedAfterActions).toBeLessThanOrEqual(80);
    expect(metrics.titleActionsOverlap).toBe(0);
    expect(metrics.metaPriorityOverlap).toBe(0);
    expect(metrics.priorityTimeOverlap).toBe(0);
  }
});

test("workspace and task list never overlap across target desktop and mobile viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  for (const viewport of [
    { width: 1440, height: 900, split: true },
    { width: 1366, height: 768, split: true },
    { width: 1180, height: 800, split: false },
    { width: 1024, height: 768, split: false },
    { width: 768, height: 1024, split: false },
    { width: 390, height: 844, split: false },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const list = document.querySelector("#taskList");
      const main = document.querySelector("main.workspace");
      const panel = document.querySelector("#taskDetail");
      const visible = (node) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && node.getBoundingClientRect().width > 0;
      };
      const listVisible = visible(list);
      const listRect = list.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const overlapWidth = listVisible ? Math.max(0, Math.min(listRect.right, panelRect.right) - Math.max(listRect.left, panelRect.left)) : 0;
      const overlapHeight = listVisible ? Math.max(0, Math.min(listRect.bottom, panelRect.bottom) - Math.max(listRect.top, panelRect.top)) : 0;
      return {
        listVisible,
        overlapArea: overlapWidth * overlapHeight,
        mainWidth: visible(main) ? main.getBoundingClientRect().width : 0,
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
      };
    });
    expect(geometry.overlapArea).toBe(0);
    expect(geometry.listVisible).toBe(viewport.split);
    if (viewport.split) expect(geometry.mainWidth).toBeGreaterThanOrEqual(500);
    expect(geometry.panelLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.panelRight).toBeLessThanOrEqual(viewport.width + 1);
  }
});

test("standard desktop uses a compact navigation rail without losing accessible controls", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector("#sidebar");
    const copy = sidebar.querySelector(".brand-copy");
    const newTask = sidebar.querySelector("#globalNewTask");
    const storageButtons = Array.from(sidebar.querySelectorAll(".workspace-storage-actions .button:not([hidden])"));
    const storageText = Array.from(sidebar.querySelectorAll(".workspace-storage-status, .workspace-storage-actions .button span"));
    return {
      sidebarWidth: sidebar.getBoundingClientRect().width,
      copyDisplay: getComputedStyle(copy).display,
      newTaskWidth: newTask.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      storageButtonSizes: storageButtons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
      storageTextHidden: storageText.every((node) => getComputedStyle(node).display === "none"),
    };
  });
  expect(geometry.sidebarWidth).toBe(72);
  expect(geometry.copyDisplay).toBe("none");
  expect(geometry.newTaskWidth).toBeGreaterThanOrEqual(40);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.storageTextHidden).toBe(true);
  expect(geometry.storageButtonSizes).toEqual([{ width: 40, height: 40 }]);
  await expect(page.locator("#globalNewTask")).toHaveAccessibleName("新建任务");
  await expect(page.locator("#chooseWorkspaceDirectory")).toHaveAccessibleName("切换本地目录");
});

test("system theme and reduced motion keep the visual hierarchy without animated movement", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#themeSelect").selectOption("system");
  const values = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const row = document.querySelector(".task-item") ?? document.querySelector("main");
    return {
      colorScheme: root.colorScheme,
      background: root.getPropertyValue("--bg").trim(),
      transitionDuration: getComputedStyle(row).transitionDuration,
      animationDuration: getComputedStyle(row).animationDuration,
    };
  });
  expect(values.colorScheme).toContain("dark");
  expect(values.background).toBe("#101315");
  expect(values.transitionDuration).toBe("0s");
  expect(values.animationDuration).toBe("0s");
  await context.close();
});

test("four-level sticky-note folders retain parent edges, distinct layers, and no overflow", async ({ page }) => {
  await persistDefaultState(page);
  await page.evaluate(async () => {
    const state = (await globalThis.__workspaceBackendForTests.loadWorkspace()).state;
    const now = Date.now();
    state.folders = ["一级目录", "二级目录", "三级目录", "四级目录"].map((name, index) => ({
      id: `depth-${index + 1}`, name, parentId: index ? `depth-${index}` : null, order: 0, collapsed: false, createdAt: now + index, updatedAt: now + index,
    }));
    state.tasks[0].folderId = "depth-4";
    state.tasks[0].title = "完成四级目录下超长中文任务名称在放大显示时的可读性检查并确保文字和操作不会互相遮挡";
    state.tasks[1].folderId = null;
    await globalThis.__workspaceBackendForTests.saveWorkspaceIndex(state);
  });
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  const folderIds = ["depth-1", "depth-2", "depth-3", "depth-4"];
  await expect.poll(() => page.evaluate((ids) => ids.map((id) => Boolean(document.querySelector(`[data-tree-folder-id="${id}"]`))), folderIds)).toEqual([true, true, true, true]);
  await expect(page.locator('[data-tree-folder-id="depth-4"] .task-item[data-folder-id="depth-4"]')).toBeVisible();
  const inspectLayers = () => page.evaluate(() => {
    const ids = ["depth-1", "depth-2", "depth-3", "depth-4"];
    const layers = ids.map((id) => {
      const node = document.querySelector(`[data-tree-folder-id="${id}"]`);
      if (!node) throw new Error(`folder-node-missing:${id}`);
      const parent = node.parentElement?.closest("[data-tree-folder-id]");
      const rect = node.getBoundingClientRect();
      const parentRect = parent?.getBoundingClientRect();
      return {
        id,
        className: node.className,
        background: getComputedStyle(node).backgroundColor,
        width: rect.width,
        leftInset: parentRect ? rect.left - parentRect.left : 0,
        rightInset: parentRect ? parentRect.right - rect.right : 0,
      };
    });
    const row = document.querySelector('[data-tree-folder-id="depth-4"] [data-folder-id="depth-4"]');
    if (!row) throw new Error("fourth-level-task-missing");
    return { layers, documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, rowOverflow: row.scrollWidth - row.clientWidth };
  });
  let geometry = await inspectLayers();
  expect(new Set(geometry.layers.map((layer) => layer.background)).size).toBe(4);
  geometry.layers.forEach((layer, index) => {
    expect(layer.className).toContain(`tree-depth-${index + 1}`);
    expect(layer.leftInset).toBeGreaterThanOrEqual(5);
    expect(layer.rightInset).toBeGreaterThanOrEqual(2);
    if (index) expect(layer.width).toBeLessThan(geometry.layers[index - 1].width);
  });
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.rowOverflow).toBeLessThanOrEqual(1);

  await page.locator("#themeSelect").evaluate((select) => { select.value = "dark"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.evaluate(() => { document.documentElement.style.zoom = "150%"; });
  await expect.poll(() => page.evaluate((ids) => ids.map((id) => Boolean(document.querySelector(`[data-tree-folder-id="${id}"]`))), folderIds)).toEqual([true, true, true, true]);
  await expect(page.locator('[data-tree-folder-id="depth-4"] .task-item[data-folder-id="depth-4"]')).toBeVisible();
  geometry = await inspectLayers();
  expect(new Set(geometry.layers.map((layer) => layer.background)).size).toBe(4);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.rowOverflow).toBeLessThanOrEqual(1);
});

test("manual dark theme uses distinct charcoal surfaces with readable contrast", async ({ page }) => {
  await page.locator("#themeSelect").selectOption("dark");
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const parse = (value) => {
      const input = value.trim();
      if (input.startsWith("#")) {
        const hex = input.slice(1);
        return (hex.length === 3 ? hex.split("").map((part) => part + part) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]).map((part) => Number.parseInt(part, 16));
      }
      return input.match(/[\d.]+/g).slice(0, 3).map(Number);
    };
    const luminance = (rgb) => {
      const values = rgb.map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const contrast = (a, b) => { const [high, low] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
    const bg = root.getPropertyValue("--bg");
    const surface = root.getPropertyValue("--surface");
    const raised = root.getPropertyValue("--surface-raised");
    return {
      bg,
      surface,
      raised,
      sidebar: getComputedStyle(document.querySelector("#sidebar")).backgroundColor,
      resolvedSurface: getComputedStyle(document.querySelector(".brand")).backgroundColor,
      textContrast: contrast(root.getPropertyValue("--text"), surface),
      mutedContrast: contrast(root.getPropertyValue("--muted"), surface),
    };
  });
  expect(new Set([colors.bg.trim(), colors.surface.trim(), colors.raised.trim()]).size).toBe(3);
  expect(colors.sidebar).toBe(colors.resolvedSurface);
  expect(colors.textContrast).toBeGreaterThanOrEqual(7);
  expect(colors.mutedContrast).toBeGreaterThanOrEqual(4.5);
});

test("long task title retains a readable task column at common desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const title = "完成常见笔记本窗口下超长任务标题的可读性检查并确认内容不会被固定功能列压缩成逐字堆叠";
  await createRootTask(page, title);
  const metrics = await page.getByRole("option", { name: new RegExp(title) }).locator("strong").evaluate((element) => {
    const style = getComputedStyle(element);
    return { lines: element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight), width: element.parentElement?.getBoundingClientRect().width ?? 0 };
  });
  expect(metrics.width).toBeGreaterThan(560);
  expect(metrics.lines).toBeLessThanOrEqual(3);
});

for (const viewport of [{ name: "桌面", width: 1440, height: 900 }, { name: "手机", width: 390, height: 844 }]) {
  test(`${viewport.name}视口无横向溢出且逾期主操作和图标按钮尺寸合格`, async ({ page }) => {
    await persistDefaultState(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(async () => {
      const state = (await globalThis.__workspaceBackendForTests.loadWorkspace()).state;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      state.tasks[0].dueDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      await globalThis.__workspaceBackendForTests.saveWorkspaceIndex(state);
    });
    await page.reload();
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      rows: Array.from(document.querySelectorAll(".task-item"), (row) => row.scrollWidth - row.clientWidth),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.rows.every((amount) => amount <= 1)).toBe(true);
    const overdue = page.getByRole("option", { name: new RegExp(primaryTask) });
    const labels = await overdue.locator(".task-actions button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    expect(labels.slice(0, 3)).toEqual(["标记为已完成", "标记为不再需要", "重新安排截止日期"]);
    const actionSizes = await overdue.locator(".task-actions .icon-button").evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    const minimum = viewport.width <= 560 ? 44 : 40;
    expect(actionSizes.every(({ width, height }) => width >= minimum && height >= minimum)).toBe(true);
    if (viewport.width === 390) {
      await page.getByRole("button", { name: "打开导航" }).click();
      await expect(page.locator("#sidebar")).toHaveClass(/is-open/);
      const sidebarOverflow = await page.locator("#sidebar").evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(sidebarOverflow).toBeLessThanOrEqual(1);
    }
    const iconSizes = await page.locator("button").evaluateAll((buttons) => buttons
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && button.querySelector("svg") && !button.textContent.trim();
      })
      .map((button) => ({ label: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    expect(iconSizes.length).toBeGreaterThan(0);
    expect(iconSizes.filter(({ width, height }) => width < minimum || height < minimum)).toEqual([]);
  });
}

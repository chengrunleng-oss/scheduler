import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const primaryTask = "确定今天最重要的一件事";
const workspace = fileURLToPath(new URL("..", import.meta.url));
let server;

test.beforeAll(async () => {
  server = await createServer({
    root: workspace,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 4173, strictPort: true },
  });
  await server.listen();
});

test.afterAll(async () => {
  await server.close();
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function createRootTask(page, title, options = {}) {
  await page.locator("#globalNewTask").click();
  const form = page.locator('form.inline-create[data-inline-kind="task"][data-folder-id="root"]');
  await form.locator('input[name="title"]').fill(title);
  if (options.priority) await form.locator('select[name="priority"]').selectOption(options.priority);
  if (options.dueDate !== undefined) await form.locator('input[name="dueDate"]').fill(options.dueDate);
  await form.locator('input[name="title"]').press("Enter");
  return page.getByRole("option", { name: new RegExp(title) });
}

async function createFolderTask(page, folderName, title, priority = "high") {
  const heading = page.locator(".tree-group-heading").filter({ hasText: folderName }).first();
  await heading.getByRole("button", { name: "在此处新建任务" }).click();
  const form = page.locator('form.inline-create[data-inline-kind="task"]');
  await form.locator('input[name="title"]').fill(title);
  await form.locator('select[name="priority"]').selectOption(priority);
  await form.locator('input[name="title"]').press("Enter");
  return page.getByRole("option", { name: new RegExp(title) });
}

async function persistDefaultState(page) {
  await page.locator("#themeSelect").selectOption("light");
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

test("v4 only exposes high/low priority and four exclusive views", async ({ page }) => {
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
  let pending = page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) });
  await expect(pending).toHaveClass(/pending/);
  await expect(pending.getByRole("button", { name: "撤销处理" })).toBeVisible();

  await page.reload();
  pending = page.getByRole("option", { name: new RegExp(`${primaryTask}，等待确认`) });
  await expect(pending).toBeVisible();
  await expect(pending).toContainText(/秒内可撤销/);
  await expect(page.getByRole("button", { name: /已处理/ })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /已处理 1/ })).toBeVisible({ timeout: 10_000 });
  const completed = page.getByRole("option", { name: new RegExp(`${primaryTask}，已完成`) });
  await expect(completed.getByRole("button", { name: "恢复为待办" })).toBeVisible();
  await completed.getByRole("button", { name: "恢复为待办" }).click();
  await expect(page.getByRole("option", { name: new RegExp(`${primaryTask}，待办`) })).toBeVisible();
});

test("handled tasks render after child folders and show the latest three by resolved time", async ({ page }) => {
  await persistDefaultState(page);
  await page.evaluate(() => {
    const key = "task-workbench-state-v4";
    const state = JSON.parse(localStorage.getItem(key));
    const now = Date.now();
    state.folders.push({ id: "folder-work-child", name: "工作子文件夹", parentId: "folder-work", order: 0, collapsed: false, createdAt: now, updatedAt: now });
    for (let index = 0; index < 4; index += 1) {
      state.tasks.push({
        ...state.tasks[0], id: `handled-${index}`, title: `已处理-${index}`, status: "completed", pendingResolution: null,
        resolvedAt: now - index * 1_000, createdAt: now - index * 1_000, updatedAt: now - index * 1_000, order: index + 10,
      });
    }
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();

  const childHeading = page.locator('[data-drop-folder-id="folder-work-child"]');
  const handledHeading = page.locator('button[data-action="toggle-handled"][data-container-id="folder-work"]');
  await expect(childHeading).toBeVisible();
  await expect(handledHeading).toBeVisible();
  expect((await childHeading.boundingBox()).y).toBeLessThan((await handledHeading.boundingBox()).y);
  await expect(page.getByRole("option", { name: /已处理-0/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /已处理-1/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /已处理-2/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /已处理-3/ })).toHaveCount(0);
  await handledHeading.click();
  await expect(page.getByRole("option", { name: /已处理-3/ })).toBeVisible();
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

test("dragging a task to a folder heading moves it atomically", async ({ page }) => {
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  const target = page.locator(".tree-group-heading").filter({ hasText: "个人" }).first();
  await row.getByRole("button", { name: "拖动任务" }).dragTo(target);
  await expect(row).toHaveAttribute("data-folder-id", "folder-personal");
  await expect(page.getByRole("button", { name: "撤销" })).toBeEnabled();
});

test("task drag supports exact reorder, undo, redo, root drop, and self-drop no-op", async ({ page }) => {
  await createFolderTask(page, "工作", "同组第二项", "high");
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
  expect(await titles()).toEqual([primaryTask, "同组第二项"]);
  await page.getByRole("button", { name: "重做" }).click();
  expect(await titles()).toEqual(["同组第二项", primaryTask]);

  await page.reload();
  await first.getByRole("button", { name: "拖动任务" }).dragTo(first);
  await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
  await first.getByRole("button", { name: "拖动任务" }).dragTo(page.locator('[data-drop-folder-id="root"]'));
  await expect(first).toHaveAttribute("data-folder-id", "root");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(first).toHaveAttribute("data-folder-id", "folder-work");
});

test("priority divider changes crossed priorities atomically and persists", async ({ page }) => {
  const low = await createFolderTask(page, "工作", "分界线低优先级", "low");
  await page.reload();
  const divider = page.locator('[data-divider-folder-id="folder-work"]');
  await divider.dragTo(low);
  await expect(low).toHaveAttribute("data-priority", "high");
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(low).toHaveAttribute("data-priority", "low");
  await page.getByRole("button", { name: "重做" }).click();
  await expect(low).toHaveAttribute("data-priority", "high");
  await page.reload();
  await expect(low).toHaveAttribute("data-priority", "high");
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
    await page.evaluate(() => {
      const key = "task-workbench-state-v4";
      const state = JSON.parse(localStorage.getItem(key));
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      state.tasks[0].dueDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      localStorage.setItem(key, JSON.stringify(state));
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

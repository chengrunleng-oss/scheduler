import { expect, test } from "@playwright/test";
import { startStaticServer } from "../scripts/serve.mjs";

const primaryTask = "确定今天最重要的一件事";
let server;

test.beforeAll(async () => {
  server = await startStaticServer({ port: 4173, log: false });
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("任务详情可保存并撤销", async ({ page }) => {
  const row = page.getByRole("option", { name: new RegExp(primaryTask) });
  await row.locator(".task-main").click();

  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#detailForm")).toBeVisible();
  await page.locator("#detailTitle").fill("端到端验证任务");
  await page.locator("#detailTag").fill("浏览器测试");
  await page.getByRole("button", { name: "保存更改" }).click();

  await expect(page.getByRole("option", { name: /端到端验证任务/ })).toContainText("#浏览器测试");
  await page.getByRole("button", { name: "关闭详情" }).click();
  await expect(page.getByRole("button", { name: "撤销" })).toBeEnabled();
  await page.getByRole("button", { name: "撤销" }).click();

  const restoredRow = page.getByRole("option", { name: new RegExp(primaryTask) });
  await expect(restoredRow).toContainText("#重点");
  await restoredRow.locator(".task-main").click();
  await expect(page.locator("#detailTitle")).toHaveValue(primaryTask);
});

test("任务可完成、筛选并恢复为待办", async ({ page }) => {
  await page
    .getByRole("option", { name: new RegExp(primaryTask) })
    .getByRole("button", { name: "移至已完成" })
    .click();

  await expect(page.locator("#metricCompleted")).toHaveText("1");
  await page.locator('[data-filter="completed"]').click();
  const completedRow = page.getByRole("option", { name: new RegExp(`${primaryTask}，已完成`) });
  await expect(completedRow).toBeVisible();
  await completedRow.getByRole("button", { name: "恢复为待办" }).click();

  await expect(completedRow).toHaveCount(0);
  await expect(page.locator("#emptyState")).toBeVisible();
});

test("空文件夹可创建并确认删除", async ({ page }) => {
  await page.getByRole("button", { name: "新建文件夹" }).click();
  const editor = page.locator("#folderDialog");
  await editor.getByLabel("名称").fill("端到端文件夹");
  await editor.getByRole("button", { name: "保存" }).click();

  const folderRow = page.locator("#folderTree .folder-row").filter({ hasText: "端到端文件夹" });
  await expect(folderRow).toHaveCount(1);
  await folderRow.getByRole("button", { name: "删除文件夹" }).click();
  await page.locator("#confirmDialog").getByRole("button", { name: "确认" }).click();

  await expect(folderRow).toHaveCount(0);
});

test("树状、优先级和截止日期视图按预期切换", async ({ page }) => {
  await page.locator('[data-view="priority"]').click();
  await expect(page.locator('[data-view="priority"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sortMode")).toHaveValue("due_date");
  await expect(page.locator(".group-heading").filter({ hasText: "高优先级" })).toBeVisible();

  await page.locator('[data-view="due_date"]').click();
  await expect(page.locator('[data-view="due_date"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sortMode")).toHaveValue("priority");
  await expect(page.locator(".group-heading").filter({ hasText: "今天" })).toBeVisible();
  await expect(page.locator(".group-heading").filter({ hasText: "未设置日期" })).toBeVisible();

  await page.locator('[data-view="tree"]').click();
  await expect(page.locator('[data-view="tree"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sortMode")).toHaveValue("manual");
  await expect(page.locator('#sortMode option:checked')).toHaveText("添加顺序");
  await expect(page.locator(".tree-group-heading").filter({ hasText: "工作" })).toBeVisible();
  await expect(page.locator(".tree-group-heading").filter({ hasText: "个人" })).toBeVisible();
});

test("1200 到 1500px 之间任务区不会随窗口变宽而倒退", async ({ page }) => {
  const widths = [1200, 1280, 1281, 1366, 1440, 1500];
  const rowWidths = [];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 768 });
    const measurement = await page.evaluate(() => ({
      rowWidth: document.querySelector(".task-item")?.getBoundingClientRect().width ?? 0,
      workspaceWidth: document.querySelector(".workspace")?.getBoundingClientRect().width ?? 0,
      gridColumns: getComputedStyle(document.querySelector(".app-shell")).gridTemplateColumns.split(" ").length,
    }));
    rowWidths.push(measurement.rowWidth);
    expect(measurement.workspaceWidth).toBeGreaterThanOrEqual(width - 271);
    expect(measurement.gridColumns).toBe(2);
  }

  for (let index = 1; index < rowWidths.length; index += 1) {
    expect(rowWidths[index]).toBeGreaterThanOrEqual(rowWidths[index - 1] - 1);
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  const longTitle = "完成常见笔记本窗口下超长任务标题的可读性检查并确认内容不会被固定功能列压缩成逐行堆叠";
  await page.locator("#taskTitle").fill(longTitle);
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const titleMetrics = await page.getByRole("option", { name: new RegExp(longTitle) }).locator("strong").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      lines: element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight),
      width: element.parentElement?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(titleMetrics.width).toBeGreaterThan(560);
  expect(titleMetrics.lines).toBeLessThanOrEqual(3);

  const fontSizes = await page.locator(".folder-count, .metric small, .eyebrow, .list-head, .task-main small, .priority, .timestamps dt").evaluateAll(
    (elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  );
  expect(fontSizes.length).toBeGreaterThan(0);
  expect(fontSizes.every((size) => size >= 12)).toBe(true);
});

test("常见横屏高度下详情操作区始终可见", async ({ page }) => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1920, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
    const actions = page.locator(".detail-actions");
    await expect(actions).toBeVisible();
    if (viewport.width <= 1600) {
      await expect
        .poll(() => page.locator("#taskDetail").evaluate((element) => element.getBoundingClientRect().right))
        .toBeLessThanOrEqual(viewport.width + 1);
    }
    const layout = await page.evaluate(() => {
      const actionRect = document.querySelector(".detail-actions")?.getBoundingClientRect();
      const detailFields = document.querySelector(".detail-fields");
      return {
        actionBottom: actionRect?.bottom ?? Number.POSITIVE_INFINITY,
        actionTop: actionRect?.top ?? Number.POSITIVE_INFINITY,
        documentOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        detailOverflowMode: detailFields ? getComputedStyle(detailFields).overflowY : "",
      };
    });
    expect(layout.actionTop).toBeGreaterThanOrEqual(0);
    expect(layout.actionBottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(layout.documentOverflow).toBeLessThanOrEqual(1);
    expect(layout.detailOverflowMode).toBe("auto");
    await page.getByRole("button", { name: "关闭详情" }).click();
    if (viewport.width <= 1600) {
      await expect
        .poll(() => page.locator("#taskDetail").evaluate((element) => element.getBoundingClientRect().left))
        .toBeGreaterThanOrEqual(viewport.width);
    }
  }
});

test("截止日期文案区分逾期、今天、未来和无日期", async ({ page }) => {
  const toLocalISO = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const today = new Date();
  const past = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const future = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  const drafts = [
    ["逾期文案任务", toLocalISO(past)],
    ["今日文案任务", toLocalISO(today)],
    ["未来文案任务", toLocalISO(future)],
    ["无日期文案任务", ""],
  ];

  for (const [title, dueDate] of drafts) {
    await page.locator("#taskTitle").fill(title);
    if (dueDate) await page.locator("#taskDueDate").fill(dueDate);
    await page.getByRole("button", { name: "新建任务", exact: true }).click();
  }

  await expect(page.getByRole("option", { name: /逾期文案任务/ }).locator("time")).toContainText("逾期 ·");
  await expect(page.getByRole("option", { name: /今日文案任务/ }).locator("time")).toHaveText("今天截止");
  await expect(page.getByRole("option", { name: /未来文案任务/ }).locator("time")).toContainText("截止");
  await expect(page.getByRole("option", { name: /无日期文案任务/ }).locator("time")).toHaveText("无截止日期");
  await expect(page.locator(".metric").filter({ has: page.locator("#metricDue") }).locator("small")).toHaveText("今日/逾期");

  await page.locator('[data-view="due_date"]').click();
  await expect(page.locator(".group-heading").filter({ hasText: "已逾期" })).toBeVisible();
  await expect(page.locator(".group-heading").filter({ hasText: "今天" })).toBeVisible();
  await expect(page.getByRole("option", { name: /逾期文案任务/ }).locator("time")).toContainText("逾期 ·");
});

test("重置为示例数据会明确说明影响范围", async ({ page }) => {
  const tasksBefore = await page.getByRole("option").count();
  await page.getByRole("button", { name: "重置为示例数据" }).click();

  const dialog = page.locator("#confirmDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#confirmTitle")).toHaveText("重置为示例数据");
  await expect(dialog.locator("#confirmText")).toHaveText("这会用示例任务和文件夹替换当前浏览器中的全部数据，继续吗？");
  await dialog.getByRole("button", { name: "取消" }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(tasksBefore);
});

for (const viewport of [
  { name: "桌面", width: 1440, height: 900 },
  { name: "手机", width: 390, height: 844 },
]) {
  test(`${viewport.name}视口没有横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.reload();

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      rows: Array.from(document.querySelectorAll(".task-item"), (row) => row.scrollWidth - row.clientWidth),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);
    expect(overflow.rows.every((amount) => amount <= 1)).toBe(true);

    if (viewport.width === 390) {
      const actionSizes = await page
        .getByRole("option", { name: new RegExp(primaryTask) })
        .locator(".task-actions .icon-button")
        .evaluateAll((buttons) => buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }));
      expect(actionSizes).toHaveLength(5);
      expect(actionSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

      await page.getByRole("button", { name: "打开导航" }).click();
      await expect(page.locator("#sidebar")).toHaveClass(/is-open/);
      await expect.poll(() => page.locator("#sidebar").evaluate((element) => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(-1);
      await page.getByRole("button", { name: "关闭导航" }).click();
      await expect.poll(() => page.locator("#sidebar").evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
    }
  });
}

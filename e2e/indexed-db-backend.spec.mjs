import { expect, test } from "@playwright/test";

test("browser business data is not loaded as the runtime workspace", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("task-workbench-state-v5", JSON.stringify({ schemaVersion: 5, preferences: { activeStatusFilter: "all", theme: "system", viewMode: "tree_manual", folderScope: "all", defaultTaskDueDate: "today", defaultTaskPriority: "low", expandedHandledContainers: [], navigationCollapsedFolders: [], workspaceWidth: 620 }, folders: [], tasks: [{ id: "legacy-task", title: "Legacy browser task", notes: "", descriptionMarkdown: "", priority: "low", dueDate: "", tag: "", status: "active", folderId: null, order: 0, resolvedAt: null, pendingResolution: null, rescheduleHistory: [], createdAt: 1, updatedAt: 1 }] }));
  });
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__workspaceBackendForTests));
  expect(await page.evaluate(() => globalThis.__workspaceBackendForTests.available)).toBe(false);
  await expect(page.getByText("Legacy browser task")).toHaveCount(0);
  const createControls = page.locator("#globalNewTask, #newFolder, .create-task-action, .create-folder-action");
  await expect(createControls).not.toHaveCount(0);
  for (const control of await createControls.all()) {
    await expect(control).toBeDisabled();
    await expect(control).toHaveAttribute("aria-disabled", "true");
    await expect(control).toHaveAttribute("title", "请先选择本地工作区目录");
  }
});

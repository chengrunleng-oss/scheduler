import { expect, test } from "@playwright/test";

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

// TEST-V09-007：文件夹可拖拽到另一文件夹行中部=嵌套为其子级（移动到其它文件夹下）。
test("folder drag onto another folder nests it as a child", async ({ page }) => {
  const personal = page.locator('.tree-group-heading[data-drop-folder-id="folder-personal"]');
  const work = page.locator('.tree-group-heading[data-drop-folder-id="folder-work"]');
  await expect(personal).toHaveCount(1);
  await personal.getByRole("button", { name: "拖动文件夹" }).dragTo(work);
  await page.waitForTimeout(150);
  const state = await page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state);
  expect(state.folders.find((f) => f.id === "folder-personal")?.parentId).toBe("folder-work");
});

// TEST-V09-006：过期任务拖到另一文件夹=移动（保留其逾期状态，落到该文件夹逾期区）。
test("overdue task drag to another folder moves it", async ({ page }) => {
  await page.evaluate(async () => {
    const state = (await globalThis.__workspaceBackendForTests.loadWorkspace()).state;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const d = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
    const t = state.tasks.find((x) => x.id === "task-1"); t.dueDate = d;
    await globalThis.__workspaceBackendForTests.saveWorkspaceIndex(state);
  });
  await page.reload();
  const task = page.getByRole("option", { name: /确定今天最重要的一件事/ });
  const personal = page.locator('.tree-group-heading[data-drop-folder-id="folder-personal"]');
  await task.getByRole("button", { name: "拖动任务" }).dragTo(personal, { targetPosition: { x: 200, y: 20 } });
  await page.waitForTimeout(150);
  const state2 = await page.evaluate(async () => (await globalThis.__workspaceBackendForTests.loadWorkspace()).state);
  expect(state2.tasks.find((x) => x.id === "task-1")?.folderId).toBe("folder-personal");
});

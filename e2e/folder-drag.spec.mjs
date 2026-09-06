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

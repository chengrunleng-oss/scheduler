import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = fileURLToPath(new URL("../output/playwright/", import.meta.url));
const host = "127.0.0.1";
const port = 4180;
const primaryTask = "确定今天最重要的一件事";

function createVisualFixture() {
  const now = Date.now();
  return {
    schemaVersion: 5,
    preferences: {
      activeStatusFilter: "all",
      theme: "system",
      viewMode: "tree_manual",
      folderScope: "all",
      defaultTaskDueDate: "today",
      defaultTaskPriority: "low",
      expandedHandledContainers: [],
      navigationCollapsedFolders: [],
      workspaceWidth: 620,
    },
    folders: [
      { id: "folder-work", name: "工作", parentId: null, order: 0, collapsed: false, createdAt: now - 2_000, updatedAt: now - 2_000 },
      { id: "folder-personal", name: "个人", parentId: null, order: 1, collapsed: false, createdAt: now - 1_000, updatedAt: now - 1_000 },
    ],
    tasks: [
      { id: "task-1", title: primaryTask, notes: "写下明确结果，并安排第一个可执行步骤。", descriptionMarkdown: "", priority: "high", dueDate: new Date(now).toISOString().slice(0, 10), tag: "重点", status: "active", folderId: "folder-work", order: 0, resolvedAt: null, pendingResolution: null, rescheduleHistory: [], createdAt: now - 7_200_000, updatedAt: now - 7_200_000 },
      { id: "task-2", title: "安排一段不被打扰的专注时间", notes: "", descriptionMarkdown: "", priority: "low", dueDate: "", tag: "日常", status: "active", folderId: "folder-personal", order: 0, resolvedAt: null, pendingResolution: null, rescheduleHistory: [], createdAt: now - 3_600_000, updatedAt: now - 3_600_000 },
    ],
  };
}

await mkdir(output, { recursive: true });
const server = await preview({ root, logLevel: "silent", preview: { host, port, strictPort: true } });
const browser = await chromium.launch();

async function capture(name, viewport, { openWorkspace = false, openImportCenter = false, theme = "light", seedWorkspace = true } = {}) {
  const page = await browser.newPage({ viewport });
  const directoryName = `visual-${name}`;
  await page.addInitScript((workspaceName) => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry(workspaceName, { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      return root.getDirectoryHandle(workspaceName, { create: true });
    };
  }, directoryName);
  await page.goto(`http://${host}:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (seedWorkspace) {
    await page.evaluate((fixture) => localStorage.setItem("task-workbench-state-v5", JSON.stringify(fixture)), createVisualFixture());
    await page.locator("#chooseWorkspaceDirectory").evaluate((button) => button.click());
    await page.locator("#workspaceSetupImport").click();
    await page.waitForFunction(() => document.documentElement.dataset.appReady === "true" && document.querySelector("#workspaceStorageStatus")?.textContent?.includes("本地目录"));
  }
  await page.locator("#themeSelect").evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, theme);
  if (openWorkspace) {
    await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  }
  await page.locator(seedWorkspace && openWorkspace ? "#taskDetail.is-open" : seedWorkspace ? ".task-item" : "#emptyState:not([hidden])").first().waitFor();
  if (openImportCenter) {
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#exportData").click();
    const download = await downloadPromise;
    await page.locator("#importFile").setInputFiles(await download.path());
    await page.locator("#importCenterDialog").waitFor({ state: "visible" });
  }

  const geometry = await page.evaluate(() => {
    const importDialog = document.querySelector("#importCenterDialog");
    const importRect = importDialog?.open ? importDialog.getBoundingClientRect() : null;
    return ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
    rowOverflow: Math.max(0, ...Array.from(document.querySelectorAll(".task-item"), (row) => row.scrollWidth - row.clientWidth)),
    maxTaskHeight: Math.max(0, ...Array.from(document.querySelectorAll(".task-item"), (row) => row.getBoundingClientRect().height)),
    sidebarWidth: document.querySelector("#sidebar").getBoundingClientRect().width,
    workspaceOpen: document.querySelector("#appShell").classList.contains("workspace-open"),
    importDialogOverflow: importRect ? Math.max(0, -importRect.left, importRect.right - window.innerWidth) : 0,
    storageButtonSizes: Array.from(document.querySelectorAll(".workspace-storage-actions .button:not([hidden])"), (button) => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
    storageTextVisible: Array.from(document.querySelectorAll(".workspace-storage-status, .workspace-storage-actions .button span"), (node) => getComputedStyle(node).display !== "none"),
  });
  });
  if (geometry.documentOverflow > 1 || geometry.bodyOverflow > 1 || geometry.rowOverflow > 1) {
    throw new Error(`${name} has horizontal overflow: ${JSON.stringify(geometry)}`);
  }
  if (geometry.importDialogOverflow > 1) throw new Error(`${name} import dialog overflows horizontally: ${geometry.importDialogOverflow}px`);
  if (!openWorkspace && viewport.width >= 768 && geometry.maxTaskHeight > 72) {
    throw new Error(`${name} task row exceeds 72px: ${geometry.maxTaskHeight}px`);
  }
  if (openWorkspace && viewport.width >= 1340 && geometry.maxTaskHeight > 112) {
    throw new Error(`${name} workspace task row exceeds 112px: ${geometry.maxTaskHeight}px`);
  }
  if (viewport.width >= 881 && viewport.width <= 1180) {
    if (geometry.storageTextVisible.some(Boolean)) throw new Error(`${name} shows workspace storage text in the icon sidebar.`);
    if (geometry.storageButtonSizes.some(({ width, height }) => Math.abs(width - 40) > 1 || Math.abs(height - 40) > 1)) {
      throw new Error(`${name} workspace storage buttons are not 40x40: ${JSON.stringify(geometry.storageButtonSizes)}`);
    }
  }
  await page.screenshot({ path: `${output}${name}.png`, fullPage: true });
  await page.close();
  return { name, viewport, ...geometry };
}

try {
  const results = [];
  results.push(await capture("workspace-empty", { width: 1440, height: 900 }, { seedWorkspace: false }));
  results.push(await capture("workspace-overview", { width: 1440, height: 900 }, { openWorkspace: true, theme: "dark" }));
  results.push(await capture("workspace-standard", { width: 1024, height: 768 }));
  results.push(await capture("workspace-tablet", { width: 768, height: 1024 }));
  results.push(await capture("workspace-mobile", { width: 390, height: 844 }, { openWorkspace: true }));
  results.push(await capture("import-center", { width: 1440, height: 900 }, { openImportCenter: true }));
  results.push(await capture("import-center-mobile", { width: 390, height: 844 }, { openImportCenter: true }));
  console.table(results);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}

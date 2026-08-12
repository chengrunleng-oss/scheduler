import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = fileURLToPath(new URL("../output/playwright/", import.meta.url));
const host = "127.0.0.1";
const port = 4180;
const primaryTask = "确定今天最重要的一件事";

await mkdir(output, { recursive: true });
const server = await preview({ root, logLevel: "silent", preview: { host, port, strictPort: true } });
const browser = await chromium.launch();

async function capture(name, viewport, { openWorkspace = false, theme = "light" } = {}) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://${host}:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#themeSelect").evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, theme);
  if (openWorkspace) {
    await page.getByRole("option", { name: new RegExp(primaryTask) }).locator(".task-main").click();
  }
  await page.locator(openWorkspace ? "#taskDetail.is-open" : ".task-item").first().waitFor();

  const geometry = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
    rowOverflow: Math.max(0, ...Array.from(document.querySelectorAll(".task-item"), (row) => row.scrollWidth - row.clientWidth)),
    maxTaskHeight: Math.max(0, ...Array.from(document.querySelectorAll(".task-item"), (row) => row.getBoundingClientRect().height)),
    sidebarWidth: document.querySelector("#sidebar").getBoundingClientRect().width,
    workspaceOpen: document.querySelector("#appShell").classList.contains("workspace-open"),
  }));
  if (geometry.documentOverflow > 1 || geometry.bodyOverflow > 1 || geometry.rowOverflow > 1) {
    throw new Error(`${name} has horizontal overflow: ${JSON.stringify(geometry)}`);
  }
  if (!openWorkspace && viewport.width >= 768 && geometry.maxTaskHeight > 72) {
    throw new Error(`${name} task row exceeds 72px: ${geometry.maxTaskHeight}px`);
  }
  if (openWorkspace && viewport.width >= 1340 && geometry.maxTaskHeight > 112) {
    throw new Error(`${name} workspace task row exceeds 112px: ${geometry.maxTaskHeight}px`);
  }
  await page.screenshot({ path: `${output}${name}.png`, fullPage: true });
  await page.close();
  return { name, viewport, ...geometry };
}

try {
  const results = [];
  results.push(await capture("workspace-overview", { width: 1440, height: 900 }, { openWorkspace: true, theme: "dark" }));
  results.push(await capture("workspace-standard", { width: 1024, height: 768 }));
  results.push(await capture("workspace-tablet", { width: 768, height: 1024 }));
  results.push(await capture("workspace-mobile", { width: 390, height: 844 }, { openWorkspace: true }));
  console.table(results);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}

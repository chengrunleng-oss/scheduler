import { defineConfig } from "@playwright/test";

// e2e 使用专用端口 5180 且禁止复用现有服务器，避免本地开发服务器（5173）被误当作测试目标。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  outputDir: "test-results",
  webServer: {
    command: "node ./node_modules/vite/bin/vite.js --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});

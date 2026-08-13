import { registerWorkspaceBackendContract } from "./workspace-backend.contract.mjs";

registerWorkspaceBackendContract("IndexedDbBackend", async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__workspaceBackendForTests));
  await page.evaluate(() => {
    globalThis.__workspaceBackendContractTarget = globalThis.__workspaceBackendForTests;
  });
});

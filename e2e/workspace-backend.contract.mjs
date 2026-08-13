import { expect, test } from "@playwright/test";

export function registerWorkspaceBackendContract(name, setupBackend, verifyBackend) {
  test(`${name} satisfies the workspace storage contract`, async ({ page }) => {
    await page.goto("/");
    await setupBackend(page);

    const result = await page.evaluate(async () => {
      const backend = globalThis.__workspaceBackendContractTarget;
      if (!backend) throw new Error("Workspace backend contract target was not initialized.");
      let stage = "loadWorkspace";
      try {

      const loaded = await backend.loadWorkspace();
      const originalTask = loaded.state.tasks[0];
      const contractTask = {
        ...originalTask,
        id: "contract-task",
        title: "契约测试任务",
        descriptionMarkdown: "",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      };

      stage = "saveTask";
      await backend.saveTask(contractTask);
      stage = "load after saveTask";
      const afterSave = await backend.loadWorkspace();
      stage = "saveDescription";
      await backend.saveDescription(contractTask.id, "# 契约描述\r\n正文");
      stage = "load after saveDescription";
      const afterDescription = await backend.loadWorkspace();
      const savedTask = afterDescription.state.tasks.find((task) => task.id === contractTask.id);

      stage = "deleteTask";
      await backend.deleteTask(contractTask.id);
      stage = "load after deleteTask";
      const afterDelete = await backend.loadWorkspace();
      stage = "restoreTask";
      await backend.restoreTask(contractTask);
      stage = "load after restoreTask";
      const afterRestore = await backend.loadWorkspace();

      stage = "saveWorkLog";
      const worklog = await backend.saveWorkLog({
        taskId: contractTask.id,
        workDate: "2026-08-12",
        contentMarkdown: "完成接口测试",
        progressPercent: 63.6,
      }, 1_700_000_001_000);
      stage = "listWorkLogs";
      const listedWorklogs = await backend.listWorkLogs(contractTask.id);
      stage = "deleteWorkLog";
      await backend.deleteWorkLog(worklog.id);
      stage = "listWorkLogs after delete";
      const logsAfterDelete = await backend.listWorkLogs(contractTask.id);
      stage = "restoreWorkLog";
      await backend.restoreWorkLog(worklog);

      const file = new File(["contract attachment"], "contract.txt", {
        type: "text/plain",
        lastModified: 1_700_000_002_000,
      });
      stage = "putAttachment";
      const attachment = await backend.putAttachment(contractTask.id, file, 1_700_000_003_000);
      stage = "readAttachment";
      const attachmentText = await (await backend.readAttachment(attachment.id))?.text();
      stage = "saveAttachment";
      await backend.saveAttachment(attachment.id, new Blob(["edited contract attachment"], { type: "text/plain" }));
      const editedAttachmentText = await (await backend.readAttachment(attachment.id))?.text();
      stage = "renameAttachment";
      await backend.renameAttachment(attachment.id, "renamed.txt");
      stage = "listAttachments";
      const renamed = (await backend.listAttachments(contractTask.id)).find((item) => item.id === attachment.id);

      stage = "exportSnapshot";
      const snapshot = await backend.exportSnapshot();
      stage = "mutate before importSnapshot";
      await backend.deleteWorkLog(worklog.id);
      await backend.deleteAttachment(attachment.id);
      await backend.deleteTask(contractTask.id);
      stage = "importSnapshot";
      await backend.importSnapshot(snapshot);

      stage = "read imported snapshot";
      const restored = await backend.loadWorkspace();
      const restoredLogs = await backend.listWorkLogs(contractTask.id);
      const restoredAttachments = await backend.listAttachments(contractTask.id);
      const restoredBlob = await backend.readAttachment(attachment.id);
      const importedAttachmentText = await restoredBlob?.text();
      backend.close();
      delete globalThis.__workspaceBackendContractTarget;

      return {
        available: backend.available,
        savedTask: afterSave.state.tasks.some((task) => task.id === contractTask.id),
        description: savedTask?.descriptionMarkdown,
        deletedTask: !afterDelete.state.tasks.some((task) => task.id === contractTask.id),
        restoredTask: afterRestore.state.tasks.some((task) => task.id === contractTask.id),
        progress: listedWorklogs[0]?.progressPercent,
        logsAfterDelete: logsAfterDelete.length,
        attachmentText,
        editedAttachmentText,
        renamedAttachment: renamed?.name,
        snapshotState: snapshot.state.schemaVersion,
        importedTask: restored.state.tasks.some((task) => task.id === contractTask.id),
        importedLogs: restoredLogs.length,
        importedAttachments: restoredAttachments.length,
        importedAttachmentText,
      };
      } catch (error) {
        throw new Error(`${stage}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
      }
    });

    expect(result).toEqual({
      available: true,
      savedTask: true,
      description: "# 契约描述\n正文",
      deletedTask: true,
      restoredTask: true,
      progress: 64,
      logsAfterDelete: 0,
      attachmentText: "contract attachment",
      editedAttachmentText: "edited contract attachment",
      renamedAttachment: "renamed.txt",
      snapshotState: 5,
      importedTask: true,
      importedLogs: 1,
      importedAttachments: 1,
      importedAttachmentText: "edited contract attachment",
    });
    if (verifyBackend) await verifyBackend(page);
  });
}

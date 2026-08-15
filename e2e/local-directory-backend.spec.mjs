import { expect, test } from "@playwright/test";
import { registerWorkspaceBackendContract } from "./workspace-backend.contract.mjs";

const contractDirectory = "workspace-backend-contract";

registerWorkspaceBackendContract("LocalDirectoryBackend", async (page) => {
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  await page.evaluate(async (directoryName) => {
    const storageRoot = await navigator.storage.getDirectory();
    try { await storageRoot.removeEntry(directoryName, { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await storageRoot.getDirectoryHandle(directoryName, { create: true });
    const LocalDirectoryBackend = globalThis.__localDirectoryBackendForTests;
    const backend = new LocalDirectoryBackend(directory);
    await backend.importSnapshot({ state: globalThis.__createDefaultStateForTests(), workLogs: [], attachments: [], attachmentBlobs: new Map() });
    globalThis.__workspaceBackendContractTarget = backend;
  }, contractDirectory);
}, async (page) => {
  const layout = await page.evaluate(async (directoryName) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(directoryName);
    const names = [];
    for await (const [name, handle] of workspace.entries()) names.push(`${handle.kind}:${name}`);
    const tasks = await workspace.getDirectoryHandle("tasks");
    const task = await tasks.getDirectoryHandle(encodeURIComponent("contract-task"));
    const taskNames = [];
    for await (const [name, handle] of task.entries()) taskNames.push(`${handle.kind}:${name}`);
    const worklogs = await task.getDirectoryHandle("worklogs");
    const worklogNames = [];
    for await (const [name] of worklogs.entries()) worklogNames.push(name);
    const attachments = await task.getDirectoryHandle("attachments");
    const attachmentNames = [];
    for await (const [name] of attachments.entries()) attachmentNames.push(name);
    const index = JSON.parse(await (await (await workspace.getFileHandle("workspace.json")).getFile()).text());
    return { names, taskNames, worklogNames, attachmentNames, format: index.format };
  }, contractDirectory);

  expect(layout.names).toEqual(expect.arrayContaining(["file:workspace.json", "directory:tasks", "directory:trash"]));
  expect(layout.taskNames).toEqual(expect.arrayContaining(["file:task.json", "file:description.md", "directory:worklogs", "directory:attachments"]));
  expect(layout.worklogNames).toContain("2026-08-12.md");
  expect(layout.attachmentNames.some((name) => name.includes("renamed.txt"))).toBe(true);
  expect(layout.format).toBe("task-workbench-workspace");
});

test("migration uses Windows-safe temporary names and leaves no temporary files", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("windows-name-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const rawDirectory = await root.getDirectoryHandle("windows-name-workspace", { create: true });
    const guard = (directory) => new Proxy(directory, {
      get(target, property) {
        if (property === "getFileHandle") return async (name, options) => {
          if (name.startsWith(".") && name.includes(".tmp-")) throw new DOMException("Name is not allowed", "NotAllowedError");
          return target.getFileHandle(name, options);
        };
        if (property === "removeEntry") return async (name, options) => {
          if (name.startsWith(".") && name.includes(".tmp-")) throw new DOMException("Name is not allowed", "NotAllowedError");
          return target.removeEntry(name, options);
        };
        if (property === "getDirectoryHandle") return async (name, options) => guard(await target.getDirectoryHandle(name, options));
        if (property === "entries") return async function* () {
          for await (const [name, handle] of target.entries()) yield [name, handle.kind === "directory" ? guard(handle) : handle];
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const backend = new globalThis.__localDirectoryBackendForTests(guard(rawDirectory));
    const snapshot = { state: globalThis.__createDefaultStateForTests(), workLogs: [], attachments: [], attachmentBlobs: new Map() };
    await backend.importSnapshot(snapshot);
    const names = [];
    const collect = async (directory, prefix = "") => {
      for await (const [name, handle] of directory.entries()) {
        names.push(`${prefix}${name}`);
        if (handle.kind === "directory") await collect(handle, `${prefix}${name}/`);
      }
    };
    await collect(rawDirectory);
    return { hasIndex: names.includes("workspace.json"), hasTasks: names.includes("tasks"), hasTrash: names.includes("trash"), temporary: names.filter((name) => /(^|\/)tmp-/.test(name)) };
  });

  expect(result).toEqual({ hasIndex: true, hasTasks: true, hasTrash: true, temporary: [] });
});

test("same-day worklog conflicts persist as two independent local files", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("worklog-conflict-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await root.getDirectoryHandle("worklog-conflict-workspace", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const state = globalThis.__createDefaultStateForTests();
    const base = { taskId: "task-1", workDate: "2026-08-14", progressPercent: 40, createdAt: 100, updatedAt: 200 };
    await backend.importSnapshot({
      state,
      workLogs: [
        { ...base, id: "task-1::2026-08-14", contentMarkdown: "current" },
        { ...base, id: "worklog-imported-test", contentMarkdown: "incoming", conflictOrigin: "imported", updatedAt: 201 },
      ],
      attachments: [],
      attachmentBlobs: new Map(),
    });
    const records = await backend.listWorkLogs("task-1");
    const tasks = await directory.getDirectoryHandle("tasks");
    const task = await tasks.getDirectoryHandle(encodeURIComponent("task-1"));
    const worklogs = await task.getDirectoryHandle("worklogs");
    const files = [];
    for await (const [name] of worklogs.entries()) files.push(name);
    backend.close();
    return { records: records.map(({ id, contentMarkdown, conflictOrigin }) => ({ id, contentMarkdown, conflictOrigin: conflictOrigin ?? null })), files: files.sort() };
  });

  expect(result.records).toEqual(expect.arrayContaining([
    { id: "task-1::2026-08-14", contentMarkdown: "current", conflictOrigin: null },
    { id: "worklog-imported-test", contentMarkdown: "incoming", conflictOrigin: "imported" },
  ]));
  expect(result.files).toHaveLength(2);
  expect(result.files).toContain("2026-08-14.md");
  expect(result.files.some((name) => /^2026-08-14\.conflict-[a-f0-9]{8}\.md$/.test(name))).toBe(true);
});

test("latest import recovery survives reopening the local directory backend", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("import-recovery-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await root.getDirectoryHandle("import-recovery-workspace", { create: true });
    const first = new globalThis.__localDirectoryBackendForTests(directory);
    await first.saveImportRecovery({
      createdAt: "2026-08-14T08:00:00.000Z",
      backup: new Blob(["durable-backup"], { type: "application/zip" }),
      report: { mode: "merge", applied: 2, affectedTaskIds: ["task-1"] },
    });
    first.close();
    const reopened = new globalThis.__localDirectoryBackendForTests(directory);
    const recovery = await reopened.loadImportRecovery();
    reopened.close();
    return recovery ? { createdAt: recovery.createdAt, backup: await recovery.backup.text(), report: recovery.report } : null;
  });
  expect(result).toEqual({
    createdAt: "2026-08-14T08:00:00.000Z",
    backup: "durable-backup",
    report: { mode: "merge", applied: 2, affectedTaskIds: ["task-1"] },
  });
});

test("directory picker creates an empty local workspace without browser fallback", async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry("picker-workspace", { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      return root.getDirectoryHandle("picker-workspace", { create: true });
    };
  });
  await page.goto("/");
  await expect(page.locator(".task-item")).toHaveCount(0);
  await page.locator("#chooseWorkspaceDirectory").click();
  await expect(page.locator("#workspaceSetupDialog")).toBeVisible();
  await page.locator("#workspaceSetupEmpty").click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#workspaceStorageStatus")).toHaveText("本地目录：picker-workspace");
  await expect(page.locator(".task-item")).toHaveCount(0);
  const createControls = page.locator("#globalNewTask, #newFolder, .create-task-action, .create-folder-action");
  await expect(createControls).not.toHaveCount(0);
  for (const control of await createControls.all()) {
    await expect(control).toBeEnabled();
    await expect(control).toHaveAttribute("aria-disabled", "false");
    await expect(control).not.toHaveAttribute("title", "请先选择本地工作区目录");
  }

  const workspaceFormat = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle("picker-workspace");
    return JSON.parse(await (await (await workspace.getFileHandle("workspace.json")).getFile()).text()).format;
  });
  expect(workspaceFormat).toBe("task-workbench-workspace");

  await expect(page.locator("#useBrowserStorage")).toHaveCount(0);
});

test("local workspace writes keep browser storage free of business data", async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry("storage-purity-workspace", { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      return root.getDirectoryHandle("storage-purity-workspace", { create: true });
    };
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.locator("#chooseWorkspaceDirectory").click();
  await page.locator("#workspaceSetupEmpty").click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#workspaceStorageStatus")).toHaveText("本地目录：storage-purity-workspace");

  await page.locator("#globalNewTask").click();
  const form = page.locator('form.inline-create[data-inline-kind="task"][data-folder-id="root"]');
  await form.locator('input[name="title"]').fill("本地目录纯度验证");
  await form.locator('input[name="title"]').press("Enter");
  await expect(page.getByRole("option", { name: /本地目录纯度验证/ })).toBeVisible();
  await page.getByRole("option", { name: /本地目录纯度验证/ }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });
  await page.locator("#newWorklog").click();
  await page.locator("#worklogEditor [contenteditable='true'], #worklogEditor textarea").first().fill("本地目录工作记录");
  await expect(page.locator("#worklogSaveStatus")).toHaveText("已保存", { timeout: 5_000 });
  await page.locator("#attachmentsTab").click();
  await page.locator("#attachmentFile").setInputFiles({ name: "purity.txt", mimeType: "text/plain", buffer: Buffer.from("本地目录附件") });
  await expect(page.locator(".attachment-row")).toHaveCount(1, { timeout: 20_000 });

  const storage = await page.evaluate(async () => ({
    localStorageKeys: Object.keys(localStorage),
    databases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((database) => database.name).filter(Boolean).sort() : [],
  }));
  expect(storage.localStorageKeys).toEqual(["task-workbench-preferences-v1"]);
  expect(storage.databases).toEqual(["task-workbench-workspace-handles-v1"]);
});

test("renaming a task keeps its physical directory and local content", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("rename-directory-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await root.getDirectoryHandle("rename-directory-workspace", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const state = globalThis.__createDefaultStateForTests();
    const task = { ...state.tasks[0], id: "rename-stable-task", title: "重命名前标题", descriptionMarkdown: "重命名后描述仍在" };
    await backend.saveWorkspaceIndex({ ...state, tasks: [task] });
    await backend.saveWorkLog({ taskId: task.id, workDate: "2026-08-13", contentMarkdown: "重命名后记录仍在", progressPercent: 42 });
    const attachment = await backend.putAttachment(task.id, new File(["重命名后附件仍在"], "rename-proof.txt", { type: "text/plain" }));
    const tasksDirectory = await directory.getDirectoryHandle("tasks");
    const before = [];
    for await (const [name] of tasksDirectory.entries()) before.push(name);
    await backend.saveTask({ ...task, title: "重命名后标题", updatedAt: Date.now() });
    const after = [];
    for await (const [name] of tasksDirectory.entries()) after.push(name);
    const loaded = await backend.loadWorkspace();
    const reloadedTask = loaded.state.tasks.find((item) => item.id === task.id);
    const worklog = (await backend.listWorkLogs(task.id))[0];
    const attachmentText = await (await backend.readAttachment(attachment.id))?.text();
    backend.close();
    return { before, after, title: reloadedTask?.title, description: reloadedTask?.descriptionMarkdown, worklog: worklog?.contentMarkdown, attachmentText };
  });
  expect(result.before).toEqual([encodeURIComponent("rename-stable-task")]);
  expect(result.after).toEqual(result.before);
  expect(result.title).toBe("重命名后标题");
  expect(result.description).toBe("重命名后描述仍在");
  expect(result.worklog).toBe("重命名后记录仍在");
  expect(result.attachmentText).toBe("重命名后附件仍在");
});

test("missing workspace index with remaining content is protected from reads and writes", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("missing-index-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await root.getDirectoryHandle("missing-index-workspace", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const empty = await backend.loadWorkspace();
    await directory.getDirectoryHandle("tasks", { create: true });
    const messages = [];
    for (const operation of [
      () => backend.loadWorkspace(),
      () => backend.saveWorkspaceIndex(empty.state),
    ]) {
      try { await operation(); messages.push(""); }
      catch (error) { messages.push(error instanceof Error ? error.message : String(error)); }
    }
    const names = [];
    for await (const [name] of directory.entries()) names.push(name);
    let indexCreated = true;
    try { await directory.getFileHandle("workspace.json"); } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") indexCreated = false;
      else throw error;
    }
    return { emptyRecovered: empty.recovered, messages, names, indexCreated };
  });

  expect(result.emptyRecovered).toBe(false);
  expect(result.messages).toEqual([
    expect.stringContaining("缺少 workspace.json"),
    expect.stringContaining("缺少 workspace.json"),
  ]);
  expect(result.names).toEqual(["tasks"]);
  expect(result.indexCreated).toBe(false);
});

test("removed saved directory falls back safely and can be replaced", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("__workspace_picker_target", localStorage.getItem("__workspace_picker_target") || "stale-workspace");
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const name = localStorage.getItem("__workspace_picker_target");
      if (!name) throw new Error("Missing picker target");
      return root.getDirectoryHandle(name, { create: true });
    };
  });
  await page.goto("/");
  await page.locator("#chooseWorkspaceDirectory").click();
  await page.locator("#workspaceSetupEmpty").click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#workspaceStorageStatus")).toHaveText("本地目录：stale-workspace");

  await page.evaluate(async () => {
    localStorage.setItem("__workspace_picker_target", "replacement-workspace");
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("stale-workspace", { recursive: true });
    try { await root.removeEntry("replacement-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("#workspaceStorageStatus")).toHaveText("原工作区不可用：stale-workspace");
  await expect(page.locator("#chooseWorkspaceDirectory")).toHaveAccessibleName("改选本地目录");
  await expect(page.locator("#reauthorizeWorkspaceDirectory")).toBeHidden();
  await expect(page.locator(".task-item")).toHaveCount(0);
  await expect(page.locator("#globalNewTask")).toBeDisabled();

  await page.locator("#chooseWorkspaceDirectory").click();
  await expect(page.locator("#workspaceSetupDialog")).toBeVisible();
  await page.locator("#workspaceSetupEmpty").click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#workspaceStorageStatus")).toHaveText("本地目录：replacement-workspace");
  await expect(page.locator(".task-item")).toHaveCount(0);
});

test("LocalDirectoryBackend rejects a stale workspace revision", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const message = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("revision-workspace", { create: true });
    const LocalDirectoryBackend = globalThis.__localDirectoryBackendForTests;
    const backend = new LocalDirectoryBackend(directory);
    const initial = await backend.loadWorkspace();
    await backend.saveWorkspaceIndex(initial.state);
    await backend.loadWorkspace();
    const indexHandle = await directory.getFileHandle("workspace.json");
    const index = JSON.parse(await (await indexHandle.getFile()).text());
    index.revision += 1;
    const writable = await indexHandle.createWritable();
    await writable.write(JSON.stringify(index));
    await writable.close();
    try {
      await backend.saveWorkspaceIndex(initial.state);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(message).toContain("已被其它页面或程序修改");
});

test("state undo restores a trashed task with its complete local content", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const restored = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("undo-workspace", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const state = globalThis.__createDefaultStateForTests();
    const task = { ...state.tasks[0], id: "undo-task", title: "完整撤销任务", descriptionMarkdown: "保留描述" };
    const withTask = { ...state, tasks: [task] };
    await backend.saveWorkspaceIndex(withTask);
    await backend.saveWorkLog({ taskId: task.id, workDate: "2026-08-13", contentMarkdown: "保留记录", progressPercent: 50 });
    const attachment = await backend.putAttachment(task.id, new File(["keep attachment"], "keep.txt", { type: "text/plain" }));
    await backend.saveWorkspaceIndex({ ...withTask, tasks: [] });
    await backend.saveWorkspaceIndex(withTask);
    const tasks = await directory.getDirectoryHandle("tasks");
    const trash = await directory.getDirectoryHandle("trash");
    let inTrash = true;
    try { await trash.getDirectoryHandle(encodeURIComponent(task.id)); } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") inTrash = false;
      else throw error;
    }
    return {
      description: (await backend.loadWorkspace()).state.tasks.find((item) => item.id === task.id)?.descriptionMarkdown,
      worklog: (await backend.listWorkLogs(task.id))[0]?.contentMarkdown,
      attachment: await (await backend.readAttachment(attachment.id))?.text(),
      taskDirectoryRestored: Boolean(await tasks.getDirectoryHandle(encodeURIComponent(task.id))),
      inTrash,
    };
  });
  expect(restored).toEqual({
    description: "保留描述",
    worklog: "保留记录",
    attachment: "keep attachment",
    taskDirectoryRestored: true,
    inTrash: false,
  });
});

test("external description, worklog, and attachment changes are rejected", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const conflicts = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("content-conflicts", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const state = globalThis.__createDefaultStateForTests();
    const task = { ...state.tasks[0], id: "conflict-task", title: "冲突测试", descriptionMarkdown: "browser description" };
    await backend.saveWorkspaceIndex({ ...state, tasks: [task] });
    await backend.saveWorkLog({ taskId: task.id, workDate: "2026-08-13", contentMarkdown: "browser log", progressPercent: 10 });
    const attachment = await backend.putAttachment(task.id, new File(["browser attachment"], "notes.txt", { type: "text/plain" }));
    await backend.loadWorkspace();
    await backend.getWorkLog(task.id, "2026-08-13");
    await backend.readAttachment(attachment.id);

    const taskDirectory = await (await directory.getDirectoryHandle("tasks")).getDirectoryHandle(encodeURIComponent(task.id));
    const write = async (parent, name, content) => {
      const writable = await (await parent.getFileHandle(name)).createWritable();
      await writable.write(content);
      await writable.close();
    };
    await write(taskDirectory, "description.md", "external description");
    const worklogs = await taskDirectory.getDirectoryHandle("worklogs");
    await write(worklogs, "2026-08-13.md", "external log");
    const attachments = await taskDirectory.getDirectoryHandle("attachments");
    const names = [];
    for await (const [name] of attachments.entries()) names.push(name);
    await write(attachments, names[0], "external attachment");

    const messages = [];
    for (const operation of [
      () => backend.saveDescription(task.id, "next description"),
      () => backend.saveWorkLog({ taskId: task.id, workDate: "2026-08-13", contentMarkdown: "next log", progressPercent: 20 }),
      () => backend.saveAttachment(attachment.id, new Blob(["next attachment"], { type: "text/plain" })),
    ]) {
      try { await operation(); messages.push(""); }
      catch (error) { messages.push(`${error.name}:${error.message}`); }
    }
    const copy = await backend.saveConflictCopy({ kind: "description", taskId: task.id }, new Blob(["browser copy"]));
    return { messages, copy, externalDescription: await (await (await taskDirectory.getFileHandle("description.md")).getFile()).text() };
  });
  expect(conflicts.messages).toEqual([
    expect.stringContaining("WorkspaceConflictError"),
    expect.stringContaining("WorkspaceConflictError"),
    expect.stringContaining("WorkspaceConflictError"),
  ]);
  expect(conflicts.copy).toMatch(/^description\.conflict-/);
  expect(conflicts.externalDescription).toBe("external description");
});

test("invalid first migration leaves no loadable partial workspace", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const timed = (label, operation) => Promise.race([
      operation,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), 5_000)),
    ]);
    const root = await timed("storage-root", navigator.storage.getDirectory());
    try { await timed("remove-old-directory", root.removeEntry("failed-first-migration", { recursive: true })); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await timed("create-directory", root.getDirectoryHandle("failed-first-migration", { create: true }));
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const snapshot = { state: globalThis.__createDefaultStateForTests(), workLogs: [], attachments: [], attachmentBlobs: new Map() };
    const taskId = snapshot.state.tasks[0].id;
    const attachmentId = "migration-failure-attachment";
    snapshot.attachments.push({ id: attachmentId, taskId, name: "failure.bin", type: "application/octet-stream", size: 1, lastModified: 1, kind: "binary", createdAt: 1 });
    snapshot.attachmentBlobs.set(attachmentId, { size: 1, type: "application/octet-stream", arrayBuffer: async () => { throw new Error("injected attachment read failure"); } });
    let message = "";
    try { await timed("import-invalid-snapshot", backend.importSnapshot(snapshot)); } catch (error) { message = error.message; }
    const names = [];
    for await (const [name] of directory.entries()) names.push(name);
    return { message, names, loaded: await timed("load-after-failure", backend.loadWorkspace()) };
  });
  expect(result.message).toContain("恢复附件 migration-failure-attachment失败");
  expect(result.names).not.toContain("workspace.json");
  expect(result.names).not.toContain(".task-workbench-migration.json");
  expect(result.loaded.recovered).toBe(false);
});

test("invalid replacement migration preserves the existing workspace", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("rollback-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await root.getDirectoryHandle("rollback-workspace", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
    const state = globalThis.__createDefaultStateForTests();
    const original = { ...state.tasks[0], id: "original-task", title: "迁移前任务", descriptionMarkdown: "迁移前描述" };
    await backend.saveWorkspaceIndex({ ...state, tasks: [original] });
    await backend.saveWorkLog({ taskId: original.id, workDate: "2026-08-13", contentMarkdown: "迁移前记录", progressPercent: 30 });
    const previous = await backend.exportSnapshot();
    const attachmentId = "rollback-failure-attachment";
    const invalid = { ...previous, attachments: [...previous.attachments, { id: attachmentId, taskId: original.id, name: "failure.bin", type: "application/octet-stream", size: 1, lastModified: 1, kind: "binary", createdAt: 1 }], attachmentBlobs: new Map(previous.attachmentBlobs) };
    invalid.attachmentBlobs.set(attachmentId, { size: 1, type: "application/octet-stream", arrayBuffer: async () => { throw new Error("injected attachment read failure"); } });
    let message = "";
    try { await backend.importSnapshot(invalid); } catch (error) { message = error.message; }
    const loaded = await backend.loadWorkspace();
    return {
      message,
      title: loaded.state.tasks[0]?.title,
      description: loaded.state.tasks[0]?.descriptionMarkdown,
      worklog: (await backend.listWorkLogs(original.id))[0]?.contentMarkdown,
    };
  });
  expect(result.message).toContain("恢复附件 rollback-failure-attachment失败");
  expect(result).toMatchObject({ title: "迁移前任务", description: "迁移前描述", worklog: "迁移前记录" });
});

test("permission and write failures preserve the last durable content", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const result = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry("failure-workspace", { recursive: true }); } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    }
    const directory = await root.getDirectoryHandle("failure-workspace", { create: true });
    const backend = new globalThis.__localDirectoryBackendForTests(directory);
       const state = globalThis.__createDefaultStateForTests();
    const task = { ...state.tasks[0], id: "failure-task", title: "故障任务", descriptionMarkdown: "durable" };
    await backend.saveWorkspaceIndex({ ...state, tasks: [task] });
    await backend.loadWorkspace();

    const denied = new Proxy(directory, {
      get(target, property) {
        if (property === "queryPermission") return async () => "denied";
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    let permissionMessage = "";
    try { await new globalThis.__localDirectoryBackendForTests(denied).loadWorkspace(); } catch (error) { permissionMessage = error.message; }

    const tasks = await directory.getDirectoryHandle("tasks");
    const taskDirectory = await tasks.getDirectoryHandle(encodeURIComponent(task.id));
    const originalGetFileHandle = taskDirectory.getFileHandle.bind(taskDirectory);
    const failingTaskDirectory = new Proxy(taskDirectory, {
      get(target, property) {
        if (property === "getFileHandle") return async (name, options) => {
          const handle = await originalGetFileHandle(name, options);
          if (name === "description.md") return new Proxy(handle, {
            get(fileTarget, fileProperty) {
              if (fileProperty === "createWritable") return async () => { throw new DOMException("disk full", "QuotaExceededError"); };
              const value = Reflect.get(fileTarget, fileProperty, fileTarget);
              return typeof value === "function" ? value.bind(fileTarget) : value;
            },
          });
          return handle;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const originalTasksGetDirectory = tasks.getDirectoryHandle.bind(tasks);
    const failingTasks = new Proxy(tasks, {
      get(target, property) {
        if (property === "getDirectoryHandle") return async (name, options) => name === encodeURIComponent(task.id) ? failingTaskDirectory : originalTasksGetDirectory(name, options);
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const failingRoot = new Proxy(directory, {
      get(target, property) {
        if (property === "getDirectoryHandle") return async (name, options) => name === "tasks" ? failingTasks : target.getDirectoryHandle(name, options);
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const failingBackend = new globalThis.__localDirectoryBackendForTests(failingRoot);
    await failingBackend.loadWorkspace();
    let writeError = "";
    try { await failingBackend.saveDescription(task.id, "lost change"); } catch (error) { writeError = `${error.name}:${error.message}`; }
    const durable = await (await (await taskDirectory.getFileHandle("description.md")).getFile()).text();
    return { permissionMessage, writeError, durable };
  });
  expect(result.permissionMessage).toContain("需要重新授权");
  expect(result.writeError).toContain("QuotaExceededError");
  expect(result.durable).toBe("durable");
});

test("createWritable, write, and close failures roll back the original file", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(globalThis.__localDirectoryBackendForTests));
  const results = await page.evaluate(async () => {
    const storageRoot = await navigator.storage.getDirectory();
    const output = [];
    for (const failureStage of ["createWritable", "write", "close"]) {
      const directoryName = `stream-failure-${failureStage}`;
      try { await storageRoot.removeEntry(directoryName, { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      const directory = await storageRoot.getDirectoryHandle(directoryName, { create: true });
      const backend = new globalThis.__localDirectoryBackendForTests(directory);
      const state = globalThis.__createDefaultStateForTests();
      const task = { ...state.tasks[0], id: `task-${failureStage}`, title: failureStage, descriptionMarkdown: "durable" };
      await backend.saveWorkspaceIndex({ ...state, tasks: [task] });
      const tasks = await directory.getDirectoryHandle("tasks");
      const taskDirectory = await tasks.getDirectoryHandle(encodeURIComponent(task.id));
      const originalGetFileHandle = taskDirectory.getFileHandle.bind(taskDirectory);
      let injected = false;
      const failingTaskDirectory = new Proxy(taskDirectory, {
        get(target, property) {
          if (property === "getFileHandle") return async (name, options) => {
            const handle = await originalGetFileHandle(name, options);
            if (name !== "description.md") return handle;
            return new Proxy(handle, {
              get(fileTarget, fileProperty) {
                if (fileProperty === "createWritable") return async (writeOptions) => {
                  if (injected) return fileTarget.createWritable(writeOptions);
                  injected = true;
                  if (failureStage === "createWritable") throw new DOMException("create failed", "NotFoundError");
                  const writable = await fileTarget.createWritable(writeOptions);
                  return {
                    async write(data) {
                      if (failureStage === "write") throw new DOMException("write failed", "QuotaExceededError");
                      return writable.write(data);
                    },
                    async close() {
                      if (failureStage === "close") throw new DOMException("close failed", "AbortError");
                      return writable.close();
                    },
                    abort(reason) { return writable.abort(reason); },
                  };
                };
                const value = Reflect.get(fileTarget, fileProperty, fileTarget);
                return typeof value === "function" ? value.bind(fileTarget) : value;
              },
            });
          };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const originalTasksGetDirectory = tasks.getDirectoryHandle.bind(tasks);
      const failingTasks = new Proxy(tasks, {
        get(target, property) {
          if (property === "getDirectoryHandle") return async (name, options) => name === encodeURIComponent(task.id) ? failingTaskDirectory : originalTasksGetDirectory(name, options);
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const failingRoot = new Proxy(directory, {
        get(target, property) {
          if (property === "getDirectoryHandle") return async (name, options) => name === "tasks" ? failingTasks : target.getDirectoryHandle(name, options);
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const failingBackend = new globalThis.__localDirectoryBackendForTests(failingRoot);
      await failingBackend.loadWorkspace();
      let message = "";
      try { await failingBackend.saveDescription(task.id, "new content"); } catch (error) { message = `${error.name}:${error.message}`; }
      const durable = await (await (await taskDirectory.getFileHandle("description.md")).getFile()).text();
      output.push({ failureStage, message, durable });
    }
    return output;
  });
  expect(results.map((item) => item.failureStage)).toEqual(["createWritable", "write", "close"]);
  for (const result of results) {
    expect(result.message).toBeTruthy();
    expect(result.durable).toBe("durable");
  }
});

test("description conflicts offer cancel, conflict copy, and external reload", async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry("conflict-ui-workspace", { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      return root.getDirectoryHandle("conflict-ui-workspace", { create: true });
    };
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("task-workbench-state-v5", JSON.stringify(globalThis.__createDefaultStateForTests())));
  await page.locator("#chooseWorkspaceDirectory").click();
  await page.locator("#workspaceSetupImport").click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("#workspaceStorageStatus")).toHaveText("本地目录：conflict-ui-workspace");
  await page.getByRole("option", { name: /确定今天最重要的一件事/ }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#descriptionEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });

  const writeExternalDescription = (content) => page.evaluate(async (value) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle("conflict-ui-workspace");
    const task = await (await workspace.getDirectoryHandle("tasks")).getDirectoryHandle(encodeURIComponent("task-1"));
    const writable = await (await task.getFileHandle("description.md")).createWritable();
    await writable.write(value);
    await writable.close();
  }, content);
  const editor = page.locator("#descriptionEditor [contenteditable='true'], #descriptionEditor textarea").first();

  await writeExternalDescription("external-one");
  await editor.fill("browser-draft-one");
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 5_000 });
  await page.locator("#conflictCancel").click();
  await expect(page.locator("#descriptionSaveStatus")).toContainText("已被其它程序修改");
  await expect(editor).toHaveValue("browser-draft-one");

  await page.locator("#descriptionRetry").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await page.locator("#conflictCopy").click();
  await expect(page.locator("#toast")).toContainText("已保存为 description.conflict-");
  await expect(page.locator("#descriptionEditor textarea")).toHaveValue("external-one", { timeout: 20_000 });
  const copy = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle("conflict-ui-workspace");
    const task = await (await workspace.getDirectoryHandle("tasks")).getDirectoryHandle(encodeURIComponent("task-1"));
    for await (const [name, handle] of task.entries()) {
      if (handle.kind === "file" && name.startsWith("description.conflict-")) return (await handle.getFile()).text();
    }
    return "";
  });
  expect(copy.trimEnd()).toBe("browser-draft-one");

  await writeExternalDescription("external-two");
  const refreshedEditor = page.locator("#descriptionEditor [contenteditable='true'], #descriptionEditor textarea").first();
  await refreshedEditor.fill("browser-draft-two");
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 5_000 });
  await page.locator("#conflictReload").click();
  await expect(page.locator("#descriptionEditor textarea")).toHaveValue("external-two", { timeout: 20_000 });
});

test("task delete, UI undo, and reload restore all local task files", async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry("delete-undo-ui-workspace", { recursive: true }); } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
      return root.getDirectoryHandle("delete-undo-ui-workspace", { create: true });
    };
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("task-workbench-state-v5", JSON.stringify(globalThis.__createDefaultStateForTests())));
  await page.locator("#chooseWorkspaceDirectory").click();
  await Promise.all([
    page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
    page.locator("#workspaceSetupImport").click(),
  ]);
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await page.getByRole("option", { name: /确定今天最重要的一件事/ }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogEditor")).toHaveAttribute("data-editor-state", /ready|fallback/, { timeout: 20_000 });
  await page.locator("#worklogEditor [contenteditable='true'], #worklogEditor textarea").first().fill("删除撤销后仍在");
  await expect(page.locator("#worklogSaveStatus")).toHaveText("已保存", { timeout: 5_000 });
  await page.locator("#attachmentsTab").click();
  await page.locator("#attachmentFile").setInputFiles({ name: "undo-proof.txt", mimeType: "text/plain", buffer: Buffer.from("attachment survives") });
  await expect(page.locator(".attachment-row")).toHaveCount(1);
  await page.locator("#detailClose").click();

  const row = page.getByRole("option", { name: /确定今天最重要的一件事/ });
  await row.getByRole("button", { name: "更多任务操作" }).click();
  await page.locator("#moveDelete").click();
  await page.locator("#confirmOk").click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByRole("option", { name: /确定今天最重要的一件事/ })).toBeVisible();
  await expect(page.locator("#toast")).toContainText("撤销已保存");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await page.getByRole("option", { name: /确定今天最重要的一件事/ }).locator(".task-main").click();
  await page.locator("#worklogTab").click();
  await expect(page.locator("#worklogHistory")).toContainText("删除撤销后仍在");
  await page.locator("#attachmentsTab").click();
  await expect(page.locator(".attachment-row")).toContainText("undo-proof.txt");
  const layout = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle("delete-undo-ui-workspace");
    const trash = await workspace.getDirectoryHandle("trash");
    const names = [];
    for await (const [name] of trash.entries()) names.push(name);
    return names;
  });
  expect(layout).not.toContain(encodeURIComponent("task-1"));
});

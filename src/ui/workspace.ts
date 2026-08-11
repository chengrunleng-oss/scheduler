import { toISODate } from "../domain.js";
import type { AppStore } from "../store.js";
import type { AttachmentMeta, Task, WorkspaceTab, WorkLog } from "../types.js";
import { MAX_ATTACHMENT_BYTES, TASK_ATTACHMENT_WARNING_BYTES, type WorkspaceRepository } from "../workspace-db.js";
import type { Dialogs } from "./dialogs.js";
import { createElement } from "./dom.js";
import { icon } from "./icons.js";
import { createMarkdownEditor, type MarkdownEditorHandle } from "./markdown-editor.js";
import type { Elements } from "./selectors.js";

type SaveKind = "description" | "worklog";

export interface WorkspaceController {
  activateTask(taskId: string | null, tab: WorkspaceTab): Promise<void>;
  setTab(tab: WorkspaceTab): Promise<void>;
  beforeTaskChange(): Promise<boolean>;
  syncTaskState(): void;
  refreshAttachments(): Promise<void>;
}

export function createWorkspaceController(
  els: Elements,
  store: AppStore,
  repository: WorkspaceRepository,
  dialogs: Dialogs,
  persistState: () => boolean,
): WorkspaceController {
  let activeTaskId: string | null = null;
  let activeTab: WorkspaceTab = "overview";
  let activeWorkDate = toISODate();
  let descriptionEditor: MarkdownEditorHandle | null = null;
  let worklogEditor: MarkdownEditorHandle | null = null;
  let descriptionDirty = false;
  let worklogDirty = false;
  let descriptionTimer = 0;
  let worklogTimer = 0;
  let attachmentPreviewUrl = "";
  let renameAttachmentId: string | null = null;
  let editorGeneration = 0;
  let deletedWorklog: WorkLog | null = null;
  let worklogUndoTimer = 0;

  els.worklogDate.max = toISODate();
  els.worklogDate.value = activeWorkDate;

  function currentTask(): Task | null {
    return store.getState().tasks.find((item) => item.id === activeTaskId) ?? null;
  }

  function setSaveStatus(kind: SaveKind, state: "saved" | "dirty" | "saving" | "error", message?: string): void {
    const status = kind === "description" ? els.descriptionSaveStatus : els.worklogSaveStatus;
    const retry = kind === "description" ? els.descriptionRetry : els.worklogRetry;
    status.className = `save-status ${state}`;
    status.textContent = message ?? ({ saved: "已保存", dirty: "未保存", saving: "保存中…", error: "保存失败" })[state];
    retry.hidden = state !== "error";
  }

  function scheduleSave(kind: SaveKind): void {
    if (kind === "description") {
      descriptionDirty = true;
      setSaveStatus(kind, "dirty");
      window.clearTimeout(descriptionTimer);
      descriptionTimer = window.setTimeout(() => { void saveDescription(); }, 700);
    } else {
      worklogDirty = true;
      setSaveStatus(kind, "dirty");
      window.clearTimeout(worklogTimer);
      worklogTimer = window.setTimeout(() => { void saveWorklog(); }, 700);
    }
  }

  async function saveDescription(): Promise<boolean> {
    window.clearTimeout(descriptionTimer);
    if (!descriptionDirty || !activeTaskId || !descriptionEditor) return true;
    setSaveStatus("description", "saving");
    try {
      store.dispatch({ type: "set-task-description", id: activeTaskId, descriptionMarkdown: descriptionEditor.getMarkdown() });
      if (!persistState()) throw new Error("本地任务存储不可用。");
      descriptionDirty = false;
      setSaveStatus("description", "saved");
      return true;
    } catch (error) {
      setSaveStatus("description", "error", error instanceof Error ? error.message : undefined);
      return false;
    }
  }

  async function saveWorklog(): Promise<boolean> {
    window.clearTimeout(worklogTimer);
    if (!worklogDirty || !activeTaskId || !worklogEditor) return true;
    if (!repository.available) {
      setSaveStatus("worklog", "error", repository.errorMessage);
      return false;
    }
    setSaveStatus("worklog", "saving");
    try {
      const progress = els.worklogProgress.value === "" ? null : Number(els.worklogProgress.value);
      await repository.saveWorkLog({
        taskId: activeTaskId,
        workDate: activeWorkDate,
        contentMarkdown: worklogEditor.getMarkdown(),
        progressPercent: progress,
      });
      worklogDirty = false;
      setSaveStatus("worklog", "saved");
      await renderWorklogHistory();
      return true;
    } catch (error) {
      setSaveStatus("worklog", "error", error instanceof Error ? error.message : undefined);
      return false;
    }
  }

  async function destroyEditors(): Promise<void> {
    editorGeneration += 1;
    await Promise.all([descriptionEditor?.destroy(), worklogEditor?.destroy()]);
    descriptionEditor = null;
    worklogEditor = null;
  }

  async function mountEditors(): Promise<void> {
    const task = currentTask();
    if (!task || activeTab !== "worklog" || descriptionEditor || worklogEditor) return;
    const generation = ++editorGeneration;
    const readOnly = task.status !== "active" || !repository.available;
    const log = repository.available ? await repository.getWorkLog(task.id, activeWorkDate) : null;
    if (generation !== editorGeneration) return;
    els.worklogProgress.value = log?.progressPercent === null || log?.progressPercent === undefined ? "" : String(log.progressPercent);
    descriptionDirty = false;
    worklogDirty = false;
    descriptionEditor = await createMarkdownEditor({
      host: els.descriptionEditor,
      value: task.descriptionMarkdown,
      placeholder: "记录长期目标、背景与协作信息",
      readonly: readOnly,
      onChange: () => scheduleSave("description"),
      onSave: () => { void saveDescription(); },
    });
    if (generation !== editorGeneration) { await descriptionEditor.destroy(); descriptionEditor = null; return; }
    worklogEditor = await createMarkdownEditor({
      host: els.worklogEditor,
      value: log?.contentMarkdown ?? "",
      placeholder: "记录今天的进展、结论与下一步",
      readonly: readOnly,
      onChange: () => scheduleSave("worklog"),
      onSave: () => { void saveWorklog(); },
    });
    setSaveStatus("description", repository.available ? "saved" : "error", repository.available ? undefined : repository.errorMessage);
    setSaveStatus("worklog", repository.available ? "saved" : "error", repository.available ? undefined : repository.errorMessage);
    if (descriptionEditor.fallback || worklogEditor.fallback) dialogs.toast("所见即所得编辑器未能启动，已切换为 Markdown 源码与预览模式。");
    await renderWorklogHistory();
  }

  async function changeWorkDate(date: string, forceReload = false): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > toISODate()) {
      els.worklogDate.value = activeWorkDate;
      dialogs.toast("工作记录不能选择未来日期。");
      return;
    }
    if (!(await saveWorklog())) { els.worklogDate.value = activeWorkDate; return; }
    if (!forceReload && date === activeWorkDate && worklogEditor) {
      await renderWorklogHistory();
      worklogEditor.focus();
      return;
    }
    activeWorkDate = date;
    els.worklogDate.value = date;
    await worklogEditor?.destroy();
    worklogEditor = null;
    const task = currentTask();
    if (!task || activeTab !== "worklog") return;
    const log = repository.available ? await repository.getWorkLog(task.id, date) : null;
    els.worklogProgress.value = log?.progressPercent === null || log?.progressPercent === undefined ? "" : String(log.progressPercent);
    worklogDirty = false;
    worklogEditor = await createMarkdownEditor({
      host: els.worklogEditor,
      value: log?.contentMarkdown ?? "",
      placeholder: "记录当天的进展、结论与下一步",
      readonly: task.status !== "active" || !repository.available,
      onChange: () => scheduleSave("worklog"),
      onSave: () => { void saveWorklog(); },
    });
    setSaveStatus("worklog", repository.available ? "saved" : "error", repository.available ? undefined : repository.errorMessage);
    await renderWorklogHistory();
  }

  async function renderWorklogHistory(): Promise<void> {
    els.worklogHistory.replaceChildren();
    if (!activeTaskId || !repository.available) {
      els.worklogHistory.append(createElement("p", { className: "workspace-empty", text: repository.errorMessage || "暂无工作记录" }));
      return;
    }
    const records = await repository.listWorkLogs(activeTaskId);
    if (!records.length) {
      els.worklogHistory.append(createElement("p", { className: "workspace-empty", text: "暂无工作记录" }));
      return;
    }
    for (const record of records) els.worklogHistory.append(createHistoryItem(record));
  }

  function createHistoryItem(record: WorkLog): HTMLElement {
    const item = createElement("article", { className: "worklog-history-item" });
    item.dataset.worklogId = record.id;
    const header = createElement("div", { className: "worklog-history-head" });
    const dateButton = createElement("button", { className: "history-date", text: formatDate(record.workDate) });
    dateButton.type = "button";
    dateButton.dataset.worklogAction = "open";
    dateButton.dataset.workDate = record.workDate;
    header.append(dateButton);
    if (record.progressPercent !== null) header.append(createElement("span", { className: "history-progress", text: `${record.progressPercent}%` }));
    else header.append(createElement("span"));
    header.append(createElement("time", { text: formatDateTime(record.updatedAt) }));
    const actions = createElement("span", { className: "history-actions" });
    const edit = createElement("button", { className: "icon-button", title: "打开编辑" });
    edit.type = "button";
    edit.dataset.worklogAction = "open";
    edit.dataset.workDate = record.workDate;
    edit.setAttribute("aria-label", `编辑 ${formatDate(record.workDate)} 的记录`);
    edit.append(icon("Pencil", 16));
    const remove = createElement("button", { className: "icon-button danger", title: "删除记录" });
    remove.type = "button";
    remove.dataset.worklogAction = "delete";
    remove.setAttribute("aria-label", `删除 ${formatDate(record.workDate)} 的记录`);
    remove.append(icon("Trash2", 16));
    actions.append(edit, remove);
    header.append(actions);
    const content = createElement("pre", { className: "history-content", text: record.contentMarkdown || "（空记录）" });
    content.hidden = record.workDate !== activeWorkDate;
    item.append(header, content);
    return item;
  }

  function hideWorklogUndo(): void {
    window.clearTimeout(worklogUndoTimer);
    worklogUndoTimer = 0;
    deletedWorklog = null;
    els.worklogUndo.hidden = true;
  }

  function offerWorklogUndo(record: WorkLog): void {
    window.clearTimeout(worklogUndoTimer);
    deletedWorklog = record;
    els.worklogUndoText.textContent = `已删除 ${formatDate(record.workDate)} 的记录`;
    els.worklogUndo.hidden = false;
    worklogUndoTimer = window.setTimeout(hideWorklogUndo, 8_000);
  }

  async function deleteWorklog(record: WorkLog): Promise<void> {
    if (!(await dialogs.confirm("删除工作记录", `确认删除 ${formatDate(record.workDate)} 的工作记录吗？删除后 8 秒内可以撤销。`))) return;
    window.clearTimeout(worklogTimer);
    worklogDirty = false;
    await repository.deleteWorkLog(record.id);
    offerWorklogUndo(record);
    if (record.workDate === activeWorkDate) await changeWorkDate(activeWorkDate, true);
    else await renderWorklogHistory();
  }

  async function openOrCreateTodayWorklog(): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active" || !repository.available || !(await saveWorklog())) return;
    const today = toISODate();
    const existing = await repository.getWorkLog(task.id, today);
    if (!existing) await repository.saveWorkLog({ taskId: task.id, workDate: today, contentMarkdown: "", progressPercent: null });
    if (today === activeWorkDate) {
      await renderWorklogHistory();
      worklogEditor?.focus();
    } else await changeWorkDate(today);
    worklogEditor?.focus();
  }

  async function importIntoDescription(file: File): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active") return;
    if (activeTab === "worklog") await mountEditors();
    const text = await file.text();
    const current = descriptionEditor?.getMarkdown() ?? task.descriptionMarkdown;
    store.dispatch({ type: "set-task-description", id: task.id, descriptionMarkdown: appendMarkdown(current, text) });
    if (descriptionEditor) { await descriptionEditor.destroy(); descriptionEditor = null; await mountEditors(); }
    descriptionDirty = false;
    if (!persistState()) setSaveStatus("description", "error");
    else setSaveStatus("description", "saved");
  }

  async function importIntoWorklog(file: File): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active" || !repository.available) return;
    if (activeTab === "worklog") await mountEditors();
    const existing = await repository.getWorkLog(task.id, activeWorkDate);
    const current = worklogEditor?.getMarkdown() ?? existing?.contentMarkdown ?? "";
    const text = await file.text();
    if (worklogEditor) { await worklogEditor.destroy(); worklogEditor = null; }
    await repository.saveWorkLog({ taskId: task.id, workDate: activeWorkDate, contentMarkdown: appendMarkdown(current, text), progressPercent: els.worklogProgress.value === "" ? null : Number(els.worklogProgress.value) });
    worklogDirty = false;
    if (activeTab === "worklog") await changeWorkDate(activeWorkDate);
  }

  async function renderAttachments(): Promise<void> {
    els.attachmentList.replaceChildren();
    clearAttachmentPreview();
    const task = currentTask();
    const disabled = !task || task.status !== "active" || !repository.available;
    els.addAttachment.disabled = disabled;
    els.importDescription.disabled = disabled;
    els.importWorklog.disabled = disabled;
    if (!task || !repository.available) {
      els.attachmentList.append(createElement("p", { className: "workspace-empty", text: repository.errorMessage || "暂无附件" }));
      return;
    }
    const [items, estimate] = await Promise.all([repository.listAttachments(task.id), repository.estimateStorage()]);
    const taskUsage = items.reduce((total, item) => total + item.size, 0);
    els.storageUsage.textContent = estimate.quota ? `${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}` : formatBytes(taskUsage);
    els.storageProgress.value = estimate.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : Math.min(100, (taskUsage / TASK_ATTACHMENT_WARNING_BYTES) * 100);
    els.storageProgress.classList.toggle("warning", taskUsage >= TASK_ATTACHMENT_WARNING_BYTES);
    if (!items.length) {
      els.attachmentList.append(createElement("p", { className: "workspace-empty", text: "暂无附件" }));
      return;
    }
    for (const meta of items) els.attachmentList.append(createAttachmentRow(meta, task.status === "active"));
  }

  function createAttachmentRow(meta: AttachmentMeta, editable: boolean): HTMLElement {
    const row = createElement("div", { className: "attachment-row" });
    row.dataset.attachmentId = meta.id;
    const typeIcon = meta.kind === "image" ? "Image" : meta.kind === "pdf" ? "FileText" : meta.kind === "text" ? "FileCode2" : "File";
    const info = createElement("div", { className: "attachment-info" });
    info.append(icon(typeIcon), createElement("div", { className: "attachment-copy" }));
    info.lastElementChild?.append(createElement("strong", { text: meta.name }), createElement("span", { text: `${formatBytes(meta.size)} · ${formatDateTime(meta.createdAt)}` }));
    const actions = createElement("div", { className: "attachment-actions" });
    actions.append(attachmentButton("preview", "Eye", "预览附件"), attachmentButton("open", "ExternalLink", "使用浏览器打开"), attachmentButton("download", "Download", "导出附件"));
    if (meta.kind === "image" && editable) actions.append(attachmentButton("insert-image", "ImagePlus", "插入长期描述"));
    if (editable) actions.append(attachmentButton("rename", "Pencil", "重命名附件"), attachmentButton("delete", "Trash2", "删除附件", true));
    row.append(info, actions);
    return row;
  }

  function attachmentButton(action: string, iconName: Parameters<typeof icon>[0], label: string, danger = false): HTMLButtonElement {
    const button = createElement("button", { className: `icon-button${danger ? " danger" : ""}`, title: label });
    button.type = "button";
    button.dataset.attachmentAction = action;
    button.setAttribute("aria-label", label);
    button.append(icon(iconName));
    return button;
  }

  async function previewAttachment(id: string): Promise<void> {
    const task = currentTask();
    if (!task) return;
    const meta = (await repository.listAttachments(task.id)).find((item) => item.id === id);
    const blob = await repository.getAttachmentBlob(id);
    if (!meta || !blob) return;
    clearAttachmentPreview();
    els.attachmentPreview.hidden = false;
    const header = createElement("div", { className: "preview-header" });
    header.append(createElement("strong", { text: meta.name }));
    const close = createElement("button", { className: "icon-button", title: "关闭预览" });
    close.type = "button";
    close.dataset.attachmentAction = "close-preview";
    close.setAttribute("aria-label", "关闭预览");
    close.append(icon("X"));
    header.append(close);
    els.attachmentPreview.append(header);
    if (meta.kind === "image" || meta.kind === "pdf") {
      attachmentPreviewUrl = URL.createObjectURL(blob);
      if (meta.kind === "image") {
        const image = document.createElement("img"); image.src = attachmentPreviewUrl; image.alt = meta.name; els.attachmentPreview.append(image);
      } else {
        const frame = document.createElement("iframe"); frame.src = attachmentPreviewUrl; frame.title = meta.name; els.attachmentPreview.append(frame);
      }
    } else if (meta.kind === "text") {
      els.attachmentPreview.append(createElement("pre", { className: "text-preview", text: await blob.text() }));
    } else {
      els.attachmentPreview.append(createElement("p", { className: "workspace-empty", text: "此文件可导出后使用本机应用打开。" }));
    }
  }

  function clearAttachmentPreview(): void {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    attachmentPreviewUrl = "";
    els.attachmentPreview.replaceChildren();
    els.attachmentPreview.hidden = true;
  }

  async function downloadAttachment(id: string): Promise<void> {
    const task = currentTask();
    if (!task) return;
    const meta = (await repository.listAttachments(task.id)).find((item) => item.id === id);
    const blob = await repository.getAttachmentBlob(id);
    if (!meta || !blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = meta.name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function openAttachment(id: string): Promise<void> {
    const blob = await repository.getAttachmentBlob(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function insertImage(id: string): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active") return;
    const meta = (await repository.listAttachments(task.id)).find((item) => item.id === id);
    if (!meta) return;
    store.dispatch({ type: "set-task-description", id: task.id, descriptionMarkdown: appendMarkdown(task.descriptionMarkdown, `![${meta.name}](attachment:${meta.id})`) });
    persistState();
    dialogs.toast("图片引用已插入长期描述。");
    if (descriptionEditor) { await descriptionEditor.destroy(); descriptionEditor = null; await mountEditors(); }
  }

  els.worklogDate.addEventListener("change", () => { void changeWorkDate(els.worklogDate.value); });
  els.worklogProgress.addEventListener("input", () => scheduleSave("worklog"));
  els.descriptionRetry.addEventListener("click", () => { void saveDescription(); });
  els.worklogRetry.addEventListener("click", () => { void saveWorklog(); });
  els.newWorklog.addEventListener("click", () => { void openOrCreateTodayWorklog(); });
  els.undoWorklogDelete.addEventListener("click", async () => {
    const record = deletedWorklog;
    if (!record) return;
    window.clearTimeout(worklogTimer);
    worklogDirty = false;
    await repository.restoreWorkLog(record);
    hideWorklogUndo();
    if (record.taskId === activeTaskId && record.workDate === activeWorkDate) await changeWorkDate(activeWorkDate, true);
    else await renderWorklogHistory();
    dialogs.toast("工作记录已恢复。");
  });
  els.worklogHistory.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-worklog-action]");
    const item = button?.closest<HTMLElement>("[data-worklog-id]");
    if (!button || !item || !activeTaskId) return;
    if (button.dataset.worklogAction === "open" && button.dataset.workDate) await changeWorkDate(button.dataset.workDate);
    if (button.dataset.worklogAction === "delete") {
      const record = (await repository.listWorkLogs(activeTaskId)).find((entry) => entry.id === item.dataset.worklogId);
      if (record) await deleteWorklog(record);
    }
  });
  els.addAttachment.addEventListener("click", () => els.attachmentFile.click());
  els.importDescription.addEventListener("click", () => els.descriptionImportFile.click());
  els.importWorklog.addEventListener("click", () => els.worklogImportFile.click());
  els.attachmentFile.addEventListener("change", async () => {
    const files = Array.from(els.attachmentFile.files ?? []); els.attachmentFile.value = "";
    if (!activeTaskId || !files.length) return;
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${file.name}”超过 20 MB。`);
        await repository.addAttachment(activeTaskId, file);
      }
      await renderAttachments();
    } catch (error) { dialogs.toast(error instanceof Error ? error.message : "附件保存失败。"); }
  });
  els.descriptionImportFile.addEventListener("change", async () => {
    const file = els.descriptionImportFile.files?.[0]; els.descriptionImportFile.value = ""; if (file) await importIntoDescription(file);
  });
  els.worklogImportFile.addEventListener("change", async () => {
    const file = els.worklogImportFile.files?.[0]; els.worklogImportFile.value = ""; if (file) await importIntoWorklog(file);
  });
  els.attachmentList.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-attachment-action]");
    const row = button?.closest<HTMLElement>("[data-attachment-id]");
    const id = row?.dataset.attachmentId;
    if (!button || !id) return;
    const action = button.dataset.attachmentAction;
    if (action === "preview") await previewAttachment(id);
    if (action === "open") await openAttachment(id);
    if (action === "download") await downloadAttachment(id);
    if (action === "insert-image") await insertImage(id);
    if (action === "rename") {
      const task = currentTask(); const meta = task ? (await repository.listAttachments(task.id)).find((item) => item.id === id) : null;
      if (meta) { renameAttachmentId = id; els.attachmentRenameName.value = meta.name; els.attachmentRenameDialog.showModal(); els.attachmentRenameName.focus(); }
    }
    if (action === "delete" && await dialogs.confirm("删除附件", "删除后无法通过任务撤销恢复，继续吗？")) { await repository.deleteAttachment(id); await renderAttachments(); }
  });
  els.attachmentPreview.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-attachment-action='close-preview']")) clearAttachmentPreview();
  });
  els.attachmentRenameForm.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!renameAttachmentId) return;
    try { await repository.renameAttachment(renameAttachmentId, els.attachmentRenameName.value); els.attachmentRenameDialog.close(); renameAttachmentId = null; await renderAttachments(); }
    catch (error) { dialogs.toast(error instanceof Error ? error.message : "附件重命名失败。"); }
  });
  els.attachmentRenameDialog.addEventListener("close", () => { renameAttachmentId = null; });

  const controller: WorkspaceController = {
    async activateTask(taskId, tab) {
      if (activeTaskId === taskId) { activeTab = tab; if (tab === "worklog") await mountEditors(); if (tab === "attachments") await renderAttachments(); return; }
      await destroyEditors();
      hideWorklogUndo();
      activeTaskId = taskId;
      activeTab = tab;
      activeWorkDate = toISODate();
      els.worklogDate.value = activeWorkDate;
      clearAttachmentPreview();
      if (taskId && tab === "worklog") await mountEditors();
      if (taskId && tab === "attachments") await renderAttachments();
    },
    async setTab(tab) {
      activeTab = tab;
      if (tab === "worklog") await mountEditors();
      if (tab === "attachments") await renderAttachments();
    },
    async beforeTaskChange() {
      const descriptionSaved = await saveDescription();
      const worklogSaved = await saveWorklog();
      return descriptionSaved && worklogSaved;
    },
    syncTaskState() {
      const readOnly = currentTask()?.status !== "active" || !repository.available;
      descriptionEditor?.setReadonly(readOnly);
      worklogEditor?.setReadonly(readOnly);
      els.newWorklog.disabled = readOnly;
    },
    refreshAttachments: renderAttachments,
  };
  return controller;
}

function appendMarkdown(current: string, addition: string): string {
  return [current.trimEnd(), addition.trim()].filter(Boolean).join("\n\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

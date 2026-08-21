import { toISODate } from "../domain.js";
import type { AppStore } from "../store.js";
import type { AttachmentMeta, Task, WorkspaceTab, WorkLog } from "../types.js";
import { MAX_ATTACHMENT_BYTES, TASK_ATTACHMENT_WARNING_BYTES, type WorkspaceBackend, WorkspaceConflictError } from "../workspace-backend.js";
import type { Dialogs } from "./dialogs.js";
import { createElement } from "./dom.js";
import { icon } from "./icons.js";
import { createMarkdownEditor, type MarkdownEditorHandle } from "./markdown-editor.js";
import { attachmentImageMarkdown, attachmentLinkMarkdown, createMarkdownRenderer, renderPlainMarkdown, type MarkdownRenderer } from "./markdown-render.js";
import { isLightboxOpen } from "./lightbox.js";
import { exportHtmlAsPdf } from "./pdf-export.js";
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
  backend: WorkspaceBackend,
  dialogs: Dialogs,
  persistState: () => Promise<boolean>,
  onActivityChanged?: () => void,
): WorkspaceController {
  let activeTaskId: string | null = null;
  let activeTab: WorkspaceTab = "overview";
  let activeWorkDate = toISODate();
  let activeWorkLogId: string | null = null;
  let activeWorkLogConflictOrigin: WorkLog["conflictOrigin"];
  let descriptionEditor: MarkdownEditorHandle | null = null;
  let worklogEditor: MarkdownEditorHandle | null = null;
  let descriptionDirty = false;
  let worklogDirty = false;
  let savedDescriptionMarkdown = "";
  let savedWorklogMarkdown = "";
  let descriptionTimer = 0;
  let worklogTimer = 0;
  let attachmentPreviewUrl = "";
  let renameAttachmentId: string | null = null;
  let editorGeneration = 0;
  let deletedWorklog: WorkLog | null = null;
  let deletedWorklogWasActive = false;
  let worklogUndoTimer = 0;
  let markdownRenderer: MarkdownRenderer | null = null;

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

  async function reloadExternalVersion(message: string): Promise<void> {
    const refreshed = await backend.loadWorkspace();
    descriptionDirty = false;
    worklogDirty = false;
    store.dispatch({ type: "replace-state", state: refreshed.state });
    await destroyEditors();
    if (activeTab === "worklog") await mountEditors();
    if (activeTab === "attachments") await renderAttachments();
    dialogs.toast(message);
  }

  async function resolveConflict(error: WorkspaceConflictError, content: Blob): Promise<boolean> {
    const resolution = await dialogs.resolveConflict(error.message);
    if (resolution === "cancel") return false;
    if (resolution === "copy") {
      const path = await backend.saveConflictCopy(error.target, content);
      await reloadExternalVersion(`当前内容已保存为 ${path}，并已载入外部版本。`);
      return true;
    }
    await reloadExternalVersion("已载入外部版本，未覆盖本地文件。");
    return true;
  }

  async function saveDescription(): Promise<boolean> {
    window.clearTimeout(descriptionTimer);
    if (!activeTaskId || !descriptionEditor) return true;
    // TEST-V08-017：输入法合成中跳过保存并稍后重试，避免拼音中间态被持久化。
    if (descriptionEditor.isComposing()) { descriptionTimer = window.setTimeout(() => { void saveDescription(); }, 400); return true; }
    const markdown = descriptionEditor.getMarkdown();
    if (!descriptionDirty && normalizeMarkdown(markdown) === normalizeMarkdown(savedDescriptionMarkdown)) return true;
    setSaveStatus("description", "saving");
    try {
      await backend.saveDescription(activeTaskId, markdown);
      store.dispatch({ type: "set-task-description", id: activeTaskId, descriptionMarkdown: markdown });
      if (!(await persistState())) throw new Error("本地任务存储不可用。");
      descriptionDirty = false;
      savedDescriptionMarkdown = markdown;
      setSaveStatus("description", "saved");
      return true;
    } catch (error) {
      if (error instanceof WorkspaceConflictError) {
        const resolved = await resolveConflict(error, new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
        if (resolved) return true;
      }
      setSaveStatus("description", "error", error instanceof Error ? error.message : undefined);
      return false;
    }
  }

  async function saveWorklog(): Promise<boolean> {
    window.clearTimeout(worklogTimer);
    if (!activeTaskId || !worklogEditor) return true;
    // TEST-V08-017：输入法合成中跳过保存并稍后重试，避免拼音中间态被持久化。
    if (worklogEditor.isComposing()) { worklogTimer = window.setTimeout(() => { void saveWorklog(); }, 400); return true; }
    const markdown = worklogEditor.getMarkdown();
    if (!worklogDirty && normalizeMarkdown(markdown) === normalizeMarkdown(savedWorklogMarkdown)) return true;
    if (!backend.available) {
      setSaveStatus("worklog", "error", backend.errorMessage);
      return false;
    }
    setSaveStatus("worklog", "saving");
    try {
      const progress = els.worklogProgress.value === "" ? null : Number(els.worklogProgress.value);
      await backend.saveWorkLog({
        id: activeWorkLogId ?? undefined,
        taskId: activeTaskId,
        workDate: activeWorkDate,
        contentMarkdown: markdown,
        progressPercent: progress,
        conflictOrigin: activeWorkLogConflictOrigin,
      });
      worklogDirty = false;
      savedWorklogMarkdown = markdown;
      setSaveStatus("worklog", "saved");
      await renderWorklogHistory();
      onActivityChanged?.();
      return true;
    } catch (error) {
      if (error instanceof WorkspaceConflictError) {
        const resolved = await resolveConflict(error, new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
        if (resolved) return true;
      }
      setSaveStatus("worklog", "error", error instanceof Error ? error.message : undefined);
      return false;
    }
  }

  async function destroyEditors(): Promise<void> {
    editorGeneration += 1;
    markdownRenderer?.release();
    markdownRenderer = null;
    await Promise.all([descriptionEditor?.destroy(), worklogEditor?.destroy()]);
    descriptionEditor = null;
    worklogEditor = null;
  }

  async function mountEditors(): Promise<void> {
    const task = currentTask();
    if (!task || activeTab !== "worklog" || descriptionEditor || worklogEditor) return;
    const generation = ++editorGeneration;
    const readOnly = task.status !== "active" || !backend.available;
    const log = backend.available ? await backend.getWorkLog(task.id, activeWorkDate, activeWorkLogId ?? undefined) : null;
    if (generation !== editorGeneration) return;
    els.worklogProgress.value = log?.progressPercent === null || log?.progressPercent === undefined ? "" : String(log.progressPercent);
    descriptionDirty = false;
    worklogDirty = false;
    savedDescriptionMarkdown = task.descriptionMarkdown;
    savedWorklogMarkdown = log?.contentMarkdown ?? "";
    activeWorkLogId = log?.id ?? null;
    activeWorkLogConflictOrigin = log?.conflictOrigin;
    markdownRenderer?.release();
    markdownRenderer = createMarkdownRenderer(backend, task.id);
    const render = (markdown: string) => markdownRenderer!.render(markdown);
    const uploadFiles = readOnly ? undefined : uploadEditorFiles;
    descriptionEditor = await createMarkdownEditor({
      host: els.descriptionEditor,
      value: task.descriptionMarkdown,
      placeholder: "记录长期目标、背景与协作信息",
      readonly: readOnly,
      onChange: () => scheduleSave("description"),
      onSave: () => { void saveDescription(); },
      render,
      uploadFiles,
      // TEST-V08-033：放大按钮移到编辑器工具栏“源码/预览”切换键右侧。
      toolbarExtras: [els.zoomDescription],
    });
    if (generation !== editorGeneration) { await descriptionEditor.destroy(); descriptionEditor = null; return; }
    worklogEditor = await createMarkdownEditor({
      host: els.worklogEditor,
      value: log?.contentMarkdown ?? "",
      placeholder: "记录今天的进展、结论与下一步",
      readonly: readOnly,
      onChange: () => scheduleSave("worklog"),
      onSave: () => { void saveWorklog(); },
      render,
      uploadFiles,
      toolbarExtras: [els.zoomDaily],
    });
    setSaveStatus("description", backend.available ? "saved" : "error", backend.available ? undefined : backend.errorMessage);
    setSaveStatus("worklog", backend.available ? "saved" : "error", backend.available ? undefined : backend.errorMessage);
    await renderWorklogHistory();
  }

  async function changeWorkDate(date: string, forceReload = false, recordId?: string): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > toISODate()) {
      els.worklogDate.value = activeWorkDate;
      dialogs.toast("工作记录不能选择未来日期。");
      return;
    }
    if (!(await saveWorklog())) { els.worklogDate.value = activeWorkDate; return; }
    if (!forceReload && date === activeWorkDate && (recordId ?? activeWorkLogId) === activeWorkLogId && worklogEditor) {
      await renderWorklogHistory();
      worklogEditor.focus();
      return;
    }
    activeWorkDate = date;
    activeWorkLogId = recordId ?? null;
    els.worklogDate.value = date;
    await worklogEditor?.destroy();
    worklogEditor = null;
    const task = currentTask();
    if (!task || activeTab !== "worklog") return;
    const log = backend.available ? await backend.getWorkLog(task.id, date, recordId) : null;
    els.worklogProgress.value = log?.progressPercent === null || log?.progressPercent === undefined ? "" : String(log.progressPercent);
    worklogDirty = false;
    savedWorklogMarkdown = log?.contentMarkdown ?? "";
    activeWorkLogId = log?.id ?? null;
    activeWorkLogConflictOrigin = log?.conflictOrigin;
    const readOnly = task.status !== "active" || !backend.available;
    worklogEditor = await createMarkdownEditor({
      host: els.worklogEditor,
      value: log?.contentMarkdown ?? "",
      placeholder: "记录当天的进展、结论与下一步",
      readonly: readOnly,
      onChange: () => scheduleSave("worklog"),
      onSave: () => { void saveWorklog(); },
      render: (markdown) => markdownRenderer?.render(markdown) ?? Promise.resolve(markdown),
      uploadFiles: readOnly ? undefined : uploadEditorFiles,
      toolbarExtras: [els.zoomDaily],
    });
    setSaveStatus("worklog", backend.available ? "saved" : "error", backend.available ? undefined : backend.errorMessage);
    await renderWorklogHistory();
  }

  // TEST-V08-024：历史记录的展开集合（重绘后恢复），当前打开在编辑器里的记录默认展开。
  const expandedWorklogIds = new Set<string>();

  async function renderWorklogHistory(): Promise<void> {
    els.worklogHistory.replaceChildren();
    if (!activeTaskId || !backend.available) {
      els.worklogHistory.append(createElement("p", { className: "workspace-empty", text: backend.errorMessage || "暂无工作记录" }));
      return;
    }
    const records = await backend.listWorkLogs(activeTaskId);
    if (!records.length) {
      els.worklogHistory.append(createElement("p", { className: "workspace-empty", text: "暂无工作记录" }));
      return;
    }
    const items = await Promise.all(records.map((record) => createHistoryItem(record)));
    for (const item of items) els.worklogHistory.append(item);
  }

  async function createHistoryItem(record: WorkLog): Promise<HTMLElement> {
    const item = createElement("article", { className: "worklog-history-item" });
    item.dataset.worklogId = record.id;
    const expanded = expandedWorklogIds.has(record.id) || record.id === activeWorkLogId;
    item.classList.toggle("expanded", expanded);
    const header = createElement("div", { className: "worklog-history-head" });
    const dateButton = createElement("button", { className: "history-date" });
    dateButton.type = "button";
    dateButton.dataset.worklogAction = "toggle";
    dateButton.dataset.workDate = record.workDate;
    dateButton.dataset.worklogId = record.id;
    dateButton.setAttribute("aria-expanded", String(expanded));
    dateButton.setAttribute("aria-label", `${expanded ? "收起" : "展开"} ${formatDate(record.workDate)}${record.conflictOrigin === "imported" ? "的导入冲突副本" : "的记录"}`);
    dateButton.append(icon("ChevronDown", 15), document.createTextNode(`${formatDate(record.workDate)}${record.conflictOrigin === "imported" ? " · 导入冲突副本" : ""}`));
    header.append(dateButton);
    if (record.progressPercent !== null) header.append(createElement("span", { className: "history-progress", text: `${record.progressPercent}%` }));
    else header.append(createElement("span"));
    header.append(createElement("time", { text: formatDateTime(record.updatedAt) }));
    const actions = createElement("span", { className: "history-actions" });
    const edit = createElement("button", { className: "icon-button", title: "打开编辑" });
    edit.type = "button";
    edit.dataset.worklogAction = "open";
    edit.dataset.workDate = record.workDate;
    edit.dataset.worklogId = record.id;
    edit.setAttribute("aria-label", `编辑 ${formatDate(record.workDate)}${record.conflictOrigin === "imported" ? "的导入冲突副本" : "的记录"}`);
    edit.append(icon("Pencil", 16));
    const move = createElement("button", { className: "icon-button", title: "修改记录日期" });
    move.type = "button";
    move.dataset.worklogAction = "move-date";
    move.dataset.worklogId = record.id;
    move.setAttribute("aria-label", `修改 ${formatDate(record.workDate)} 的记录日期`);
    move.append(icon("CalendarClock", 16));
    const exportPdf = createElement("button", { className: "icon-button", title: "导出 PDF" });
    exportPdf.type = "button";
    exportPdf.dataset.worklogAction = "export-pdf";
    exportPdf.dataset.worklogId = record.id;
    exportPdf.setAttribute("aria-label", `导出 ${formatDate(record.workDate)} 的记录为 PDF`);
    exportPdf.append(icon("Download", 16));
    const remove = createElement("button", { className: "icon-button danger", title: "删除记录" });
    remove.type = "button";
    remove.dataset.worklogAction = "delete";
    remove.setAttribute("aria-label", `删除 ${formatDate(record.workDate)} 的记录`);
    remove.append(icon("Trash2", 16));
    actions.append(edit, move, exportPdf, remove);
    header.append(actions);
    const wrap = createElement("div", { className: "history-content-wrap" });
    const content = createElement("div", { className: "history-content rendered-markdown" });
    content.innerHTML = record.contentMarkdown
      ? await (markdownRenderer?.render(record.contentMarkdown) ?? Promise.resolve(renderPlainMarkdown(record.contentMarkdown)))
      : "";
    if (!record.contentMarkdown) content.textContent = "（空记录）";
    wrap.append(content);
    item.append(header, wrap);
    return item;
  }

  function hideWorklogUndo(): void {
    window.clearTimeout(worklogUndoTimer);
    worklogUndoTimer = 0;
    deletedWorklog = null;
    deletedWorklogWasActive = false;
    els.worklogUndo.hidden = true;
  }

  function offerWorklogUndo(record: WorkLog, wasActive: boolean): void {
    window.clearTimeout(worklogUndoTimer);
    deletedWorklog = record;
    deletedWorklogWasActive = wasActive;
    els.worklogUndoText.textContent = `已删除 ${formatDate(record.workDate)} 的记录`;
    els.worklogUndo.hidden = false;
    worklogUndoTimer = window.setTimeout(hideWorklogUndo, 8_000);
  }

  async function deleteWorklog(record: WorkLog): Promise<void> {
    if (!(await dialogs.confirm("删除工作记录", `确认删除 ${formatDate(record.workDate)} 的工作记录吗？删除后 8 秒内可以撤销。`))) return;
    window.clearTimeout(worklogTimer);
    worklogDirty = false;
    const wasActive = record.id === activeWorkLogId;
    await backend.deleteWorkLog(record.id);
    offerWorklogUndo(record, wasActive);
    if (wasActive) await changeWorkDate(activeWorkDate, true);
    else await renderWorklogHistory();
    onActivityChanged?.();
  }

  async function openOrCreateTodayWorklog(): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active" || !backend.available || !(await saveWorklog())) return;
    const today = toISODate();
    const existing = await backend.getWorkLog(task.id, today);
    const record = existing ?? await backend.saveWorkLog({ taskId: task.id, workDate: today, contentMarkdown: "", progressPercent: null });
    if (today === activeWorkDate) {
      await changeWorkDate(today, true, record.id);
    } else await changeWorkDate(today, false, record.id);
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
    if (!(await persistState())) setSaveStatus("description", "error");
    else setSaveStatus("description", "saved");
  }

  async function importIntoWorklog(file: File): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active" || !backend.available) return;
    if (activeTab === "worklog") await mountEditors();
    const existing = await backend.getWorkLog(task.id, activeWorkDate, activeWorkLogId ?? undefined);
    const current = worklogEditor?.getMarkdown() ?? existing?.contentMarkdown ?? "";
    const text = await file.text();
    if (worklogEditor) { await worklogEditor.destroy(); worklogEditor = null; }
    await backend.saveWorkLog({ id: activeWorkLogId ?? undefined, taskId: task.id, workDate: activeWorkDate, contentMarkdown: appendMarkdown(current, text), progressPercent: els.worklogProgress.value === "" ? null : Number(els.worklogProgress.value), conflictOrigin: activeWorkLogConflictOrigin });
    worklogDirty = false;
    onActivityChanged?.();
    if (activeTab === "worklog") await changeWorkDate(activeWorkDate);
  }

  async function renderAttachments(): Promise<void> {
    els.attachmentList.replaceChildren();
    clearAttachmentPreview();
    const task = currentTask();
    const disabled = !task || task.status !== "active" || !backend.available;
    els.addAttachment.disabled = disabled;
    els.importDescription.disabled = disabled;
    els.importWorklog.disabled = disabled;
    if (!task || !backend.available) {
      els.attachmentList.append(createElement("p", { className: "workspace-empty", text: backend.errorMessage || "暂无附件" }));
      return;
    }
    const [items, estimate] = await Promise.all([backend.listAttachments(task.id), backend.estimateStorage()]);
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
    const typeIcon = meta.kind === "image" ? "Image" : meta.kind === "video" ? "Film" : meta.kind === "pdf" ? "FileText" : meta.kind === "text" ? "FileCode2" : "File";
    const info = createElement("div", { className: "attachment-info" });
    info.append(icon(typeIcon), createElement("div", { className: "attachment-copy" }));
    info.lastElementChild?.append(createElement("strong", { text: meta.name }), createElement("span", { text: `${formatBytes(meta.size)} · ${formatDateTime(meta.createdAt)}` }));
    const actions = createElement("div", { className: "attachment-actions" });
    actions.append(attachmentButton("preview", "Eye", "预览附件"));
    if (meta.kind !== "text") actions.append(attachmentButton("open", "ExternalLink", "使用浏览器打开"));
    actions.append(attachmentButton("download", "Download", "导出附件"));
    if (meta.kind === "text" && editable) actions.append(attachmentButton("edit", "FilePenLine", "编辑文本附件"));
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
    const meta = (await backend.listAttachments(task.id)).find((item) => item.id === id);
    const blob = await backend.readAttachment(id);
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
    if (meta.kind === "image" || meta.kind === "pdf" || meta.kind === "video") {
      attachmentPreviewUrl = URL.createObjectURL(blob);
      if (meta.kind === "image") {
        const image = document.createElement("img"); image.src = attachmentPreviewUrl; image.alt = meta.name; els.attachmentPreview.append(image);
      } else if (meta.kind === "video") {
        // TEST-V08-032：视频附件应用内预览播放。
        const video = document.createElement("video"); video.src = attachmentPreviewUrl; video.controls = true; video.title = meta.name;
        els.attachmentPreview.append(video);
      } else {
        const frame = document.createElement("iframe"); frame.src = attachmentPreviewUrl; frame.title = meta.name; els.attachmentPreview.append(frame);
      }
    } else if (meta.kind === "text") {
      els.attachmentPreview.append(createElement("pre", { className: "text-preview", text: await blob.text() }));
    } else {
      els.attachmentPreview.append(createElement("p", { className: "workspace-empty", text: "此文件可导出后使用本机应用打开。" }));
    }
  }

  async function editTextAttachment(id: string): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active") return;
    const meta = (await backend.listAttachments(task.id)).find((item) => item.id === id);
    const blob = await backend.readAttachment(id);
    if (!meta || !blob || meta.kind !== "text") return;
    clearAttachmentPreview();
    els.attachmentPreview.hidden = false;
    const header = createElement("div", { className: "preview-header" });
    header.append(createElement("strong", { text: meta.name }));
    const save = createElement("button", { className: "button primary compact-button", text: "保存" });
    save.type = "button";
    const close = createElement("button", { className: "icon-button", title: "关闭编辑" });
    close.type = "button";
    close.dataset.attachmentAction = "close-preview";
    close.setAttribute("aria-label", "关闭编辑");
    close.append(icon("X"));
    const actions = createElement("span", { className: "preview-actions" });
    actions.append(save, close);
    header.append(actions);
    const editor = createElement("textarea", { className: "attachment-text-editor" });
    editor.value = await blob.text();
    editor.setAttribute("aria-label", `编辑 ${meta.name}`);
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        const content = new Blob([editor.value.replace(/\r\n?/g, "\n")], { type: meta.type || "text/plain;charset=utf-8" });
        await backend.saveAttachment(id, content);
        dialogs.toast("文本附件已保存。");
        await renderAttachments();
      } catch (error) {
        if (error instanceof WorkspaceConflictError) {
          const content = new Blob([editor.value.replace(/\r\n?/g, "\n")], { type: meta.type || "text/plain;charset=utf-8" });
          if (await resolveConflict(error, content)) return;
        }
        dialogs.toast(error instanceof Error ? error.message : "文本附件保存失败。");
        save.disabled = false;
      }
    });
    els.attachmentPreview.append(header, editor);
    editor.focus();
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
    const meta = (await backend.listAttachments(task.id)).find((item) => item.id === id);
    const blob = await backend.readAttachment(id);
    if (!meta || !blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = meta.name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function openAttachment(id: string): Promise<void> {
    const blob = await backend.readAttachment(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function insertImage(id: string): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active") return;
    const meta = (await backend.listAttachments(task.id)).find((item) => item.id === id);
    if (!meta) return;
    store.dispatch({ type: "set-task-description", id: task.id, descriptionMarkdown: appendMarkdown(task.descriptionMarkdown, `![${meta.name}](attachment:${meta.id})`) });
    await persistState();
    dialogs.toast("图片引用已插入长期描述。");
    if (descriptionEditor) { await descriptionEditor.destroy(); descriptionEditor = null; await mountEditors(); }
  }

  // 编辑器内拖入/粘贴的文件自动入库为附件，并返回插入光标处的 Markdown 引用片段。
  async function uploadEditorFiles(files: File[]): Promise<string | null> {
    const task = currentTask();
    if (!task || !backend.available) return null;
    const snippets: string[] = [];
    const accepted = files.filter((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        dialogs.toast(`文件“${file.name}”超过 20 MB，未添加。`);
        return false;
      }
      return true;
    });
    let done = 0;
    for (const file of accepted) {
      done += 1;
      if (accepted.length > 1) dialogs.toast(`正在入库附件 ${done}/${accepted.length}：${file.name}`);
      try {
        const meta = await backend.putAttachment(task.id, file);
        snippets.push(meta.kind === "image" ? attachmentImageMarkdown(meta.name, meta.id) : attachmentLinkMarkdown(meta.name, meta.id));
      } catch (error) {
        dialogs.toast(`文件“${file.name}”入库失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }
    if (snippets.length) {
      dialogs.toast(`已入库 ${snippets.length} 个附件并插入引用。`);
      await renderAttachments();
    }
    return snippets.length ? snippets.join("\n\n") : null;
  }

  // 把长期描述与工作记录中内嵌的 data: URI 图片提取为附件，替换为 attachment: 引用。
  const DATA_IMAGE_PATTERN = /!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/g;

  function dataUriToFile(uri: string, fallbackName: string): File | null {
    const comma = uri.indexOf(",");
    if (comma < 0) return null;
    const mimeMatch = /^data:([^;]+)/.exec(uri.slice(0, comma));
    const mime = mimeMatch?.[1] ?? "image/png";
    let binary: string;
    try { binary = atob(uri.slice(comma + 1)); } catch { return null; }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp", "image/svg+xml": "svg" };
    const extension = extensions[mime] ?? "png";
    const name = fallbackName && !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fallbackName) ? `${fallbackName}.${extension}` : (fallbackName || `embedded-image.${extension}`);
    return new File([bytes], name, { type: mime });
  }

  async function replaceEmbeddedImages(taskId: string, markdown: string): Promise<{ text: string; migrated: number; skipped: number }> {
    let migrated = 0;
    let skipped = 0;
    let cursor = 0;
    let output = "";
    for (const match of markdown.matchAll(DATA_IMAGE_PATTERN)) {
      const index = match.index ?? 0;
      output += markdown.slice(cursor, index);
      const alt = match[1] || "";
      const file = dataUriToFile(match[2] ?? "", alt);
      if (!file || file.size > MAX_ATTACHMENT_BYTES) {
        skipped += 1;
        output += match[0];
      } else {
        try {
          const meta = await backend.putAttachment(taskId, file);
          output += attachmentImageMarkdown(meta.name, meta.id);
          migrated += 1;
        } catch {
          skipped += 1;
          output += match[0];
        }
      }
      cursor = index + match[0].length;
    }
    output += markdown.slice(cursor);
    return { text: output, migrated, skipped };
  }

  async function migrateEmbeddedImages(): Promise<void> {
    const task = currentTask();
    if (!task || task.status !== "active" || !backend.available) return;
    let migrated = 0;
    let skipped = 0;
    const description = await replaceEmbeddedImages(task.id, task.descriptionMarkdown);
    migrated += description.migrated;
    skipped += description.skipped;
    if (description.text !== task.descriptionMarkdown) {
      await backend.saveDescription(task.id, description.text);
      store.dispatch({ type: "set-task-description", id: task.id, descriptionMarkdown: description.text });
      await persistState();
    }
    for (const record of await backend.listWorkLogs(task.id)) {
      const replaced = await replaceEmbeddedImages(task.id, record.contentMarkdown);
      migrated += replaced.migrated;
      skipped += replaced.skipped;
      if (replaced.text !== record.contentMarkdown) await backend.saveWorkLog({ ...record, contentMarkdown: replaced.text });
    }
    await destroyEditors();
    if (activeTab === "worklog") await mountEditors();
    await renderAttachments();
    onActivityChanged?.();
    dialogs.toast(migrated
      ? `已迁移 ${migrated} 张内嵌图片为附件引用${skipped ? `，跳过 ${skipped} 张` : ""}。`
      : (skipped ? "内嵌图片均未迁移，请检查图片大小。 " : "没有找到需要迁移的内嵌图片。"));
  }

  els.migrateEmbeddedImages.addEventListener("click", () => { void migrateEmbeddedImages(); });

  // TEST-V08-022：组件级放大。每个需要放大查看的组件各自提供按钮，打开后该组件全屏阅读，Esc 或按钮恢复。
  // TEST-V08-025：按钮图标随状态切换（放大 Maximize2 ↔ 恢复 Minimize2），历史记录放大时自动展开全部条目。
  const zoomSections = new Map<HTMLButtonElement, HTMLElement>([
    [els.zoomDescription, els.descriptionSection],
    [els.zoomDaily, els.dailySection],
    [els.zoomHistory, els.worklogHistorySection],
  ]);
  const zoomLabels = new Map<HTMLButtonElement, string>([
    [els.zoomDescription, "长期描述"],
    [els.zoomDaily, "每日记录"],
    [els.zoomHistory, "历史记录"],
  ]);
  let zoomedButton: HTMLButtonElement | null = null;
  function refreshZoomButtons(): void {
    for (const [button, label] of zoomLabels) {
      const zoomed = button === zoomedButton;
      const holder = document.createElement("span");
      holder.className = "section-zoom-icon";
      holder.append(icon(zoomed ? "Minimize2" : "Maximize2", 18));
      button.querySelector(".section-zoom-icon")?.remove();
      button.prepend(holder);
      button.title = zoomed ? `恢复${label}` : `放大${label}`;
      button.setAttribute("aria-label", zoomed ? `恢复${label}` : `放大${label}`);
      button.setAttribute("aria-pressed", String(zoomed));
    }
  }
  // TEST-V08-026：长期描述与每日记录的折叠开关（会话内状态）。
  // TEST-V08-030：折叠热区扩展到整个区块表头（按钮、输入、标签等交互元素除外）。
  // TEST-V08-039：历史记录区新增总折叠开关；三个区块折叠按钮统一排在标题头最左并左对齐。
  const collapseSections = new Map<HTMLButtonElement, HTMLElement>([
    [els.collapseDescription, els.descriptionSection],
    [els.collapseDaily, els.dailySection],
    [els.collapseHistory, els.worklogHistorySection],
  ]);
  const collapseLabels = new Map<HTMLButtonElement, string>([
    [els.collapseDescription, "长期描述"],
    [els.collapseDaily, "每日记录"],
    [els.collapseHistory, "历史记录"],
  ]);
  function setSectionCollapsed(section: HTMLElement, button: HTMLButtonElement, collapsed: boolean): void {
    const label = collapseLabels.get(button) ?? "区块";
    section.classList.toggle("section-collapsed", collapsed);
    button.setAttribute("aria-pressed", String(collapsed));
    button.title = collapsed ? `展开${label}` : `折叠${label}`;
    button.setAttribute("aria-label", collapsed ? `展开${label}` : `折叠${label}`);
    // TEST-V08-036：折叠后按钮改为“展开”按钮（图标切换而非旋转）。
    button.querySelector("svg")?.remove();
    const glyph = icon(collapsed ? "ChevronRight" : "ChevronDown", 16);
    glyph.dataset.collapseGlyph = collapsed ? "expand" : "collapse";
    button.prepend(glyph);
    section.querySelector<HTMLElement>(":scope > .workspace-section-heading")?.setAttribute("title", collapsed ? "点击展开该区块" : "点击折叠该区块");
  }
  for (const [button, section] of collapseSections) {
    button.addEventListener("click", (event) => {
      // TEST-V08-036：阻止冒泡到表头热区；图标替换会移除原事件目标，closest 在脱离节点上失效。
      event.stopPropagation();
      setSectionCollapsed(section, button, !section.classList.contains("section-collapsed"));
    });
    const heading = section.querySelector<HTMLElement>(":scope > .workspace-section-heading");
    if (heading) {
      heading.classList.add("section-heading-toggleable");
      heading.title = section.classList.contains("section-collapsed") ? "点击展开该区块" : "点击折叠该区块";
      heading.addEventListener("click", (event) => {
        const interactive = event.composedPath().some((entry) => entry instanceof Element && entry.matches("button, input, select, label, a"));
        if (interactive) return;
        setSectionCollapsed(section, button, !section.classList.contains("section-collapsed"));
      });
    }
  }

  function setSectionZoom(button: HTMLButtonElement | null): void {
    if (zoomedButton === button) return;
    if (zoomedButton) {
      const previous = zoomSections.get(zoomedButton);
      previous?.classList.remove("zoom-overlay");
    }
    zoomedButton = button;
    if (button) {
      const section = zoomSections.get(button);
      section?.classList.add("zoom-overlay");
      // 放大已折叠的区块时先展开，保证放大视图完整；走完整折叠函数让图标、title、aria 状态一致。
      if (section?.classList.contains("section-collapsed")) {
        for (const [collapseButton, collapseSection] of collapseSections) {
          if (collapseSection === section) setSectionCollapsed(collapseSection, collapseButton, false);
        }
      }
      // 放大历史记录时展开全部条目，保证阅读视图完整；展开状态保留。
      if (button === els.zoomHistory) {
        for (const item of els.worklogHistory.querySelectorAll<HTMLElement>(".worklog-history-item")) {
          item.classList.add("expanded");
          const toggle = item.querySelector<HTMLButtonElement>("button[data-worklog-action='toggle']");
          toggle?.setAttribute("aria-expanded", "true");
          const labelText = toggle?.getAttribute("aria-label") ?? "";
          toggle?.setAttribute("aria-label", labelText.replace(/^展开/, "收起"));
          if (item.dataset.worklogId) expandedWorklogIds.add(item.dataset.worklogId);
        }
        populateHistoryZoomToc();
      }
    }
    if (zoomedButton !== els.zoomHistory) els.historyZoomToc.hidden = true;
    refreshZoomButtons();
  }

  // TEST-V08-026：历史记录放大视图的左侧日期目录；点击条目丝滑滚动到对应记录。
  function populateHistoryZoomToc(): void {
    els.historyZoomToc.replaceChildren();
    const items = [...els.worklogHistory.querySelectorAll<HTMLElement>(".worklog-history-item")];
    els.historyZoomToc.hidden = items.length === 0;
    for (const item of items) {
      const toggle = item.querySelector<HTMLButtonElement>(".history-date");
      const progress = item.querySelector<HTMLElement>(".history-progress");
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "history-zoom-toc-entry";
      entry.dataset.tocTarget = item.dataset.worklogId ?? "";
      if (item.dataset.worklogId === activeWorkLogId) entry.classList.add("active");
      entry.append(icon("CalendarClock", 14), document.createTextNode(toggle?.textContent?.trim() ?? ""));
      if (progress?.textContent) {
        const meter = document.createElement("span");
        meter.className = "toc-progress";
        meter.textContent = progress.textContent;
        entry.append(meter);
      }
      entry.setAttribute("aria-label", `跳转到 ${toggle?.textContent?.trim() ?? ""} 的记录`);
      els.historyZoomToc.append(entry);
    }
  }
  els.historyZoomToc.addEventListener("click", (event) => {
    const entry = (event.target as HTMLElement).closest<HTMLButtonElement>(".history-zoom-toc-entry");
    const targetId = entry?.dataset.tocTarget;
    if (!targetId) return;
    const item = els.worklogHistory.querySelector<HTMLElement>(`.worklog-history-item[data-worklog-id="${CSS.escape(targetId)}"]`);
    item?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  refreshZoomButtons();
  for (const button of zoomSections.keys()) {
    button.addEventListener("click", () => setSectionZoom(zoomedButton === button ? null : button));
  }
  document.addEventListener("keydown", (event) => {
    // TEST-V08-029：Esc 分层退出——图片放大遮罩打开时只关遮罩，下一次 Esc 再关区块放大。
    if (event.key === "Escape" && zoomedButton && !isLightboxOpen()) setSectionZoom(null);
  });

  // TEST-V08-024：修改工作记录日期。
  let moveDateRecordId: string | null = null;
  async function moveWorklogDate(record: WorkLog): Promise<void> {
    moveDateRecordId = record.id;
    els.worklogDatePrompt.textContent = `将“${formatDate(record.workDate)}${record.conflictOrigin === "imported" ? " · 导入冲突副本" : ""}”的记录移动到：`;
    els.worklogNewDate.max = toISODate();
    els.worklogNewDate.value = record.workDate;
    els.worklogDateDialog.showModal();
    els.worklogNewDate.focus();
  }
  els.worklogDateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = moveDateRecordId;
    const nextDate = els.worklogNewDate.value;
    if (!id || !nextDate || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate > toISODate()) {
      dialogs.toast("工作记录不能选择未来日期。");
      return;
    }
    try {
      // 若移动的是正在编辑的记录，先落盘再移动。
      if (id === activeWorkLogId && !(await saveWorklog())) return;
      const moved = await backend.changeWorkLogDate(id, nextDate);
      if (moved.id === activeWorkLogId) {
        activeWorkLogId = moved.id;
        activeWorkDate = moved.workDate;
        els.worklogDate.value = moved.workDate;
      }
      expandedWorklogIds.delete(id);
      expandedWorklogIds.add(moved.id);
      els.worklogDateDialog.close();
      await renderWorklogHistory();
      onActivityChanged?.();
      dialogs.toast(`记录已移动到 ${formatDate(moved.workDate)}。`);
    } catch (error) {
      dialogs.toast(error instanceof Error ? error.message : "修改记录日期失败。");
    }
  });

  els.worklogDate.addEventListener("change", () => { void changeWorkDate(els.worklogDate.value); });
  els.worklogProgress.addEventListener("input", () => scheduleSave("worklog"));
  els.descriptionRetry.addEventListener("click", () => { void saveDescription(); });
  els.worklogRetry.addEventListener("click", () => { void saveWorklog(); });
  els.newWorklog.addEventListener("click", () => { void openOrCreateTodayWorklog(); });

  // TEST-V08-027：导出 Markdown 文档为 PDF（浏览器原生打印，attachment 图片经渲染层解析为 blob URL 后正常显示）。
  function exportSubtitle(record: WorkLog): string {
    const parts = [formatDate(record.workDate)];
    if (record.progressPercent !== null) parts.push(`进度 ${record.progressPercent}%`);
    parts.push(`更新于 ${formatDateTime(record.updatedAt)}`);
    return parts.join(" · ");
  }
  async function exportWorklogAsPdf(record: WorkLog | null, flush = false): Promise<void> {
    const task = currentTask();
    if (!task || !backend.available) return;
    if (flush && !(await saveWorklog())) { dialogs.toast("每日记录保存失败，导出已取消。"); return; }
    const target = record ?? await backend.getWorkLog(task.id, activeWorkDate, activeWorkLogId ?? undefined);
    if (!target) { dialogs.toast("当前日期还没有工作记录。"); return; }
    const html = await (markdownRenderer?.render(target.contentMarkdown) ?? Promise.resolve(renderPlainMarkdown(target.contentMarkdown)));
    exportHtmlAsPdf({ title: `${task.title} ${formatDate(target.workDate)} 工作记录`, subtitle: exportSubtitle(target), bodyHtml: html });
  }
  async function exportDescriptionAsPdf(): Promise<void> {
    const task = currentTask();
    if (!task || !backend.available) return;
    if (!(await saveDescription())) { dialogs.toast("长期描述保存失败，导出已取消。"); return; }
    const markdown = descriptionEditor?.getMarkdown() ?? task.descriptionMarkdown;
    const html = await (markdownRenderer?.render(markdown) ?? Promise.resolve(renderPlainMarkdown(markdown)));
    exportHtmlAsPdf({ title: `${task.title} 长期描述`, subtitle: `更新于 ${formatDateTime(task.updatedAt)}`, bodyHtml: html });
  }
  els.exportDescriptionPdf.addEventListener("click", () => { void exportDescriptionAsPdf(); });
  els.exportWorklogPdf.addEventListener("click", () => { void exportWorklogAsPdf(null, true); });

  els.undoWorklogDelete.addEventListener("click", async () => {
    const record = deletedWorklog;
    if (!record) return;
    const wasActive = deletedWorklogWasActive;
    window.clearTimeout(worklogTimer);
    worklogDirty = false;
    await backend.restoreWorkLog(record);
    hideWorklogUndo();
    if (wasActive && record.taskId === activeTaskId && record.workDate === activeWorkDate) await changeWorkDate(activeWorkDate, true, record.id);
    else await renderWorklogHistory();
    onActivityChanged?.();
    dialogs.toast("工作记录已恢复。");
  });
  els.worklogHistory.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-worklog-action]");
    const item = button?.closest<HTMLElement>(".worklog-history-item");
    if (!button || !item || !activeTaskId) return;
    // TEST-V08-024：点击日期行展开/折叠（带高度动画），展开不同记录时平滑切换到编辑器。
    if (button.dataset.worklogAction === "toggle" && button.dataset.workDate) {
      const expanded = item.classList.toggle("expanded");
      button.setAttribute("aria-expanded", String(expanded));
      button.setAttribute("aria-label", `${expanded ? "收起" : "展开"} ${formatDate(button.dataset.workDate)}的记录`);
      if (expanded) expandedWorklogIds.add(item.dataset.worklogId ?? "");
      else expandedWorklogIds.delete(item.dataset.worklogId ?? "");
      if (expanded && button.dataset.worklogId !== activeWorkLogId) await changeWorkDate(button.dataset.workDate, false, button.dataset.worklogId);
      return;
    }
    if (button.dataset.worklogAction === "open" && button.dataset.workDate) await changeWorkDate(button.dataset.workDate, false, button.dataset.worklogId);
    if (button.dataset.worklogAction === "move-date") {
      const record = (await backend.listWorkLogs(activeTaskId)).find((entry) => entry.id === item.dataset.worklogId);
      if (record) await moveWorklogDate(record);
    }
    if (button.dataset.worklogAction === "export-pdf") {
      const record = (await backend.listWorkLogs(activeTaskId)).find((entry) => entry.id === item.dataset.worklogId);
      if (record) await exportWorklogAsPdf(record);
    }
    if (button.dataset.worklogAction === "delete") {
      const record = (await backend.listWorkLogs(activeTaskId)).find((entry) => entry.id === item.dataset.worklogId);
      if (record) await deleteWorklog(record);
    }
  });
  els.addAttachment.addEventListener("click", () => els.attachmentFile.click());
  els.importDescription.addEventListener("click", () => els.descriptionImportFile.click());
  els.importWorklog.addEventListener("click", () => els.worklogImportFile.click());
  // TEST-V08-019：文件选择器与拖拽共用同一套入库流程（20 MB 限制、逐项错误提示、刷新列表与空间）。
  async function uploadAttachments(files: File[]): Promise<number> {
    if (!activeTaskId || !files.length) return 0;
    let uploaded = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${file.name}”超过 20 MB。`);
        await backend.putAttachment(activeTaskId, file);
        uploaded += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    await renderAttachments();
    if (uploaded) dialogs.toast(`已添加 ${uploaded} 个附件。`);
    for (const message of errors.slice(0, 3)) dialogs.toast(message);
    return uploaded;
  }
  function wireAttachmentDropZone(): void {
    const panel = els.attachmentsPanel;
    let dragDepth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    panel.addEventListener("dragenter", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      panel.classList.add("drag-over");
    });
    panel.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    panel.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) panel.classList.remove("drag-over");
    });
    panel.addEventListener("drop", async (event) => {
      event.preventDefault();
      dragDepth = 0;
      panel.classList.remove("drag-over");
      if (!activeTaskId) return;
      await uploadAttachments(Array.from(event.dataTransfer?.files ?? []));
    });
  }
  wireAttachmentDropZone();
  // TEST-V08-021：文件拖到应用窗口任意位置都不再由浏览器直接打开（如 PDF 直接导航）。
  // 选中任务时落点不在附件面板/编辑器内的文件统一入库为附件；未选中时给出提示。
  function wireGlobalFileDropGuard(): void {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    window.addEventListener("dragover", (event) => {
      if (!(event instanceof DragEvent) || !hasFiles(event)) return;
      event.preventDefault();
      if (!event.dataTransfer) return;
      const target = event.target as HTMLElement | null;
      const handledElsewhere = Boolean(target?.closest?.("#attachmentsPanel") || target?.closest?.(".markdown-editor"));
      event.dataTransfer.dropEffect = handledElsewhere || activeTaskId ? "copy" : "none";
    });
    window.addEventListener("drop", (event) => {
      if (!(event instanceof DragEvent) || !hasFiles(event)) return;
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("#attachmentsPanel") || target?.closest?.(".markdown-editor")) return; // 面板与编辑器自行处理
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!activeTaskId) {
        dialogs.toast("先选中一个任务，再把文件拖进来上传为附件。");
        return;
      }
      void uploadAttachments(files);
    });
  }
  wireGlobalFileDropGuard();
  // TEST-V08-020：纯 Web 应用无法直接呼出系统资源管理器，这里由本地目录后端用系统文件选择器
  // 定位到任务目录，让用户可以直接查看该任务的本地文件。
  els.openTaskFolder.addEventListener("click", async () => {
    if (!activeTaskId) return;
    const reveal = backend.revealTaskDirectory;
    if (!reveal) {
      dialogs.toast("当前存储后端不支持打开系统文件夹。");
      return;
    }
    try {
      const opened = await reveal.call(backend, activeTaskId);
      if (!opened) dialogs.toast("无法访问任务文件夹，请先确认工作区目录权限。");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        dialogs.toast(`打开任务文件夹失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }
  });
  els.attachmentFile.addEventListener("change", async () => {
    const files = Array.from(els.attachmentFile.files ?? []); els.attachmentFile.value = "";
    await uploadAttachments(files);
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
    if (action === "edit") await editTextAttachment(id);
    if (action === "open") await openAttachment(id);
    if (action === "download") await downloadAttachment(id);
    if (action === "insert-image") await insertImage(id);
    if (action === "rename") {
      const task = currentTask(); const meta = task ? (await backend.listAttachments(task.id)).find((item) => item.id === id) : null;
      if (meta) { renameAttachmentId = id; els.attachmentRenameName.value = meta.name; els.attachmentRenameDialog.showModal(); els.attachmentRenameName.focus(); }
    }
    if (action === "delete" && await dialogs.confirm("删除附件", "删除后无法通过任务撤销恢复，继续吗？")) { await backend.deleteAttachment(id); await renderAttachments(); }
  });
  els.attachmentPreview.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-attachment-action='close-preview']")) clearAttachmentPreview();
  });
  els.attachmentRenameForm.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!renameAttachmentId) return;
    try { await backend.renameAttachment(renameAttachmentId, els.attachmentRenameName.value); els.attachmentRenameDialog.close(); renameAttachmentId = null; await renderAttachments(); }
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
      activeWorkLogId = null;
      activeWorkLogConflictOrigin = undefined;
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
      const readOnly = currentTask()?.status !== "active" || !backend.available;
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

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n?/g, "\n").trimEnd();
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

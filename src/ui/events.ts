import {
  addDays,
  coercePriority,
  getFolderAncestorIds,
  getFolderDescendantIds,
  getFolderDepth,
  isOverdue,
  normalizeMultiline,
  normalizeText,
  selectVisibleTasks,
  toISODate,
} from "../domain.js";
import { createBackupArchive, parseBackupPackage } from "../backup.js";
import { analyzeMerge, applyMergePlan, type MergeDecision, type MergePlan, type MergePlanItem } from "../merge.js";
import type { AppStore } from "../store.js";
import type { DefaultTaskDueDate, FolderScope, Priority, Task, TaskDraft, TaskFilter, ThemeMode, ViewMode, WorkspaceTab } from "../types.js";
import type { WorkspaceBackend } from "../workspace-backend.js";
import type { ImportRecoveryPoint, WorkspaceSnapshot } from "../workspace-backend.js";
import type { Dialogs } from "./dialogs.js";
import { consumeSuppressedTaskClick } from "./drag-drop.js";
import { fillFolderSelect, type InlineCreateState, type ViewState } from "./renderer.js";
import type { Elements } from "./selectors.js";
import type { WorkspaceController } from "./workspace.js";

export interface EventBindings {
  getViewState(): ViewState;
  flushWorkspace(): Promise<boolean>;
  reconcileSelection(): void;
  reconcileResolutionTimers(): void;
}

export function bindEvents(
  els: Elements,
  store: AppStore,
  dialogs: Dialogs,
  workspace: WorkspaceController,
  backend: WorkspaceBackend,
  persistState: () => Promise<boolean>,
  requestRender: () => void,
): EventBindings {
  let selectedTaskId: string | null = null;
  let detailPanelOpen = false;
  let detailDirty = false;
  let workspaceTab: WorkspaceTab = "overview";
  let inlineCreate: InlineCreateState | null = null;
  let flashTaskId: string | null = null;
  let moveTaskId: string | null = null;
  let rescheduleTaskId: string | null = null;
  let flashTimer = 0;
  let overviewTimer = 0;
  let rollbackSnapshot: WorkspaceSnapshot | null = null;
  let latestImportReport: Record<string, unknown> | null = null;
  let resetOperation: Promise<void> = Promise.resolve();
  let importGuardActive = false;
  let historyOperationActive = false;
  const resolutionTimers = new Map<string, number>();

  function requireWritable(): boolean {
    if (backend.available) return true;
    dialogs.toast(backend.errorMessage || "请先选择本地工作区目录。");
    return false;
  }

  function currentFolderForNewTask(): string {
    const scope = store.getState().preferences.folderScope;
    return scope !== "all" && scope !== "root" ? scope : "";
  }

  function readDetailDraft(task: Task): TaskDraft {
    return {
      title: normalizeText(els.detailTitle.value), notes: normalizeMultiline(els.detailNotes.value), priority: coercePriority(els.detailPriority.value),
      dueDate: els.detailDueDate.value, tag: normalizeText(els.detailTag.value), status: task.status, folderId: els.detailFolder.value || null,
    };
  }

  async function saveOverview(): Promise<boolean> {
    window.clearTimeout(overviewTimer);
    if (!detailDirty) return true;
    const task = store.getState().tasks.find((item) => item.id === selectedTaskId);
    if (!task) return true;
    const draft = readDetailDraft(task);
    if (!draft.title) { els.detailTitle.focus(); return false; }
    els.overviewSaveStatus.className = "save-status saving";
    els.overviewSaveStatus.textContent = "保存中…";
    store.dispatch({ type: "update-task", id: task.id, draft, rescheduleReason: els.detailRescheduleReason.value });
    if (!(await persistState())) {
      els.overviewSaveStatus.className = "save-status error";
      els.overviewSaveStatus.textContent = "保存失败";
      return false;
    }
    detailDirty = false;
    els.overviewSaveStatus.className = "save-status saved";
    els.overviewSaveStatus.textContent = "已保存";
    requestRender();
    return true;
  }

  async function flushWorkspace(): Promise<boolean> {
    return (await saveOverview()) && (await workspace.beforeTaskChange()) && (await persistState());
  }

  async function runHistoryOperation(operation: "undo" | "redo"): Promise<void> {
    if (historyOperationActive || !requireWritable()) return;
    historyOperationActive = true;
    els.undoAction.disabled = true;
    els.redoAction.disabled = true;
    try {
      if (!(await flushWorkspace())) return;
      if (operation === "undo") store.undo();
      else store.redo();
      els.undoAction.disabled = true;
      els.redoAction.disabled = true;
      if (await persistState()) dialogs.toast(operation === "undo" ? "撤销已保存。" : "重做已保存。");
    } finally {
      historyOperationActive = false;
      els.undoAction.disabled = !store.canUndo();
      els.redoAction.disabled = !store.canRedo();
    }
  }

  async function restoreImportRecovery(recovery: ImportRecoveryPoint): Promise<boolean> {
    if (!(await dialogs.confirm("回滚最近一次导入", "这会用导入前恢复点替换当前工作区。当前内容不会另行保留，仍要继续吗？"))) return false;
    const parsed = await parseBackupPackage(new File([recovery.backup], "latest-before-import.zip", { type: "application/zip" }));
    if (!parsed.recovered) { dialogs.toast("导入恢复点已损坏，无法回滚。请使用已下载的导入前备份。"); return false; }
    importGuardActive = true;
    try {
      await backend.importSnapshot(parsed.workspace);
      await verifyImportedWorkspace(backend, parsed.workspace);
      store.dispatch({ type: "replace-state", state: parsed.workspace.state });
      if (!(await persistState())) throw new Error("恢复后的工作区索引保存失败。");
      selectedTaskId = null; detailPanelOpen = false; detailDirty = false; inlineCreate = null;
      await workspace.activateTask(null, workspaceTab);
      const updatedRecovery: ImportRecoveryPoint = {
        ...recovery,
        report: { ...recovery.report, rolledBackAt: new Date().toISOString() },
      };
      await backend.saveImportRecovery?.(updatedRecovery);
      latestImportReport = updatedRecovery.report;
      dialogs.toast("最近一次导入已从持久化恢复点回滚。");
      return true;
    } catch (error) {
      dialogs.toast(error instanceof Error ? `回滚失败：${error.message}` : "回滚失败，请使用导入前备份恢复。");
      return false;
    } finally {
      importGuardActive = false;
    }
  }

  async function selectTask(taskId: string): Promise<void> {
    if (selectedTaskId === taskId) {
      detailPanelOpen = true;
      requestRender();
      await workspace.activateTask(taskId, workspaceTab);
      return;
    }
    if (!(await flushWorkspace())) { dialogs.toast("当前任务仍有内容未保存，请重试后再切换。"); return; }
    selectedTaskId = taskId;
    detailPanelOpen = true;
    detailDirty = false;
    requestRender();
    await workspace.activateTask(taskId, workspaceTab);
  }

  async function closeDetail(): Promise<void> {
    if (!(await flushWorkspace())) { dialogs.toast("当前任务仍有内容未保存，请重试后再关闭。"); return; }
    selectedTaskId = null;
    detailPanelOpen = false;
    detailDirty = false;
    requestRender();
    await workspace.activateTask(null, workspaceTab);
  }

  async function prepareSelectedTaskMutation(taskId: string): Promise<boolean> {
    return selectedTaskId !== taskId || await flushWorkspace();
  }

  async function deleteTask(task: Task): Promise<void> {
    if (!(await dialogs.confirm("删除任务", `确认删除“${task.title}”吗？任务的工作记录和附件会保留以支持撤销。`))) return;
    try {
      await backend.deleteTask(task.id);
      if (selectedTaskId === task.id) { selectedTaskId = null; detailPanelOpen = false; }
      store.dispatch({ type: "delete-task", id: task.id });
      await workspace.activateTask(null, workspaceTab);
    } catch (error) {
      dialogs.toast(error instanceof Error ? error.message : "任务删除失败，原任务已保留。");
    }
  }

  async function manageFolder(action: string, folderId: string): Promise<void> {
    const state = store.getState();
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder) return;
    if (action === "edit-folder" || action === "rename-folder") {
      const draft = await dialogs.editFolder(folder, state.folders);
      if (draft) store.dispatch({ type: "update-folder", id: folder.id, draft: { ...draft, parentId: folder.parentId } });
      return;
    }
    if (action === "move-folder") {
      const target = await dialogs.moveFolder(folder, state.folders);
      if (!target) return;
      store.dispatch({ type: "move-folder", id: folder.id, ...target });
      announce(`已移动文件夹“${folder.name}”。`);
      return;
    }
    if (action !== "delete-folder") return;
    const descendants = getFolderDescendantIds(state.folders, folder.id);
    const taskCount = state.tasks.filter((task) => task.folderId === folder.id || Boolean(task.folderId && descendants.has(task.folderId))).length;
    if (descendants.size > 0 || taskCount > 0) {
      const strategy = await dialogs.chooseFolderDeletion(folder, descendants.size, taskCount);
      if (strategy) store.dispatch({ type: "delete-folder", id: folder.id, strategy });
    } else if (await dialogs.confirm("删除文件夹", `确认删除空文件夹“${folder.name}”吗？`)) {
      store.dispatch({ type: "delete-folder", id: folder.id, strategy: "delete-branch" });
    }
  }

  function announce(message: string): void {
    els.liveRegion.textContent = "";
    requestAnimationFrame(() => { els.liveRegion.textContent = message; });
  }

  function setInline(kind: "task" | "folder", rawFolderId: string | undefined): void {
    const folderId = !rawFolderId || rawFolderId === "root" ? null : rawFolderId;
    store.dispatch({ type: "set-view-mode", viewMode: "tree_manual" });
    store.dispatch({ type: "set-status-filter", filter: "all" });
    if (folderId) store.dispatch({ type: "toggle-folder", id: folderId, collapsed: false });
    inlineCreate = { kind, folderId };
    requestRender();
  }

  function moveRelative(task: Task, direction: -1 | 1): void {
    const peers = store.getState().tasks
      .filter((item) => item.status === "active" && !isOverdue(item) && item.folderId === task.folderId && item.priority === task.priority)
      .sort(stableTaskOrder);
    const index = peers.findIndex((item) => item.id === task.id);
    if (index < 0) return;
    const targetIndex = Math.max(0, Math.min(peers.length - 1, index + direction));
    if (targetIndex === index) return;
    store.dispatch({ type: "move-task", id: task.id, folderId: task.folderId, priority: task.priority, targetIndex });
    announce(`已将“${task.title}”移到${direction < 0 ? "上一项" : "下一项"}。`);
  }

  async function locateTask(task: Task): Promise<void> {
    if (!(await flushWorkspace())) { dialogs.toast("当前任务仍有内容未保存，请重试后再定位。"); return; }
    const cleared = Boolean(els.searchInput.value) || store.getState().preferences.activeStatusFilter !== "all" || store.getState().preferences.viewMode !== "tree_manual";
    els.searchInput.value = "";
    store.dispatch({ type: "set-view-mode", viewMode: "tree_manual" });
    store.dispatch({ type: "set-status-filter", filter: "all" });
    store.dispatch({ type: "set-folder-scope", folderScope: "all" });
    for (const folderId of getFolderAncestorIds(store.getState().folders, task.folderId)) store.dispatch({ type: "toggle-folder", id: folderId, collapsed: false });
    selectedTaskId = task.id;
    detailPanelOpen = true;
    detailDirty = false;
    flashTaskId = task.id;
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => { flashTaskId = null; requestRender(); }, 2_000);
    requestRender();
    await workspace.activateTask(task.id, workspaceTab);
    requestAnimationFrame(() => els.taskList.querySelector<HTMLElement>(`.task-item[data-id="${CSS.escape(task.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    if (cleared) dialogs.toast("已清除搜索或筛选，并在任务树中定位。")
    announce(`已在任务树中定位“${task.title}”。`);
  }

  function openMoveDialog(task: Task): void {
    moveTaskId = task.id;
    fillFolderSelect(els.moveFolder, store.getState().folders, task.folderId ?? "", "未分类");
    els.movePriority.value = task.priority;
    const restricted = isOverdue(task);
    els.moveFolder.disabled = restricted;
    els.movePriority.disabled = restricted;
    els.movePrevious.disabled = restricted;
    els.moveNext.disabled = restricted;
    els.moveSubmit.disabled = restricted;
    els.moveSubmit.hidden = restricted;
    els.moveRestriction.hidden = !restricted;
    els.moveDialog.showModal();
  }

  function openRescheduleDialog(task: Task): void {
    rescheduleTaskId = task.id;
    const tomorrow = addDays(toISODate(), 1);
    els.rescheduleDate.min = tomorrow;
    els.rescheduleDate.value = tomorrow;
    els.rescheduleReason.value = "";
    els.rescheduleDialog.showModal();
  }

  els.globalNewTask.addEventListener("click", () => {
    if (!requireWritable()) return;
    const folderId = currentFolderForNewTask();
    els.sidebar.classList.remove("is-open");
    setInline("task", folderId || "root");
  });
  els.searchInput.addEventListener("input", requestRender);

  els.statusFilters.forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "set-status-filter", filter: (button.dataset.filter || "all") as TaskFilter })));
  els.viewModes.forEach((button) => button.addEventListener("click", () => store.dispatch({ type: "set-view-mode", viewMode: (button.dataset.view || "tree_manual") as ViewMode })));
  els.themeSelect.addEventListener("change", () => store.dispatch({ type: "set-theme", theme: els.themeSelect.value as ThemeMode }));
  const saveDefaults = () => {
    store.dispatch({ type: "set-default-task-values", dueDate: els.defaultDueDate.value as DefaultTaskDueDate, priority: els.defaultPriority.value as Priority });
  };
  els.defaultDueDate.addEventListener("change", saveDefaults);
  els.defaultPriority.addEventListener("change", saveDefaults);

  els.taskList.addEventListener("submit", (event) => {
    if (!backend.available) { event.preventDefault(); requireWritable(); return; }
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("form.inline-create");
    if (!form) return;
    event.preventDefault();
    const title = normalizeText(new FormData(form).get("title"));
    if (!title) return;
    const folderId = form.dataset.folderId === "root" ? null : form.dataset.folderId ?? null;
    if (form.dataset.inlineKind === "folder") {
      store.dispatch({ type: "add-folder", draft: { name: title, parentId: folderId } });
      announce(`已新建文件夹“${title}”。`);
    } else {
      const data = new FormData(form);
      store.dispatch({ type: "add-task", draft: {
        title, notes: "", priority: coercePriority(data.get("priority")), dueDate: String(data.get("dueDate") ?? ""),
        tag: "", status: "active", folderId,
      } });
      announce(`已新建任务“${title}”。`);
    }
    inlineCreate = null;
    requestRender();
  });

  els.taskList.addEventListener("keydown", async (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("form.inline-create") && event.key === "Escape") {
      event.preventDefault(); inlineCreate = null; requestRender(); return;
    }
    const divider = target.closest<HTMLElement>(".priority-divider");
    if (divider && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (!requireWritable()) return;
      event.preventDefault();
      const folderId = divider.dataset.dividerFolderId === "root" ? null : divider.dataset.dividerFolderId ?? null;
      const candidates = store.getState().tasks.filter((task) => task.status === "active" && task.folderId === folderId && !isOverdue(task)).sort(stableTaskOrder);
      const highCount = candidates.filter((task) => task.priority === "high").length + (event.key === "ArrowDown" ? 1 : -1);
      store.dispatch({ type: "move-priority-divider", folderId, highCount });
      announce("已调整高、低优先级分界。");
      return;
    }
    if (target.closest("button, input, select, summary")) return;
    const row = target.closest<HTMLElement>(".task-item");
    if (!row?.dataset.id) return;
    const task = store.getState().tasks.find((item) => item.id === row.dataset.id);
    if (!task) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault(); moveRelative(task, event.key === "ArrowUp" ? -1 : 1); return;
    }
    if (event.altKey && (event.key === "1" || event.key === "2")) {
      event.preventDefault(); store.dispatch({ type: "set-task-priority", id: task.id, priority: event.key === "1" ? "high" : "low" }); return;
    }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); await selectTask(task.id); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(els.taskList.querySelectorAll<HTMLElement>(".task-item"));
    const index = rows.indexOf(row);
    const next = rows[event.key === "ArrowDown" ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1)];
    if (next?.dataset.id) { await selectTask(next.dataset.id); next.focus(); }
  });

  els.taskList.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    // TEST-V08-011：点击文件夹头部的按钮以外区域（标题、图标、计数、留白）切换展开/折叠。
    const heading = target.closest<HTMLElement>(".tree-group-heading[data-toggle-folder-id]");
    if (heading && !target.closest("button, summary, input, select, a")) {
      store.dispatch({ type: "toggle-folder", id: heading.dataset.toggleFolderId ?? "" });
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    const action = button?.dataset.action;
    if (action === "toggle-folder" && button?.dataset.folderId) { store.dispatch({ type: "toggle-folder", id: button.dataset.folderId }); return; }
    if (action === "start-inline-task" || action === "start-inline-folder") { if (requireWritable()) setInline(action === "start-inline-task" ? "task" : "folder", button?.dataset.folderId); return; }
    if (action === "cancel-inline") { inlineCreate = null; requestRender(); return; }
    if (action === "save-inline") return;
    if (action === "toggle-handled" && button?.dataset.containerId) { store.dispatch({ type: "toggle-handled-section", containerId: button.dataset.containerId }); return; }
    if (action === "suggest-order") {
      if (!requireWritable()) return;
      const folderId = button?.dataset.folderId === "root" ? null : button?.dataset.folderId ?? null;
      if (await dialogs.confirm("按截止日期整理", "将保持高、低优先级分区，并在各分区内按截止日期重新排列。继续吗？")) store.dispatch({ type: "apply-suggested-order", folderId });
      return;
    }
    if ((action === "rename-folder" || action === "move-folder" || action === "delete-folder") && button?.dataset.folderId) {
      await manageFolder(action, button.dataset.folderId);
      return;
    }
    const row = target.closest<HTMLElement>(".task-item");
    if (!row?.dataset.id) return;
    const task = store.getState().tasks.find((item) => item.id === row.dataset.id);
    if (!task) return;
    if (consumeSuppressedTaskClick(task.id)) return;
    const interactive = target.closest("button, input, select, textarea, summary, a, [contenteditable='true']");
    if (!interactive) { await selectTask(task.id); return; }
    if (!button) return;
    if (action === "drag-task") return;
    if (!(await prepareSelectedTaskMutation(task.id))) return;
    if (action === "delete") {
      await deleteTask(task);
    }
    if (action === "complete" || action === "discard") {
      const targetStatus = action === "complete" ? "completed" : "discarded";
      store.dispatch({ type: "start-task-resolution", id: task.id, targetStatus });
      announce(`“${task.title}”已${targetStatus === "completed" ? "完成" : "标记为不再需要"}，8 秒内可以撤销。`);
    }
    if (action === "cancel-resolution") { store.dispatch({ type: "cancel-task-resolution", id: task.id }); announce(`已撤销对“${task.title}”的处理。`); }
    if (action === "restore") { store.dispatch({ type: "restore-task", id: task.id }); announce(`已将“${task.title}”恢复为待办。`); }
    if (action === "move-menu") openMoveDialog(task);
    if (action === "reschedule") openRescheduleDialog(task);
    if (action === "locate-task") await locateTask(task);
  });

  els.detailForm.addEventListener("input", () => {
    detailDirty = true;
    els.overviewSaveStatus.className = "save-status dirty";
    els.overviewSaveStatus.textContent = "未保存";
    window.clearTimeout(overviewTimer);
    overviewTimer = window.setTimeout(() => { void saveOverview(); }, 700);
  });
  els.detailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (await saveOverview()) dialogs.toast("任务概览已保存。");
  });
  els.cancelDetail.addEventListener("click", () => { detailDirty = false; requestRender(); });
  els.detailClose.addEventListener("click", closeDetail);
  els.workspaceTabs.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-workspace-tab]");
    if (!button) return;
    const nextTab = (button.dataset.workspaceTab ?? "overview") as WorkspaceTab;
    if (nextTab === workspaceTab) return;
    if (!(await workspace.beforeTaskChange())) {
      dialogs.toast("当前工作区仍有内容未保存，标签切换已取消。");
      return;
    }
    workspaceTab = nextTab;
    requestRender();
    await workspace.setTab(workspaceTab);
  });
  els.workspaceTabs.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tabs = Array.from(els.workspaceTabButtons);
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]?.click();
  });

  els.newFolder.addEventListener("click", async () => {
    if (!requireWritable()) return;
    const draft = await dialogs.editFolder(null, store.getState().folders, null);
    if (draft) store.dispatch({ type: "add-folder", draft });
  });

  els.folderTree.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    const action = button?.dataset.action;
    const folderId = button?.dataset.folderId;
    if (!action) return;
    if (action === "select-folder" && folderId) {
      store.dispatch({ type: "set-folder-scope", folderScope: folderId as FolderScope });
      els.sidebar.classList.remove("is-open");
      return;
    }
    if (action === "start-inline-task" || action === "start-inline-folder") {
      if (!requireWritable()) return;
      if (folderId && folderId !== "root") store.dispatch({ type: "set-folder-scope", folderScope: folderId });
      else store.dispatch({ type: "set-folder-scope", folderScope: "root" });
      els.sidebar.classList.remove("is-open");
      setInline(action === "start-inline-task" ? "task" : "folder", folderId);
      return;
    }
    if (!folderId) return;
    if (action === "toggle-navigation-folder") { store.dispatch({ type: "toggle-navigation-folder", id: folderId }); return; }
    await manageFolder(action, folderId);
  });

  els.moveDialogForm.addEventListener("submit", (event) => {
    if (!backend.available) { event.preventDefault(); requireWritable(); return; }
    event.preventDefault();
    const task = store.getState().tasks.find((item) => item.id === moveTaskId);
    if (!task || isOverdue(task)) return;
    const folderId = els.moveFolder.value || null;
    const priority = coercePriority(els.movePriority.value);
    const end = store.getState().tasks.filter((item) => item.id !== task.id && item.status === "active" && !isOverdue(item) && item.folderId === folderId && item.priority === priority).length;
    store.dispatch({ type: "move-task", id: task.id, folderId, priority, targetIndex: end });
    els.moveDialog.close();
    announce(`已移动“${task.title}”。`);
  });
  els.movePrevious.addEventListener("click", () => { const task = store.getState().tasks.find((item) => item.id === moveTaskId); if (task) moveRelative(task, -1); els.moveDialog.close(); });
  els.moveNext.addEventListener("click", () => { const task = store.getState().tasks.find((item) => item.id === moveTaskId); if (task) moveRelative(task, 1); els.moveDialog.close(); });
  els.moveDelete.addEventListener("click", async () => {
    const task = store.getState().tasks.find((item) => item.id === moveTaskId);
    if (!task) return;
    els.moveDialog.close();
    await deleteTask(task);
  });
  els.moveDialog.addEventListener("close", () => { moveTaskId = null; });

  els.rescheduleForm.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-reschedule-days]");
    if (!button) return;
    els.rescheduleDate.value = addDays(toISODate(), Number(button.dataset.rescheduleDays));
  });
  els.rescheduleForm.addEventListener("submit", (event) => {
    if (!backend.available) { event.preventDefault(); requireWritable(); return; }
    event.preventDefault();
    const task = store.getState().tasks.find((item) => item.id === rescheduleTaskId);
    if (!task) return;
    store.dispatch({ type: "reschedule-task", id: task.id, dueDate: els.rescheduleDate.value, reason: els.rescheduleReason.value, source: "quick" });
    els.rescheduleDialog.close();
    announce(`已将“${task.title}”改期至 ${els.rescheduleDate.value}。`);
  });
  els.rescheduleDialog.addEventListener("close", () => { rescheduleTaskId = null; });

  els.navToggle.addEventListener("click", () => els.sidebar.classList.add("is-open"));
  els.sidebarClose.addEventListener("click", () => els.sidebar.classList.remove("is-open"));
  window.addEventListener("resize", requestRender);
  els.undoAction.addEventListener("click", () => { void runHistoryOperation("undo"); });
  els.redoAction.addEventListener("click", () => { void runHistoryOperation("redo"); });
  els.detailResizer.addEventListener("pointerdown", (event) => {
    if (window.innerWidth < 1180) return;
    event.preventDefault();
    els.detailResizer.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const sidebarWidth = els.sidebar.getBoundingClientRect().width || 220;
      const maximum = Math.max(560, Math.min(680, window.innerWidth - sidebarWidth - 420));
      const width = Math.max(560, Math.min(maximum, window.innerWidth - moveEvent.clientX));
      document.documentElement.style.setProperty("--workspace-width", `${width}px`);
    };
    const end = (endEvent: PointerEvent) => {
      els.detailResizer.releasePointerCapture(endEvent.pointerId);
      els.detailResizer.removeEventListener("pointermove", move);
      els.detailResizer.removeEventListener("pointerup", end);
      const width = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--workspace-width"), 10);
      store.dispatch({ type: "set-workspace-width", width });
    };
    els.detailResizer.addEventListener("pointermove", move);
    els.detailResizer.addEventListener("pointerup", end);
  });
  els.detailResizer.addEventListener("keydown", (event) => {
    if (window.innerWidth < 1180) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    store.dispatch({ type: "set-workspace-width", width: store.getState().preferences.workspaceWidth + delta });
  });
  els.exportData.addEventListener("click", async () => {
    if (!(await flushWorkspace())) { dialogs.toast("仍有内容未保存，备份已取消。"); return; }
    if (!backend.available) { dialogs.toast("工作记录存储不可用，无法生成完整备份。"); return; }
    const archive = await createBackupArchive(store.getState(), backend);
    downloadBlob(archive, `task-workbench-${toISODate()}.zip`);
  });
  els.importHistory.addEventListener("click", async () => {
    if (!backend.loadImportRecovery) { dialogs.toast("当前工作区不支持持久化导入记录。"); return; }
    const recovery = await backend.loadImportRecovery();
    if (!recovery) { dialogs.toast("还没有可查看的导入记录。"); return; }
    latestImportReport = recovery.report;
    const ids = Array.isArray(recovery.report.affectedTaskIds)
      ? new Set(recovery.report.affectedTaskIds.filter((value): value is string => typeof value === "string"))
      : new Set<string>();
    showImportResult(els, recovery.report, () => restoreImportRecovery(recovery), async () => {
      const task = store.getState().tasks.find((item) => ids.has(item.id));
      if (task) await locateTask(task);
      else dialogs.toast("这次导入没有仍存在的受影响任务可定位。");
    }, true);
  });
  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async () => {
    if (!requireWritable()) return;
    const file = els.importFile.files?.[0]; els.importFile.value = ""; if (!file) return;
    await resetOperation;
    if (!(await flushWorkspace())) { dialogs.toast("仍有内容未保存，导入已取消。"); return; }
    const result = await parseBackupPackage(file);
    if (!result.recovered) { dialogs.toast(result.message); return; }
    const current = await backend.exportSnapshot();
    const plan = analyzeMerge(current, result.workspace);
    importGuardActive = true;
    const selection = await openImportCenter(els, plan, file.name, result.sourceVersion);
    if (!selection) { importGuardActive = false; return; }
    let nextWorkspace: WorkspaceSnapshot;
    let report: Record<string, unknown>;
    if (selection.mode === "restore") {
      if (!(await dialogs.confirm("全量恢复备份", "这会用备份完整替换当前任务、工作记录和附件。系统会先下载当前工作区的自动备份，仍要继续吗？"))) {
        importGuardActive = false;
        return;
      }
      nextWorkspace = result.workspace;
      report = { mode: "full-restore", source: file.name, sourceVersion: result.sourceVersion };
    } else {
      const applied = applyMergePlan(plan, selection.decisions);
      nextWorkspace = applied.workspace;
      report = { mode: "merge", source: file.name, sourceVersion: result.sourceVersion, summary: plan.summary, applied: applied.applied, skipped: applied.skipped, conflictsKept: applied.conflictsKept, decisions: selection.decisions };
      if (applied.applied === 0) { importGuardActive = false; dialogs.toast("没有需要应用的新变化，当前工作区未修改。"); return; }
    }
    const changedTaskIds = affectedTaskIds(plan, selection);
    const recoveryCreatedAt = new Date().toISOString();
    report = { ...report, createdAt: recoveryCreatedAt, affectedTaskIds: [...changedTaskIds] };
    let safetyBackup: Blob | null = null;
    const progress = showImportProgress(els);
    try {
      progress.setStage("backup", "正在创建并下载合并前备份；此阶段可以安全取消。");
      safetyBackup = await createBackupArchive(store.getState(), backend);
      downloadBlob(safetyBackup, `task-workbench-before-import-${toISODate()}.zip`);
      if (progress.cancelled()) {
        progress.close(); importGuardActive = false; dialogs.toast("导入已取消，当前工作区未修改。"); return;
      }
      await backend.saveImportRecovery?.({ createdAt: recoveryCreatedAt, backup: safetyBackup, report: { ...report, status: "prepared" } });
      rollbackSnapshot = current;
      progress.lock();
      progress.setStage("write", "正在写入临时内容并发布工作区索引，请勿关闭页面。");
      await backend.importSnapshot(nextWorkspace);
      progress.setStage("publish", "工作区索引已发布，正在重新读取全部内容。");
      progress.setStage("verify", "正在校验任务、文件夹、工作记录、附件和版本元数据。");
      await verifyImportedWorkspace(backend, nextWorkspace);
      latestImportReport = { ...report, status: "completed", completedAt: new Date().toISOString(), verified: true };
      await backend.saveImportRecovery?.({ createdAt: recoveryCreatedAt, backup: safetyBackup, report: latestImportReport });
    } catch (error) {
      progress.close();
      if (rollbackSnapshot) {
        try { await backend.importSnapshot(rollbackSnapshot); }
        catch { importGuardActive = false; dialogs.toast("导入校验失败，自动回滚也未完成；请使用刚下载的导入前备份恢复。"); return; }
      }
      rollbackSnapshot = null;
      importGuardActive = false;
      dialogs.toast(error instanceof Error ? `导入失败，已自动回滚：${error.message}` : "导入失败，原有数据已恢复。");
      return;
    }
    progress.setStage("done", "导入与完整性校验已完成。");
    progress.close();
    selectedTaskId = null; detailPanelOpen = false; detailDirty = false; inlineCreate = null;
    store.dispatch({ type: "replace-state", state: nextWorkspace.state });
    if (!(await persistState())) {
      try { if (rollbackSnapshot) await backend.importSnapshot(rollbackSnapshot); }
      catch { importGuardActive = false; dialogs.toast("合并后的状态保存失败，自动回滚未完成；请使用刚下载的导入前备份恢复。"); return; }
      if (rollbackSnapshot) store.dispatch({ type: "replace-state", state: rollbackSnapshot.state });
      rollbackSnapshot = null;
      importGuardActive = false;
      dialogs.toast("合并后的状态保存失败，已恢复导入前数据。");
      return;
    }
    await workspace.activateTask(null, workspaceTab);
    importGuardActive = false;
    latestImportReport ??= { ...report, status: "completed", completedAt: new Date().toISOString(), verified: true };
    showImportResult(els, latestImportReport, async () => {
      if (!rollbackSnapshot) return false;
      await backend.importSnapshot(rollbackSnapshot);
      store.dispatch({ type: "replace-state", state: rollbackSnapshot.state });
      if (!(await persistState())) return false;
      selectedTaskId = null; detailPanelOpen = false; detailDirty = false; inlineCreate = null;
      await workspace.activateTask(null, workspaceTab);
      latestImportReport = { ...latestImportReport, rolledBackAt: new Date().toISOString() };
      if (safetyBackup) await backend.saveImportRecovery?.({ createdAt: recoveryCreatedAt, backup: safetyBackup, report: latestImportReport });
      rollbackSnapshot = null;
      dialogs.toast("本次导入已回滚。");
      return true;
    }, async () => {
      const task = store.getState().tasks.find((item) => changedTaskIds.has(item.id));
      if (task) await locateTask(task);
    });
    dialogs.toast(selection.mode === "restore" ? "全量恢复已完成并通过校验。" : "备份合并已完成并通过校验。");
  });
  els.resetDemo.addEventListener("click", async () => {
    if (!requireWritable()) return;
    if (!(await dialogs.confirm("重置为示例数据", "这会用示例任务和文件夹替换当前浏览器中的全部数据，继续吗？"))) return;
    resetOperation = (async () => {
      try { await backend.clear(); }
      catch { dialogs.toast("工作记录存储无法清理，重置已取消。"); return; }
      selectedTaskId = null; detailPanelOpen = false; detailDirty = false; inlineCreate = null; els.searchInput.value = "";
      store.dispatch({ type: "reset" });
      if (!(await persistState())) { dialogs.toast("示例数据保存失败，请重试。"); return; }
      await workspace.activateTask(null, workspaceTab);
      dialogs.toast("已重置为示例数据。");
    })();
    await resetOperation;
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") store.dispatch({ type: "finalize-expired-resolutions" }); });
  window.addEventListener("beforeunload", (event) => {
    if (!importGuardActive) return;
    event.preventDefault();
    event.returnValue = "";
  });

  return {
    getViewState: () => ({ query: els.searchInput.value, selectedTaskId, detailPanelOpen, detailDirty, workspaceTab, inlineCreate, flashTaskId }),
    flushWorkspace,
    reconcileSelection() {
      if (!selectedTaskId) return;
      const visibleIds = new Set(selectVisibleTasks(store.getState(), els.searchInput.value).map((task) => task.id));
      if (!visibleIds.has(selectedTaskId)) { selectedTaskId = null; detailPanelOpen = false; detailDirty = false; void workspace.activateTask(null, workspaceTab); }
    },
    reconcileResolutionTimers() {
      store.dispatch({ type: "finalize-expired-resolutions" });
      const pending = new Map(store.getState().tasks.filter((task) => task.pendingResolution).map((task) => [task.id, task.pendingResolution?.executeAt ?? 0]));
      for (const [id, timer] of resolutionTimers) if (!pending.has(id)) { window.clearTimeout(timer); resolutionTimers.delete(id); }
      for (const [id, executeAt] of pending) {
        if (resolutionTimers.has(id)) continue;
        const timer = window.setTimeout(() => { resolutionTimers.delete(id); store.dispatch({ type: "finalize-task-resolution", id, now: executeAt }); }, Math.max(0, executeAt - Date.now()));
        resolutionTimers.set(id, timer);
      }
    },
  };
}

function stableTaskOrder(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

type ImportCenterResult = { mode: "merge"; decisions: Record<string, MergeDecision> } | { mode: "restore" };

function openImportCenter(els: Elements, plan: MergePlan, sourceName: string, sourceVersion: "legacy-json" | 5 | 6): Promise<ImportCenterResult | null> {
  const statusLabels: Record<string, string> = {
    "new": "新增",
    "safe-update": "安全更新",
    "unchanged": "无变化",
    "suspected-duplicate": "疑似重复",
    "conflict": "冲突",
    "deletion": "删除记录",
  };
  const typeLabels: Record<string, string> = { task: "任务", folder: "文件夹", worklog: "工作记录", attachment: "附件" };
  const decisionLabels: Record<MergeDecision, string> = { "keep-current": "保留当前", "use-imported": "采用导入项", "keep-both": "两者都保留", "skip": "跳过" };
  els.importSourceName.textContent = sourceName;
  const metadata = plan.incoming.metadata;
  const sourceParts = [sourceVersion === 6 ? "v6 完整备份" : sourceVersion === 5 ? "v5 兼容备份" : "旧版 JSON 备份"];
  if (metadata?.exportedAt) sourceParts.push(`导出于 ${formatImportDate(metadata.exportedAt)}`);
  if (metadata?.workspaceId) sourceParts.push(`来源 ${compactIdentifier(metadata.workspaceId)}`);
  els.importSourceMeta.textContent = sourceParts.join(" · ");
  els.importCompatibilityNote.textContent = plan.compatibilityNotes.join(" ");
  els.importCompatibilityNote.hidden = plan.compatibilityNotes.length === 0;

  const needsAttention = (item: MergePlanItem) => ["suspected-duplicate", "conflict", "deletion"].includes(item.status);
  const statuses = ["attention", "all", "new", "safe-update", "unchanged", "suspected-duplicate", "conflict", "deletion"];
  els.importFilters.replaceChildren(...statuses.map((status, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = `segment${index === 0 ? " active" : ""}`; button.dataset.mergeFilter = status;
    const count = status === "all" ? plan.items.length : status === "attention" ? plan.items.filter(needsAttention).length : plan.items.filter((item) => item.status === status).length;
    button.textContent = `${status === "all" ? "全部" : status === "attention" ? "待处理" : statusLabels[status]} ${count}`;
    return button;
  }));
  const itemElements = plan.items.map((item) => {
    const row = document.createElement("div"); row.className = "import-item"; row.dataset.mergeStatus = item.status; row.dataset.mergeType = item.entityType;
    const status = document.createElement("span"); status.className = `merge-status ${item.status}`; status.textContent = statusLabels[item.status] ?? item.status;
    const label = document.createElement("div"); label.className = "import-item-label";
    const name = document.createElement("strong"); name.textContent = item.label;
    const kind = document.createElement("span"); kind.textContent = `${typeLabels[item.entityType]} · ${item.entityId}`;
    label.append(name, kind);
    const reason = document.createElement("div"); reason.className = "import-reason";
    const explanation = document.createElement("span"); explanation.textContent = item.reason; reason.append(explanation);
    const difference = mergeDifference(plan, item);
    if (difference) {
      const details = document.createElement("details"); details.className = "import-diff";
      const summary = document.createElement("summary"); summary.textContent = difference.fields.length ? `查看差异：${difference.fields.join("、")}` : "查看当前与导入内容";
      const current = document.createElement("p"); current.textContent = `当前：${difference.current}`;
      const imported = document.createElement("p"); imported.textContent = `导入：${difference.incoming}`;
      details.append(summary, current, imported); reason.append(details);
    }
    const select = document.createElement("select"); select.className = "import-decision"; select.dataset.mergeKey = item.key; select.setAttribute("aria-label", `${item.label}的处理方式`);
    for (const decision of item.allowedDecisions) select.add(new Option(decisionLabels[decision], decision));
    select.value = item.defaultDecision; select.disabled = item.allowedDecisions.length === 1;
    row.append(status, label, reason, select);
    return row;
  });
  els.importItemList.replaceChildren(...itemElements);

  const decisions = new Map(plan.items.map((item) => [item.key, item.defaultDecision]));
  const renderImpact = () => {
    const impact = { added: 0, updated: 0, copies: 0, deleted: 0, skipped: 0, unchanged: 0 };
    for (const item of plan.items) {
      const decision = decisions.get(item.key) ?? item.defaultDecision;
      if (item.status === "unchanged") impact.unchanged += 1;
      else if (decision === "keep-both") impact.copies += 1;
      else if (decision === "use-imported" && item.status === "deletion") impact.deleted += 1;
      else if (decision === "use-imported" && (item.status === "new" || item.status === "suspected-duplicate")) impact.added += 1;
      else if (decision === "use-imported") impact.updated += 1;
      else impact.skipped += 1;
    }
    const entries = [["将新增", impact.added], ["将更新", impact.updated], ["保留副本", impact.copies], ["将删除", impact.deleted], ["跳过", impact.skipped], ["无变化", impact.unchanged]] as const;
    els.importSummary.replaceChildren(...entries.map(([label, value]) => {
      const stat = document.createElement("div"); stat.className = "import-stat";
      const amount = document.createElement("strong"); amount.textContent = String(value);
      const caption = document.createElement("span"); caption.textContent = label;
      stat.append(amount, caption); return stat;
    }));
  };

  const batchGroups = new Map<string, MergePlanItem[]>();
  for (const item of plan.items.filter((entry) => entry.allowedDecisions.length > 1)) {
    const key = `${item.entityType}:${item.status}`;
    batchGroups.set(key, [...batchGroups.get(key) ?? [], item]);
  }
  els.importBatchGroup.replaceChildren(...[...batchGroups].map(([key, items]) => new Option(`${typeLabels[items[0]!.entityType]} · ${statusLabels[items[0]!.status]}（${items.length} 项）`, key)));
  const syncBatchDecisions = () => {
    const items = batchGroups.get(els.importBatchGroup.value) ?? [];
    const allowed = items[0]?.allowedDecisions ?? [];
    els.importBatchDecision.replaceChildren(...allowed.map((decision) => new Option(decisionLabels[decision], decision)));
    els.importBatchApply.disabled = items.length === 0;
    els.importBatchActions.hidden = batchGroups.size === 0;
  };
  syncBatchDecisions();
  renderImpact();

  const applyFilter = (filter: string) => {
    let visible = 0;
    for (const [index, row] of itemElements.entries()) {
      const item = plan.items[index]!;
      row.hidden = filter !== "all" && (filter === "attention" ? !needsAttention(item) : row.dataset.mergeStatus !== filter);
      if (!row.hidden) visible += 1;
    }
    els.importVisibleCount.textContent = `显示 ${visible} / ${itemElements.length} 项`;
    if (visible === 0) {
      const empty = document.createElement("p"); empty.className = "import-empty"; empty.dataset.importEmpty = "true"; empty.textContent = "当前筛选下没有项目。";
      els.importItemList.append(empty);
    } else els.importItemList.querySelector("[data-import-empty]")?.remove();
  };
  applyFilter("attention");

  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (value: ImportCenterResult | null) => {
      if (settled) return;
      settled = true; controller.abort();
      if (els.importCenterDialog.open) els.importCenterDialog.close();
      resolve(value);
    };
    els.importFilters.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-merge-filter]");
      if (!button) return;
      els.importFilters.querySelectorAll(".segment").forEach((entry) => entry.classList.toggle("active", entry === button));
      applyFilter(button.dataset.mergeFilter ?? "all");
    }, { signal: controller.signal });
    els.importItemList.addEventListener("change", (event) => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>("[data-merge-key]");
      if (!select?.dataset.mergeKey) return;
      decisions.set(select.dataset.mergeKey, select.value as MergeDecision);
      renderImpact();
    }, { signal: controller.signal });
    els.importBatchGroup.addEventListener("change", syncBatchDecisions, { signal: controller.signal });
    els.importBatchApply.addEventListener("click", () => {
      const items = batchGroups.get(els.importBatchGroup.value) ?? [];
      const decision = els.importBatchDecision.value as MergeDecision;
      for (const item of items) {
        if (!item.allowedDecisions.includes(decision)) continue;
        decisions.set(item.key, decision);
        const select = els.importItemList.querySelector<HTMLSelectElement>(`[data-merge-key="${CSS.escape(item.key)}"]`);
        if (select) select.value = decision;
      }
      renderImpact();
      els.liveRegion.textContent = `已将“${decisionLabels[decision]}”应用到 ${items.length} 个同类项目。`;
    }, { signal: controller.signal });
    els.importCenterClose.addEventListener("click", () => finish(null), { signal: controller.signal });
    els.importCenterCancel.addEventListener("click", () => finish(null), { signal: controller.signal });
    els.importReplaceRestore.addEventListener("click", () => finish({ mode: "restore" }), { signal: controller.signal });
    els.importApplyMerge.addEventListener("click", () => {
      finish({ mode: "merge", decisions: Object.fromEntries(decisions) });
    }, { signal: controller.signal });
    els.importCenterDialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); }, { signal: controller.signal });
    els.importCenterDialog.showModal();
  });
}

function mergeDifference(plan: MergePlan, item: MergePlanItem): { current: string; incoming: string; fields: string[] } | null {
  if (item.status === "unchanged" || item.status === "new") return null;
  const current = mergeEntity(plan.current, item.entityType, item.matchedCurrentId ?? item.entityId);
  const incoming = item.tombstone ? null : mergeEntity(plan.incoming, item.entityType, item.entityId);
  const fieldLabels: Record<string, string> = {
    title: "名称", name: "名称", notes: "说明", descriptionMarkdown: "长期描述", priority: "优先级", dueDate: "截止日期",
    tag: "标签", status: "状态", folderId: "文件夹", parentId: "上级文件夹", order: "顺序", rescheduleHistory: "改期历史",
    statusHistory: "状态历史", contentMarkdown: "记录内容", progressPercent: "进度", taskId: "所属任务", type: "类型", size: "大小", contentHash: "内容哈希",
  };
  const currentRecord = current && typeof current === "object" ? current as Record<string, unknown> : {};
  const incomingRecord = incoming && typeof incoming === "object" ? incoming as Record<string, unknown> : {};
  const ignored = new Set(["id", "createdAt", "updatedAt", "lastModified"]);
  const fields = [...new Set([...Object.keys(currentRecord), ...Object.keys(incomingRecord)])]
    .filter((key) => !ignored.has(key) && stableValue(currentRecord[key]) !== stableValue(incomingRecord[key]))
    .map((key) => fieldLabels[key] ?? key);
  return { current: summarizeMergeEntity(item.entityType, current), incoming: item.tombstone ? "删除此项目" : summarizeMergeEntity(item.entityType, incoming), fields };
}

function mergeEntity(snapshot: WorkspaceSnapshot, entityType: MergePlanItem["entityType"], id: string): unknown {
  if (entityType === "task") return snapshot.state.tasks.find((item) => item.id === id);
  if (entityType === "folder") return snapshot.state.folders.find((item) => item.id === id);
  if (entityType === "worklog") return snapshot.workLogs.find((item) => item.id === id);
  return snapshot.attachments.find((item) => item.id === id);
}

function summarizeMergeEntity(entityType: MergePlanItem["entityType"], value: unknown): string {
  if (!value || typeof value !== "object") return "不存在";
  const item = value as Record<string, unknown>;
  if (entityType === "task") return `“${item.title ?? "未命名"}”，${item.priority === "high" ? "高" : "低"}优先级，状态 ${String(item.status ?? "-")}，截止 ${String(item.dueDate || "未设置")}，改期 ${Array.isArray(item.rescheduleHistory) ? item.rescheduleHistory.length : 0} 条，状态事件 ${Array.isArray(item.statusHistory) ? item.statusHistory.length : 0} 条`;
  if (entityType === "folder") return `“${item.name ?? "未命名"}”，上级 ${String(item.parentId ?? "根目录")}`;
  if (entityType === "worklog") return `${String(item.workDate ?? "-")}，进度 ${item.progressPercent ?? "未设置"}，内容“${compactText(String(item.contentMarkdown ?? ""), 80)}”`;
  return `“${item.name ?? "未命名"}”，${formatImportBytes(Number(item.size) || 0)}，哈希 ${compactIdentifier(String(item.contentHash ?? "无"))}`;
}

function compactText(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized || "空";
}

function compactIdentifier(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatImportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatImportBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    // 与 JSON 序列化语义保持一致：值为 undefined 的键不参与比较，
    // 避免“键存在但值为 undefined”与“键不存在”被误判为不同内容。
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
    return `{${entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function showImportProgress(els: Elements): { cancelled(): boolean; setStage(stage: string, message: string): void; lock(): void; close(): void } {
  const stages = [
    ["parse", "解析并校验备份"], ["analyze", "分析身份、修订与冲突"], ["backup", "创建合并前备份"],
    ["write", "写入临时内容"], ["publish", "发布工作区索引"], ["verify", "重新读取并校验"], ["done", "完成"],
  ] as const;
  const rows = stages.map(([key, label]) => {
    const row = document.createElement("li"); row.dataset.importStage = key; row.textContent = label; return row;
  });
  els.importProgressStages.replaceChildren(...rows);
  let wasCancelled = false;
  let locked = false;
  const cancel = () => {
    if (locked) return;
    wasCancelled = true;
    els.importProgressCancel.disabled = true;
    els.importProgressText.textContent = "正在完成当前安全步骤，随后取消。";
  };
  els.importProgressCancel.disabled = false;
  els.importProgressCancel.onclick = cancel;
  const setStage = (stage: string, message: string) => {
    const currentIndex = stages.findIndex(([key]) => key === stage);
    rows.forEach((row, index) => {
      row.classList.toggle("done", index < currentIndex || stage === "done");
      row.classList.toggle("active", index === currentIndex && stage !== "done");
    });
    els.importProgressText.textContent = message;
  };
  setStage("backup", "正在准备合并前备份。");
  els.importProgressDialog.showModal();
  return {
    cancelled: () => wasCancelled,
    setStage,
    lock() { locked = true; els.importProgressCancel.disabled = true; els.importProgressCancel.textContent = "正在完成写入"; },
    close() { els.importProgressCancel.onclick = null; els.importProgressCancel.textContent = "取消导入"; if (els.importProgressDialog.open) els.importProgressDialog.close(); },
  };
}

function affectedTaskIds(plan: MergePlan, selection: ImportCenterResult): Set<string> {
  if (selection.mode === "restore") return new Set(plan.incoming.state.tasks.map((item) => item.id));
  const result = new Set<string>();
  for (const item of plan.items) {
    const decision = selection.decisions[item.key] ?? item.defaultDecision;
    if (decision !== "use-imported" && decision !== "keep-both") continue;
    if (item.entityType === "task") { result.add(item.entityId); continue; }
    if (item.entityType === "worklog") {
      const record = plan.incoming.workLogs.find((entry) => entry.id === item.entityId); if (record) result.add(record.taskId);
    }
    if (item.entityType === "attachment") {
      const attachment = plan.incoming.attachments.find((entry) => entry.id === item.entityId); if (attachment) result.add(attachment.taskId);
    }
  }
  return result;
}

function showImportResult(els: Elements, report: Record<string, unknown>, rollback: () => Promise<boolean>, locate: () => Promise<void>, historical = false): void {
  const applied = typeof report.applied === "number" ? report.applied : undefined;
  const rolledBack = typeof report.rolledBackAt === "string";
  els.importResultText.textContent = rolledBack
    ? `最近一次导入已于 ${formatImportDate(String(report.rolledBackAt))} 回滚；报告仍保留用于核对。`
    : historical
      ? `最近一次导入已通过校验${applied === undefined ? "" : `，共应用 ${applied} 项变化`}。恢复点保存在工作区目录中。`
      : report.mode === "full-restore"
        ? "备份已完整恢复并完成写入校验。你可以下载报告，或在继续编辑前回滚。"
        : `合并已完成并通过写入校验${applied === undefined ? "" : `，共应用 ${applied} 项变化`}。`;
  const close = () => { if (els.importResultDialog.open) els.importResultDialog.close(); };
  els.importResultClose.onclick = close;
  els.importResultDone.onclick = close;
  els.importDownloadReport.onclick = () => downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), `task-workbench-import-report-${toISODate()}.json`);
  els.importLocateChanges.onclick = async () => { close(); await locate(); };
  els.importRollback.disabled = rolledBack;
  els.importRollback.onclick = async () => {
    els.importRollback.disabled = true;
    try { if (await rollback()) close(); else els.importRollback.disabled = false; }
    catch { els.importRollback.disabled = false; }
  };
  els.importResultDialog.showModal();
}

async function verifyImportedWorkspace(backend: WorkspaceBackend, expected: WorkspaceSnapshot): Promise<void> {
  const actual = await backend.exportSnapshot();
  verifyEntityContent("任务", expected.state.tasks, actual.state.tasks);
  verifyEntityContent("文件夹", expected.state.folders, actual.state.folders);
  verifyEntityContent("工作记录", expected.workLogs, actual.workLogs);
  verifyEntityContent("附件", expected.attachments, actual.attachments);

  const folderIds = new Set(actual.state.folders.map((item) => item.id));
  const taskIds = new Set(actual.state.tasks.map((item) => item.id));
  for (const folder of actual.state.folders) {
    if (folder.parentId !== null && !folderIds.has(folder.parentId)) throw new Error(`文件夹“${folder.name}”引用了不存在的上级，已触发自动回滚。`);
    const depth = getFolderDepth(actual.state.folders, folder.id);
    if (!Number.isFinite(depth) || depth > 4) throw new Error(`文件夹“${folder.name}”的层级结构无效，已触发自动回滚。`);
  }
  for (const task of actual.state.tasks) if (task.folderId !== null && !folderIds.has(task.folderId)) throw new Error(`任务“${task.title}”引用了不存在的文件夹，已触发自动回滚。`);
  for (const record of actual.workLogs) if (!taskIds.has(record.taskId)) throw new Error(`工作记录 ${record.id} 引用了不存在的任务，已触发自动回滚。`);
  for (const attachment of actual.attachments) if (!taskIds.has(attachment.taskId)) throw new Error(`附件“${attachment.name}”引用了不存在的任务，已触发自动回滚。`);

  for (const expectedMeta of expected.attachments) {
    const expectedBlob = expected.attachmentBlobs.get(expectedMeta.id);
    const actualBlob = actual.attachmentBlobs.get(expectedMeta.id);
    if (!expectedBlob || !actualBlob || await hashImportBlob(expectedBlob) !== await hashImportBlob(actualBlob)) {
      throw new Error(`附件“${expectedMeta.name}”的字节内容校验失败，已触发自动回滚。`);
    }
  }
  if (expected.attachmentBlobs.size !== actual.attachmentBlobs.size) throw new Error("附件内容数量校验失败，已触发自动回滚。");

  if (Boolean(expected.metadata) !== Boolean(actual.metadata)) throw new Error("备份版本元数据校验失败，已触发自动回滚。");
  if (expected.metadata && actual.metadata) {
    const expectedMetadata = {
      workspaceId: expected.metadata.workspaceId,
      snapshotId: expected.metadata.snapshotId,
      parentSnapshotId: expected.metadata.parentSnapshotId,
      contentSummary: expected.metadata.contentSummary,
      entityRevisions: expected.metadata.entityRevisions,
      tombstones: expected.metadata.tombstones,
    };
    const actualMetadata = {
      workspaceId: actual.metadata.workspaceId,
      snapshotId: actual.metadata.snapshotId,
      parentSnapshotId: actual.metadata.parentSnapshotId,
      contentSummary: actual.metadata.contentSummary,
      entityRevisions: actual.metadata.entityRevisions,
      tombstones: actual.metadata.tombstones,
    };
    if (stableValue(expectedMetadata) !== stableValue(actualMetadata)) throw new Error("工作区修订与删除元数据校验失败，已触发自动回滚。");
  }
}

function verifyEntityContent(label: string, expected: Array<{ id: string }>, actual: Array<{ id: string }>): void {
  const expectedById = new Map(expected.map((item) => [item.id, item]));
  const actualById = new Map(actual.map((item) => [item.id, item]));
  if (expectedById.size !== expected.length || actualById.size !== actual.length || expectedById.size !== actualById.size) {
    throw new Error(`${label}标识或数量校验失败，已触发自动回滚。`);
  }
  for (const [id, expectedItem] of expectedById) {
    const actualItem = actualById.get(id);
    if (!actualItem || stableValue(expectedItem) !== stableValue(actualItem)) throw new Error(`${label} ${id} 的内容校验失败，已触发自动回滚。`);
  }
}

async function hashImportBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

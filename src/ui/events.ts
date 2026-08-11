import {
  addDays,
  coercePriority,
  getFolderAncestorIds,
  getFolderDescendantIds,
  isOverdue,
  normalizeMultiline,
  normalizeText,
  selectVisibleTasks,
  toISODate,
} from "../domain.js";
import { createBackupArchive, parseBackupPackage } from "../backup.js";
import type { AppStore } from "../store.js";
import type { DefaultTaskDueDate, FolderScope, Priority, Task, TaskDraft, TaskFilter, ThemeMode, ViewMode, WorkspaceTab } from "../types.js";
import type { WorkspaceRepository } from "../workspace-db.js";
import type { Dialogs } from "./dialogs.js";
import { consumeSuppressedTaskClick } from "./drag-drop.js";
import { fillFolderSelect, type InlineCreateState, type ViewState } from "./renderer.js";
import type { Elements } from "./selectors.js";
import type { WorkspaceController } from "./workspace.js";

export interface EventBindings {
  getViewState(): ViewState;
  reconcileSelection(): void;
  reconcileResolutionTimers(): void;
}

export function bindEvents(
  els: Elements,
  store: AppStore,
  dialogs: Dialogs,
  workspace: WorkspaceController,
  repository: WorkspaceRepository,
  persistState: () => boolean,
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
  const resolutionTimers = new Map<string, number>();

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
    if (!persistState()) {
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
    return (await saveOverview()) && (await workspace.beforeTaskChange());
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
    if (selectedTaskId === task.id) { selectedTaskId = null; detailPanelOpen = false; }
    store.dispatch({ type: "delete-task", id: task.id });
    await workspace.activateTask(null, workspaceTab);
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
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    const action = button?.dataset.action;
    if (action === "toggle-folder" && button?.dataset.folderId) { store.dispatch({ type: "toggle-folder", id: button.dataset.folderId }); return; }
    if (action === "start-inline-task" || action === "start-inline-folder") { setInline(action === "start-inline-task" ? "task" : "folder", button?.dataset.folderId); return; }
    if (action === "cancel-inline") { inlineCreate = null; requestRender(); return; }
    if (action === "save-inline") return;
    if (action === "toggle-handled" && button?.dataset.containerId) { store.dispatch({ type: "toggle-handled-section", containerId: button.dataset.containerId }); return; }
    if (action === "suggest-order") {
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
    workspaceTab = (button.dataset.workspaceTab ?? "overview") as WorkspaceTab;
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
  els.undoAction.addEventListener("click", () => store.undo());
  els.redoAction.addEventListener("click", () => store.redo());
  els.detailResizer.addEventListener("pointerdown", (event) => {
    if (window.innerWidth < 1340) return;
    event.preventDefault();
    els.detailResizer.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const sidebarWidth = els.sidebar.getBoundingClientRect().width || 220;
      const maximum = Math.max(560, Math.min(680, window.innerWidth - sidebarWidth - 500));
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
    if (window.innerWidth < 1340) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    store.dispatch({ type: "set-workspace-width", width: store.getState().preferences.workspaceWidth + delta });
  });
  els.exportData.addEventListener("click", async () => {
    if (!(await flushWorkspace())) { dialogs.toast("仍有内容未保存，备份已取消。"); return; }
    if (!repository.available) { dialogs.toast("工作记录存储不可用，无法生成完整备份。"); return; }
    const archive = await createBackupArchive(store.getState(), repository);
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.href = url; link.download = `task-workbench-${toISODate()}.zip`; link.click(); URL.revokeObjectURL(url);
  });
  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0]; els.importFile.value = ""; if (!file) return;
    const result = await parseBackupPackage(file);
    if (!result.recovered) { dialogs.toast(result.message); return; }
    if (!(await dialogs.confirm("导入备份", "导入会替换当前任务、工作记录和附件，继续吗？"))) return;
    const previousState = store.getState();
    let previousWorkspace;
    try { previousWorkspace = await repository.exportSnapshot(); await repository.replaceAll(result.workspace); }
    catch { dialogs.toast("工作记录或附件恢复失败，原有数据未替换。"); return; }
    selectedTaskId = null; detailPanelOpen = false; detailDirty = false; inlineCreate = null;
    store.dispatch({ type: "replace-state", state: result.state });
    if (!persistState()) {
      await repository.replaceAll(previousWorkspace);
      store.dispatch({ type: "replace-state", state: previousState });
      persistState();
      dialogs.toast("本地任务存储不可用，原有数据已恢复。");
      return;
    }
    await workspace.activateTask(null, workspaceTab);
    dialogs.toast(result.message);
  });
  els.resetDemo.addEventListener("click", async () => {
    if (!(await dialogs.confirm("重置为示例数据", "这会用示例任务和文件夹替换当前浏览器中的全部数据，继续吗？"))) return;
    try { await repository.clear(); }
    catch { dialogs.toast("工作记录存储无法清理，重置已取消。"); return; }
    selectedTaskId = null; detailPanelOpen = false; detailDirty = false; inlineCreate = null; els.searchInput.value = "";
    store.dispatch({ type: "reset" }); await workspace.activateTask(null, workspaceTab); dialogs.toast("已重置为示例数据。");
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") store.dispatch({ type: "finalize-expired-resolutions" }); });

  return {
    getViewState: () => ({ query: els.searchInput.value, selectedTaskId, detailPanelOpen, detailDirty, workspaceTab, inlineCreate, flashTaskId }),
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

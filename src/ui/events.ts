import {
  coercePriority,
  getFolderDescendantIds,
  normalizeMultiline,
  normalizeText,
  selectVisibleTasks,
  toISODate,
} from "../domain.js";
import { createBackupBlob, parseBackupFile } from "../storage.js";
import type { AppStore } from "../store.js";
import type { FolderScope, SortMode, TaskDraft, TaskFilter, TaskStatus, ThemeMode, ViewMode } from "../types.js";
import type { Dialogs } from "./dialogs.js";
import type { ViewState } from "./renderer.js";
import type { Elements } from "./selectors.js";

export interface EventBindings {
  getViewState(): ViewState;
  reconcileSelection(): void;
}

export function bindEvents(els: Elements, store: AppStore, dialogs: Dialogs, requestRender: () => void): EventBindings {
  let selectedTaskId: string | null = null;
  let detailPanelOpen = false;
  let detailDirty = false;

  function readQuickTaskDraft(): TaskDraft {
    return {
      title: normalizeText(els.taskTitle.value),
      notes: "",
      priority: coercePriority(els.taskPriority.value),
      dueDate: els.taskDueDate.value,
      tag: normalizeText(els.taskTag.value),
      status: "active",
      folderId: els.taskFolder.value || null,
    };
  }

  function readDetailDraft(): TaskDraft {
    return {
      title: normalizeText(els.detailTitle.value),
      notes: normalizeMultiline(els.detailNotes.value),
      priority: coercePriority(els.detailPriority.value),
      dueDate: els.detailDueDate.value,
      tag: normalizeText(els.detailTag.value),
      status: els.detailStatus.value as TaskStatus,
      folderId: els.detailFolder.value || null,
    };
  }

  function resetTaskForm(): void {
    const preferredFolder = currentFolderForNewTask();
    els.taskForm.reset();
    els.taskPriority.value = "medium";
    els.taskFolder.value = preferredFolder;
    els.taskTitle.focus();
  }

  function currentFolderForNewTask(): string {
    const scope = store.getState().preferences.folderScope;
    return scope !== "all" && scope !== "root" ? scope : "";
  }

  async function selectTask(taskId: string): Promise<void> {
    if (selectedTaskId === taskId) {
      detailPanelOpen = true;
      requestRender();
      return;
    }
    if (detailDirty) {
      const discard = await dialogs.confirm("放弃未保存更改", "切换任务会丢失详情中尚未保存的修改，继续吗？");
      if (!discard) return;
    }
    selectedTaskId = taskId;
    detailPanelOpen = true;
    detailDirty = false;
    requestRender();
  }

  async function closeDetail(): Promise<void> {
    if (detailDirty) {
      const discard = await dialogs.confirm("放弃未保存更改", "关闭详情会丢失尚未保存的修改，继续吗？");
      if (!discard) return;
    }
    selectedTaskId = null;
    detailPanelOpen = false;
    detailDirty = false;
    requestRender();
  }

  async function prepareSelectedTaskMutation(taskId: string): Promise<boolean> {
    if (selectedTaskId !== taskId || !detailDirty) return true;
    const discard = await dialogs.confirm("放弃未保存更改", "此操作会更新任务并丢失详情中尚未保存的修改，继续吗？");
    if (discard) detailDirty = false;
    return discard;
  }

  els.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const draft = readQuickTaskDraft();
    if (!draft.title) return;
    store.dispatch({ type: "add-task", draft });
    resetTaskForm();
  });

  els.taskForm.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") els.taskForm.requestSubmit();
  });

  els.clearForm.addEventListener("click", resetTaskForm);
  els.searchInput.addEventListener("input", requestRender);

  els.statusFilters.forEach((button) => {
    button.addEventListener("click", () => {
      store.dispatch({ type: "set-status-filter", filter: (button.dataset.filter || "all") as TaskFilter });
    });
  });

  els.viewModes.forEach((button) => {
    button.addEventListener("click", () => {
      const viewMode = (button.dataset.view || "tree") as ViewMode;
      store.dispatch({ type: "set-view-mode", viewMode });
      const defaultSort: SortMode = viewMode === "tree" ? "manual" : viewMode === "priority" ? "due_date" : "priority";
      store.dispatch({ type: "set-sort-mode", sortMode: defaultSort });
    });
  });

  els.sortMode.addEventListener("change", () => {
    store.dispatch({ type: "set-sort-mode", sortMode: els.sortMode.value as SortMode });
  });

  els.themeSelect.addEventListener("change", () => {
    store.dispatch({ type: "set-theme", theme: els.themeSelect.value as ThemeMode });
  });

  els.taskList.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const folderButton = target.closest<HTMLButtonElement>("button[data-folder-id]");
    if (folderButton?.dataset.action === "toggle-folder" && folderButton.dataset.folderId) {
      store.dispatch({ type: "toggle-folder", id: folderButton.dataset.folderId });
      return;
    }

    const row = target.closest<HTMLElement>(".task-item");
    if (!row?.dataset.id) return;
    const actionButton = target.closest<HTMLButtonElement>("button[data-action]");
    if (!actionButton) {
      await selectTask(row.dataset.id);
      return;
    }

    const task = store.getState().tasks.find((item) => item.id === row.dataset.id);
    if (!task || !(await prepareSelectedTaskMutation(task.id))) return;
    const action = actionButton.dataset.action;
    if (action === "delete") {
      const confirmed = await dialogs.confirm("删除任务", `确认删除“${task.title}”吗？此操作可以撤销。`);
      if (!confirmed) return;
      if (selectedTaskId === task.id) {
        selectedTaskId = null;
        detailPanelOpen = false;
      }
      store.dispatch({ type: "delete-task", id: task.id });
      return;
    }
    if (action === "complete") store.dispatch({ type: "set-task-status", id: task.id, status: "completed" });
    if (action === "discard") store.dispatch({ type: "set-task-status", id: task.id, status: "discarded" });
    if (action === "restore") store.dispatch({ type: "set-task-status", id: task.id, status: "active" });
    if (action === "raise-priority") store.dispatch({ type: "adjust-task-priority", id: task.id, direction: "raise" });
    if (action === "lower-priority") store.dispatch({ type: "adjust-task-priority", id: task.id, direction: "lower" });
  });

  els.taskList.addEventListener("keydown", async (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>(".task-item");
    if (!row?.dataset.id) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      await selectTask(row.dataset.id);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = Array.from(els.taskList.querySelectorAll<HTMLElement>(".task-item"));
    const index = rows.indexOf(row);
    const targetIndex = event.key === "ArrowDown" ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1);
    const targetRow = rows[targetIndex];
    if (targetRow?.dataset.id) {
      await selectTask(targetRow.dataset.id);
      targetRow.focus();
    }
  });

  els.detailForm.addEventListener("input", () => {
    detailDirty = true;
  });

  els.detailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selectedTaskId) return;
    const draft = readDetailDraft();
    if (!draft.title) {
      els.detailTitle.focus();
      return;
    }
    detailDirty = false;
    store.dispatch({ type: "update-task", id: selectedTaskId, draft });
    dialogs.toast("任务详情已保存。");
    requestRender();
  });

  els.cancelDetail.addEventListener("click", () => {
    detailDirty = false;
    requestRender();
  });
  els.detailClose.addEventListener("click", closeDetail);

  els.newFolder.addEventListener("click", async () => {
    const draft = await dialogs.editFolder(null, store.getState().folders, null);
    if (draft) store.dispatch({ type: "add-folder", draft });
  });

  els.folderTree.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button?.dataset.action) return;
    const folderId = button.dataset.folderId;
    if (button.dataset.action === "select-folder" && folderId) {
      store.dispatch({ type: "set-folder-scope", folderScope: folderId as FolderScope });
      els.sidebar.classList.remove("is-open");
      els.taskFolder.value = folderId === "all" || folderId === "root" ? "" : folderId;
      return;
    }
    if (!folderId) return;
    const folder = store.getState().folders.find((item) => item.id === folderId);
    if (!folder) return;

    if (button.dataset.action === "toggle-folder") {
      store.dispatch({ type: "toggle-folder", id: folder.id });
    }
    if (button.dataset.action === "add-child-folder") {
      const draft = await dialogs.editFolder(null, store.getState().folders, folder.id);
      if (draft) store.dispatch({ type: "add-folder", draft });
    }
    if (button.dataset.action === "edit-folder") {
      const draft = await dialogs.editFolder(folder, store.getState().folders);
      if (draft) store.dispatch({ type: "update-folder", id: folder.id, draft });
    }
    if (button.dataset.action === "delete-folder") {
      const state = store.getState();
      const descendants = getFolderDescendantIds(state.folders, folder.id);
      const nonEmpty =
        descendants.size > 0 || state.tasks.some((task) => task.folderId === folder.id || Boolean(task.folderId && descendants.has(task.folderId)));
      if (nonEmpty) {
        const strategy = await dialogs.chooseFolderDeletion(folder);
        if (strategy) store.dispatch({ type: "delete-folder", id: folder.id, strategy });
      } else {
        const confirmed = await dialogs.confirm("删除文件夹", `确认删除空文件夹“${folder.name}”吗？`);
        if (confirmed) store.dispatch({ type: "delete-folder", id: folder.id, strategy: "delete-branch" });
      }
    }
  });

  els.navToggle.addEventListener("click", () => els.sidebar.classList.add("is-open"));
  els.sidebarClose.addEventListener("click", () => els.sidebar.classList.remove("is-open"));
  els.undoAction.addEventListener("click", () => store.undo());
  els.redoAction.addEventListener("click", () => store.redo());

  els.exportData.addEventListener("click", () => {
    const blob = createBackupBlob(store.getState());
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `task-workbench-${toISODate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  els.importData.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    els.importFile.value = "";
    if (!file) return;
    const result = parseBackupFile(await file.text());
    if (!result.recovered) {
      dialogs.toast(result.message);
      return;
    }
    const confirmed = await dialogs.confirm("导入备份", "导入会替换当前浏览器里的数据，继续吗？");
    if (!confirmed) return;
    selectedTaskId = null;
    detailPanelOpen = false;
    detailDirty = false;
    store.dispatch({ type: "replace-state", state: result.state });
    dialogs.toast(result.message);
  });

  els.resetDemo.addEventListener("click", async () => {
    const confirmed = await dialogs.confirm(
      "重置为示例数据",
      "这会用示例任务和文件夹替换当前浏览器中的全部数据，继续吗？",
    );
    if (!confirmed) return;
    selectedTaskId = null;
    detailPanelOpen = false;
    detailDirty = false;
    els.searchInput.value = "";
    store.dispatch({ type: "reset" });
    dialogs.toast("已重置为示例数据。");
  });

  return {
    getViewState: () => ({
      query: els.searchInput.value,
      selectedTaskId,
      detailPanelOpen,
      detailDirty,
    }),
    reconcileSelection() {
      if (!selectedTaskId) return;
      const visibleIds = new Set(selectVisibleTasks(store.getState(), els.searchInput.value).map((task) => task.id));
      if (!visibleIds.has(selectedTaskId)) {
        selectedTaskId = null;
        detailPanelOpen = false;
        detailDirty = false;
      }
    },
  };
}

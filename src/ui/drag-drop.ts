import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements, autoScrollWindowForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { addDays, canMoveFolder, isOverdue, toISODate } from "../domain.js";
import type { AppStore } from "../store.js";
import type { Folder, Priority, Task } from "../types.js";
import { icon } from "./icons.js";
import type { ViewState } from "./renderer.js";

export interface DragAndDropController {
  refresh(): void;
}

let suppressedTaskClick: { taskId: string; expiresAt: number } | null = null;

export function consumeSuppressedTaskClick(taskId: string): boolean {
  if (!suppressedTaskClick || suppressedTaskClick.taskId !== taskId || suppressedTaskClick.expiresAt < performance.now()) return false;
  suppressedTaskClick = null;
  return true;
}

export function createDragAndDrop(
  container: HTMLElement,
  store: AppStore,
  getViewState: () => ViewState,
  announce: (message: string) => void,
): DragAndDropController {
  let cleanup = () => {};
  let dragActive = false;
  let refreshPending = false;
  const expandedDuringDrag = new Set<string>();
  const hoverTimers = new Map<string, number>();
  const previewAnimations = new Map<HTMLElement, Animation>();
  let taskPreview: {
    taskId: string;
    row: HTMLElement;
    placeholder: HTMLElement;
    target: Record<string | symbol, unknown> | null;
    cleanupDropTarget: () => void;
  } | null = null;

  // TEST-V09-006：拖动过期任务时浮现的改期横条。
  const rescheduleBar = document.createElement("div");
  rescheduleBar.className = "drag-reschedule-bar";
  rescheduleBar.hidden = true;
  container.append(rescheduleBar);
  for (const [key, label] of [["tomorrow", "明天"], ["in_3_days", "3天后"], ["in_7_days", "7天后"]] as const) {
    const btn = document.createElement("button");
    btn.className = "drag-reschedule-option";
    btn.type = "button";
    btn.dataset.reschedule = key;
    btn.textContent = label;
    rescheduleBar.append(btn);
  }

  function cancelPreviewAnimations(): void {
    for (const animation of previewAnimations.values()) animation.cancel();
    previewAnimations.clear();
  }

  function captureTaskPositions(): Map<HTMLElement, DOMRect> {
    cancelPreviewAnimations();
    return new Map(Array.from(
      container.querySelectorAll<HTMLElement>(".task-item:not(.drag-source-collapsed), .task-drop-placeholder"),
      (element) => [element, element.getBoundingClientRect()],
    ));
  }

  function animateTaskPositions(before: Map<HTMLElement, DOMRect>): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const element of container.querySelectorAll<HTMLElement>(".task-item:not(.drag-source-collapsed), .task-drop-placeholder")) {
      const previous = before.get(element);
      if (!previous) continue;
      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;
      const animation = element.animate(
        [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
        { duration: 190, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
      previewAnimations.set(element, animation);
      animation.addEventListener("finish", () => previewAnimations.delete(element), { once: true });
      animation.addEventListener("cancel", () => previewAnimations.delete(element), { once: true });
    }
  }

  function finishTaskPreview(): void {
    if (!taskPreview) return;
    cancelPreviewAnimations();
    taskPreview.cleanupDropTarget();
    taskPreview.placeholder.remove();
    taskPreview.row.classList.remove("is-dragging", "drag-source-collapsed");
    taskPreview = null;
  }

  function startTaskPreview(row: HTMLElement, taskId: string): void {
    finishTaskPreview();
    const placeholder = document.createElement("div");
    placeholder.className = "task-drop-placeholder";
    placeholder.style.height = `${row.getBoundingClientRect().height}px`;
    placeholder.dataset.previewTaskId = taskId;
    placeholder.setAttribute("aria-hidden", "true");
    row.after(placeholder);
    row.classList.add("is-dragging", "drag-source-collapsed");
    taskPreview = { taskId, row, placeholder, target: null, cleanupDropTarget: () => {} };
    taskPreview.cleanupDropTarget = dropTargetForElements({
      element: placeholder,
      canDrop: ({ source }) => source.data.kind === "task" && source.data.taskId === taskId,
      getData: () => taskPreview?.target ?? { kind: "preview-origin", taskId },
    });
  }

  function placePreviewInFolder(folderId: string | null, priority: Priority): void {
    if (!taskPreview) return;
    const folderKey = folderId ?? "root";
    const branch = container.querySelector<HTMLElement>(`.tree-container[data-tree-folder-id="${CSS.escape(folderKey)}"]`);
    const contents = branch?.querySelector<HTMLElement>(":scope > .tree-container-contents");
    if (!contents || contents.hidden) return;
    const sourceRow = taskPreview.row;
    const peers = Array.from(contents.children).filter((child): child is HTMLElement => (
      child instanceof HTMLElement
      && child.matches(`.task-item.is-draggable[data-priority="${priority}"]`)
      && child !== sourceRow
    ));
    const lastPeer = peers.at(-1);
    if (lastPeer) {
      lastPeer.after(taskPreview.placeholder);
      return;
    }
    const divider = Array.from(contents.children).find((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("priority-divider"));
    if (divider) {
      contents.insertBefore(taskPreview.placeholder, priority === "high" ? divider : divider.nextSibling);
      return;
    }
    const firstStructuralChild = Array.from(contents.children).find((child) => child instanceof HTMLElement && child.matches(".tree-container, .handled-heading, .root-create-actions"));
    contents.insertBefore(taskPreview.placeholder, firstStructuralChild ?? null);
  }

  function previewTargetKey(target: Record<string | symbol, unknown> | null): string {
    if (!target) return "none";
    if (target.kind === "task-target") return `task:${String(target.targetId ?? "")}:${String(target.edge ?? "")}`;
    if (target.kind === "folder-target") return `folder:${String(target.folderId ?? "root")}`;
    return String(target.kind ?? "unknown");
  }

  function updateTaskPreview(target: Record<string | symbol, unknown> | null, force = false): void {
    if (!taskPreview) return;
    if (!force && previewTargetKey(taskPreview.target) === previewTargetKey(target)) return;
    const before = captureTaskPositions();
    taskPreview.target = target;
    if (!target || target.kind === "preview-origin") {
      taskPreview.row.after(taskPreview.placeholder);
      animateTaskPositions(before);
      return;
    }
    if (target.kind === "task-target") {
      const targetId = String(target.targetId ?? "");
      const targetRow = container.querySelector<HTMLElement>(`.task-item[data-id="${CSS.escape(targetId)}"]`);
      if (!targetRow || targetRow === taskPreview.row) return;
      const parent = targetRow.parentElement;
      if (!parent) return;
      parent.insertBefore(taskPreview.placeholder, target.edge === "after" ? targetRow.nextSibling : targetRow);
      animateTaskPositions(before);
      return;
    }
    if (target.kind === "folder-target") {
      const source = store.getState().tasks.find((task) => task.id === taskPreview?.taskId);
      if (!source) return;
      const destination = resolveTaskDestination(store.getState().tasks, source, target);
      if (!destination) return;
      placePreviewInFolder(destination.folderId, destination.priority);
      animateTaskPositions(before);
    }
  }

  function resolveTargetAtPoint(input: { clientX: number; clientY: number }): Record<string | symbol, unknown> | null {
    const element = document.elementFromPoint(input.clientX, input.clientY);
    if (!element) return null;
    if (element.closest(".task-drop-placeholder")) return taskPreview?.target ?? null;
    const row = element.closest<HTMLElement>(".task-item.is-draggable");
    if (row?.dataset.id && row !== taskPreview?.row) {
      const rect = row.getBoundingClientRect();
      return { kind: "task-target", targetId: row.dataset.id, edge: input.clientY >= rect.top + rect.height / 2 ? "after" : "before" };
    }
    const heading = element.closest<HTMLElement>(".tree-group-heading");
    if (heading?.dataset.dropFolderId) return { kind: "folder-target", folderId: heading.dataset.dropFolderId };
    const branch = element.closest<HTMLElement>(".tree-container");
    if (branch?.dataset.treeFolderId) return { kind: "folder-target", folderId: branch.dataset.treeFolderId };
    return null;
  }

  function clearHoverTimers(): void {
    for (const timer of hoverTimers.values()) window.clearTimeout(timer);
    hoverTimers.clear();
  }

  function collapseTemporaryFolders(keptFolderId: string | null): void {
    for (const folderId of expandedDuringDrag) {
      if (folderId === keptFolderId) store.dispatch({ type: "toggle-folder", id: folderId, collapsed: false });
      else setTemporaryFolderExpanded(folderId, false);
    }
    expandedDuringDrag.clear();
  }

  function setTemporaryFolderExpanded(folderId: string, expanded: boolean): void {
    const branch = container.querySelector<HTMLElement>(`.tree-container[data-tree-folder-id="${CSS.escape(folderId)}"]`);
    const contents = branch?.querySelector<HTMLElement>(":scope > .tree-container-contents");
    const toggle = branch?.querySelector<HTMLButtonElement>(":scope > .tree-group-heading .folder-toggle");
    if (!contents || !toggle) return;
    contents.hidden = !expanded;
    const label = expanded ? "折叠文件夹" : "展开文件夹";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    toggle.replaceChildren(icon(expanded ? "ChevronDown" : "ChevronRight"));
  }

  const controller: DragAndDropController = {
    refresh() {
      if (dragActive) {
        refreshPending = true;
        return;
      }
      finishTaskPreview();
      cleanup();
      clearHoverTimers();
      const state = store.getState();
      const view = getViewState();
      const eligible = state.preferences.viewMode === "tree_manual" && !view.query && !["completed", "discarded"].includes(state.preferences.activeStatusFilter);
      if (!eligible) return;

      const cleanups: Array<() => void> = [];
      for (const row of container.querySelectorAll<HTMLElement>(".task-item.is-draggable")) {
        const handle = row.querySelector<HTMLElement>(".task-main");
        const taskId = row.dataset.id;
        if (!handle || !taskId) continue;
        cleanups.push(draggable({
          element: row,
          dragHandle: handle,
          getInitialData: () => ({ kind: "task", taskId, status: row.dataset.status ?? "active" }),
          onDragStart: () => {
            dragActive = true;
            const src = store.getState().tasks.find((item) => item.id === taskId);
            if (src && isOverdue(src)) { rescheduleBar.dataset.taskId = taskId; rescheduleBar.hidden = false; }
            else rescheduleBar.hidden = true;
            startTaskPreview(row, taskId);
          },
          onDrop: () => {
            suppressedTaskClick = { taskId, expiresAt: performance.now() + 600 };
          },
        }));
      }

      for (const divider of container.querySelectorAll<HTMLElement>(".priority-divider.is-draggable")) {
        const folderId = divider.dataset.dividerFolderId === "root" ? null : divider.dataset.dividerFolderId ?? null;
        cleanups.push(draggable({
          element: divider,
          getInitialData: () => ({ kind: "divider", folderId: folderId ?? "root" }),
          onDragStart: () => { dragActive = true; divider.classList.add("is-dragging"); },
          onDrop: () => divider.classList.remove("is-dragging"),
        }));
      }

      // TEST-V09-007：文件夹拖拽源（专用 GripVertical 手柄）。文件夹落点在下方表头 drop target 上统一注册。
      for (const handle of container.querySelectorAll<HTMLElement>(".folder-drag-handle[data-folder-id]")) {
        const heading = handle.closest<HTMLElement>(".tree-group-heading");
        const rawFolderId = handle.dataset.folderId;
        if (!heading || !rawFolderId) continue;
        const folderId = rawFolderId;
        cleanups.push(draggable({
          element: heading,
          dragHandle: handle,
          getInitialData: () => ({ kind: "folder", folderId }),
          onDragStart: () => { dragActive = true; heading.classList.add("is-dragging"); },
          onDrop: () => heading.classList.remove("is-dragging"),
        }));
      }

      for (const row of container.querySelectorAll<HTMLElement>(".task-item.is-draggable")) {
        const targetId = row.dataset.id;
        if (!targetId) continue;
        cleanups.push(dropTargetForElements({
          element: row,
          canDrop: ({ source }) => (source.data.kind === "task" && source.data.taskId !== targetId) || source.data.kind === "divider",
          getData: ({ input, element }) => {
            const rect = element.getBoundingClientRect();
            return { kind: "task-target", targetId, edge: input.clientY >= rect.top + rect.height / 2 ? "after" : "before" };
          },
          onDragEnter: () => row.classList.add("drop-target"),
          onDragLeave: () => row.classList.remove("drop-target"),
          onDrop: () => row.classList.remove("drop-target"),
        }));
      }

      for (const heading of container.querySelectorAll<HTMLElement>(".tree-group-heading")) {
        const folderId = heading.dataset.dropFolderId === "root" ? null : heading.dataset.dropFolderId ?? null;
        cleanups.push(dropTargetForElements({
          element: heading,
          canDrop: ({ source }) => {
            // TEST-V09-007：文件夹源也作为落点——同层=同级重排、行中部=嵌套为子、跨层=嵌套为子。
            if (source.data.kind === "task") return true;
            if (source.data.kind !== "folder") return false;
            const src = String(source.data.folderId ?? "");
            if (src === (folderId ?? "root")) return false;
            const folders = store.getState().folders;
            const sourceFolder = folders.find((f) => f.id === src);
            const targetFolder = folders.find((f) => f.id === (folderId ?? ""));
            return sourceFolder?.parentId === targetFolder?.parentId || canMoveFolder(folders, src, folderId);
          },
          getData: ({ input, element }) => {
            const rect = element.getBoundingClientRect();
            const ratio = (input.clientY - rect.top) / rect.height;
            return { kind: "folder-target", folderId: folderId ?? "root", edge: ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "center" };
          },
          getIsSticky: () => true,
          onDragEnter: () => {
            heading.classList.add("drop-target");
            if (!folderId) return;
            const folder = store.getState().folders.find((item) => item.id === folderId);
            if (!folder?.collapsed || hoverTimers.has(folderId)) return;
            hoverTimers.set(folderId, window.setTimeout(() => {
              hoverTimers.delete(folderId);
              expandedDuringDrag.add(folderId);
              setTemporaryFolderExpanded(folderId, true);
              if (taskPreview?.target?.kind === "folder-target" && taskPreview.target.folderId === folderId) updateTaskPreview(taskPreview.target, true);
            }, 600));
          },
          onDragLeave: () => {
            heading.classList.remove("drop-target");
            if (folderId && hoverTimers.has(folderId)) {
              window.clearTimeout(hoverTimers.get(folderId));
              hoverTimers.delete(folderId);
            }
          },
          onDrop: () => heading.classList.remove("drop-target"),
        }));
      }

      for (const btn of rescheduleBar.querySelectorAll<HTMLButtonElement>("button[data-reschedule]")) {
        const key = btn.dataset.reschedule ?? "";
        cleanups.push(dropTargetForElements({
          element: btn,
          canDrop: ({ source }) => source.data.kind === "task" && rescheduleBar.dataset.taskId === String(source.data.taskId ?? ""),
          getData: () => ({ kind: "reschedule-target", reschedule: key }),
          onDragEnter: () => btn.classList.add("drop-target"),
          onDragLeave: () => btn.classList.remove("drop-target"),
          onDrop: () => btn.classList.remove("drop-target"),
        }));
      }

      cleanups.push(
        autoScrollForElements({ element: container, getAllowedAxis: () => "vertical", getConfiguration: () => ({ maxScrollSpeed: "fast" }) }),
        autoScrollWindowForElements({ getAllowedAxis: () => "vertical" }),
        monitorForElements({
          canMonitor: ({ source }) => source.data.kind === "task" || source.data.kind === "divider" || source.data.kind === "folder",
          onDropTargetChange: ({ source, location }) => {
            if (source.data.kind !== "task") return;
            updateTaskPreview(location.current.dropTargets[0]?.data ?? resolveTargetAtPoint(location.current.input));
          },
          onDrop: ({ source, location }) => {
            try {
              clearHoverTimers();
              const target = location.current.dropTargets[0]?.data ?? resolveTargetAtPoint(location.current.input);
              if (source.data.kind === "folder") {
                const folderId = String(source.data.folderId ?? "");
                const destination = target && target.kind === "folder-target" ? resolveFolderDestination(store.getState().folders, folderId, target) : null;
                if (!destination) { collapseTemporaryFolders(null); return; }
                store.dispatch({ type: "move-folder", id: folderId, parentId: destination.parentId, targetIndex: destination.targetIndex });
                collapseTemporaryFolders(destination.parentId);
                announce("已移动文件夹。");
                return;
              }
              if (source.data.kind === "task") {
                const taskId = String(source.data.taskId ?? "");
                if (target?.kind === "reschedule-target") {
                  const dueDate = rescheduleDate(String(target.reschedule ?? ""));
                  const task = store.getState().tasks.find((item) => item.id === taskId);
                  finishTaskPreview();
                  if (task) { store.dispatch({ type: "reschedule-task", id: taskId, dueDate, source: "quick" }); announce(`已将“${task.title}”改期到“${dueDate}”。`); }
                  collapseTemporaryFolders(null);
                  return;
                }
                const task = store.getState().tasks.find((item) => item.id === taskId);
                // TEST-V09-010：已处理(completed/discarded)任务——拖到文件夹=移动(保留状态)；拖到待办行=恢复为待办。
                if (task && (task.status === "completed" || task.status === "discarded")) {
                  if (target?.kind === "folder-target") {
                    const folderId = String(target.folderId ?? "root") === "root" ? null : String(target.folderId ?? "");
                    store.dispatch({ type: "move-handled-task", id: taskId, folderId });
                    announce(`已将“${task.title}”移动。`);
                  } else if (target?.kind === "task-target") {
                    const targetTask = store.getState().tasks.find((item) => item.id === String(target.targetId ?? ""));
                    if (targetTask?.folderId) store.dispatch({ type: "move-handled-task", id: taskId, folderId: targetTask.folderId });
                    store.dispatch({ type: "restore-task", id: taskId });
                    announce(`已恢复“${task.title}”为待办。`);
                  }
                  collapseTemporaryFolders(null);
                  return;
                }
                const destination = task && target ? resolveTaskDestination(store.getState().tasks, task, target) : null;
                finishTaskPreview();
                if (!task || !destination) { collapseTemporaryFolders(null); return; }
                store.dispatch({ type: "move-task", id: task.id, ...destination });
                collapseTemporaryFolders(destination.folderId);
                announce(`已移动“${task.title}”。`);
                return;
              }
              if (!target) { collapseTemporaryFolders(null); return; }
              if (source.data.kind === "divider" && target.kind === "task-target") {
                const rawFolderId = String(source.data.folderId ?? "root");
                const folderId = rawFolderId === "root" ? null : rawFolderId;
                const task = store.getState().tasks.find((item) => item.id === String(target.targetId ?? ""));
                if (!task || task.folderId !== folderId) { collapseTemporaryFolders(null); return; }
                const ordered = store.getState().tasks.filter((item) => item.status === "active" && !isOverdue(item) && item.folderId === folderId).sort(stableTaskOrder);
                const targetIndex = ordered.findIndex((item) => item.id === task.id);
                const highCount = targetIndex + (target.edge === "after" ? 1 : 0);
                store.dispatch({ type: "move-priority-divider", folderId, highCount });
                collapseTemporaryFolders(folderId);
                announce("已调整高、低优先级分界线。");
              }
            } finally {
              rescheduleBar.hidden = true;
              finishTaskPreview();
              dragActive = false;
              if (refreshPending) {
                refreshPending = false;
                queueMicrotask(() => controller.refresh());
              }
            }
          },
        }),
      );
      cleanup = combine(...cleanups);
    },
  };
  return controller;
}

function resolveTaskDestination(tasks: Task[], source: Task, target: Record<string | symbol, unknown>): { folderId: string | null; priority: Priority; targetIndex: number } | null {
  if (target.kind === "folder-target") {
    const rawFolderId = String(target.folderId ?? "root");
    const folderId = rawFolderId === "root" ? null : rawFolderId;
    const targetIndex = tasks.filter((task) => task.id !== source.id && task.status === "active" && !isOverdue(task) && task.folderId === folderId && task.priority === source.priority).length;
    return { folderId, priority: source.priority, targetIndex };
  }
  if (target.kind !== "task-target") return null;
  const targetTask = tasks.find((task) => task.id === String(target.targetId ?? ""));
  if (!targetTask || targetTask.id === source.id || targetTask.status !== "active" || isOverdue(targetTask)) return null;
  const peers = tasks.filter((task) => task.id !== source.id && task.status === "active" && !isOverdue(task) && task.folderId === targetTask.folderId && task.priority === targetTask.priority).sort(stableTaskOrder);
  const index = peers.findIndex((task) => task.id === targetTask.id);
  return { folderId: targetTask.folderId, priority: targetTask.priority, targetIndex: Math.max(0, index + (target.edge === "after" ? 1 : 0)) };
}

function stableTaskOrder(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function folderOrder(a: Folder, b: Folder): number {
  return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

// TEST-V09-006：改期横条各选项对应的目标日期。
function rescheduleDate(key: string): string {
  const today = toISODate();
  if (key === "tomorrow") return addDays(today, 1);
  if (key === "in_3_days") return addDays(today, 3);
  if (key === "in_7_days") return addDays(today, 7);
  return today;
}

// TEST-V09-007：计算文件夹拖拽的目标（同层=同级重排，跨层=嵌套为子），canMoveFolder 兜底校验。
function resolveFolderDestination(folders: Folder[], sourceFolderId: string, target: Record<string | symbol, unknown>): { parentId: string | null; targetIndex: number } | null {
  const rawTarget = String(target.folderId ?? "root");
  const targetFolderId = rawTarget === "root" ? null : rawTarget;
  const source = folders.find((f) => f.id === sourceFolderId);
  const targetFolder = folders.find((f) => f.id === (targetFolderId ?? ""));
  const sourceParent = source?.parentId ?? null;
  const targetParent = targetFolder?.parentId ?? null;
  const siblings = folders.filter((f) => f.parentId === targetParent && f.id !== sourceFolderId).sort(folderOrder);
  let parentId: string | null;
  let targetIndex: number;
  // TEST-V09-007：拖到文件夹行「中部」=嵌套为其子级（移动到其它文件夹下）；仅拖到同层文件夹行「边缘」=同级重排。
  if (sourceParent === targetParent && target.edge !== "center") {
    const tIdx = siblings.findIndex((f) => f.id === targetFolderId);
    parentId = targetParent;
    targetIndex = Math.max(0, (tIdx < 0 ? 0 : tIdx) + (target.edge === "after" ? 1 : 0));
  } else {
    parentId = targetFolderId;
    targetIndex = folders.filter((f) => f.parentId === parentId && f.id !== sourceFolderId).length;
  }
  if (!canMoveFolder(folders, sourceFolderId, parentId)) return null;
  return { parentId, targetIndex };
}

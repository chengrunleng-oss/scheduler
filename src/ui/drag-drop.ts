import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements, autoScrollWindowForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { isOverdue } from "../domain.js";
import type { AppStore } from "../store.js";
import type { Priority, Task } from "../types.js";
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
          getInitialData: () => ({ kind: "task", taskId }),
          onDragStart: () => { dragActive = true; startTaskPreview(row, taskId); },
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
          canDrop: ({ source }) => source.data.kind === "task",
          getData: () => ({ kind: "folder-target", folderId: folderId ?? "root" }),
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

      cleanups.push(
        autoScrollForElements({ element: container, getAllowedAxis: () => "vertical", getConfiguration: () => ({ maxScrollSpeed: "fast" }) }),
        autoScrollWindowForElements({ getAllowedAxis: () => "vertical" }),
        monitorForElements({
          canMonitor: ({ source }) => source.data.kind === "task" || source.data.kind === "divider",
          onDropTargetChange: ({ source, location }) => {
            if (source.data.kind !== "task") return;
            updateTaskPreview(location.current.dropTargets[0]?.data ?? resolveTargetAtPoint(location.current.input));
          },
          onDrop: ({ source, location }) => {
            try {
              clearHoverTimers();
              const target = location.current.dropTargets[0]?.data ?? resolveTargetAtPoint(location.current.input);
              if (source.data.kind === "task") {
                const taskId = String(source.data.taskId ?? "");
                const task = store.getState().tasks.find((item) => item.id === taskId);
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

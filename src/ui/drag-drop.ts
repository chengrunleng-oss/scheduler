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
      cleanup();
      clearHoverTimers();
      const state = store.getState();
      const view = getViewState();
      const eligible = state.preferences.viewMode === "tree_manual" && !view.query && !["completed", "discarded"].includes(state.preferences.activeStatusFilter);
      if (!eligible) return;

      const cleanups: Array<() => void> = [];
      for (const row of container.querySelectorAll<HTMLElement>(".task-item.is-draggable")) {
        const handle = row.querySelector<HTMLElement>(".drag-handle");
        const taskId = row.dataset.id;
        if (!handle || !taskId) continue;
        cleanups.push(draggable({
          element: row,
          dragHandle: handle,
          getInitialData: () => ({ kind: "task", taskId }),
          onDragStart: () => { dragActive = true; row.classList.add("is-dragging"); },
          onDrop: () => row.classList.remove("is-dragging"),
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
          canDrop: ({ source }) => source.data.kind === "task" || source.data.kind === "divider",
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
          onDragEnter: () => {
            heading.classList.add("drop-target");
            if (!folderId) return;
            const folder = store.getState().folders.find((item) => item.id === folderId);
            if (!folder?.collapsed || hoverTimers.has(folderId)) return;
            hoverTimers.set(folderId, window.setTimeout(() => {
              hoverTimers.delete(folderId);
              expandedDuringDrag.add(folderId);
              setTemporaryFolderExpanded(folderId, true);
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
          onDrop: ({ source, location }) => {
            try {
              clearHoverTimers();
              const target = location.current.dropTargets[0]?.data;
              if (!target) { collapseTemporaryFolders(null); return; }
              if (source.data.kind === "task") {
                const taskId = String(source.data.taskId ?? "");
                const task = store.getState().tasks.find((item) => item.id === taskId);
                if (!task) { collapseTemporaryFolders(null); return; }
                const destination = resolveTaskDestination(store.getState().tasks, task, target);
                if (!destination) { collapseTemporaryFolders(null); return; }
                store.dispatch({ type: "move-task", id: task.id, ...destination });
                collapseTemporaryFolders(destination.folderId);
                announce(`已移动“${task.title}”。`);
                return;
              }
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

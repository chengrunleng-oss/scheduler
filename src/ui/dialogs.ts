import { normalizeText } from "../domain.js";
import type { ChecklistKind, Priority, Task, TaskDraft } from "../types.js";
import type { Elements } from "./selectors.js";

export interface Dialogs {
  editTask(task: Task): Promise<TaskDraft | null>;
  addChecklistItem(kind: ChecklistKind): Promise<string | null>;
  confirm(title: string, message: string): Promise<boolean>;
  toast(message: string): void;
}

export function createDialogs(els: Elements): Dialogs {
  let toastTimer = 0;

  function closeDialog(dialog: HTMLDialogElement): void {
    if (dialog.open) dialog.close();
  }

  document.addEventListener("click", (event) => {
    const closeButton = (event.target as HTMLElement).closest("[data-close-dialog]");
    if (!closeButton) return;
    const dialog = closeButton.closest("dialog");
    if (dialog instanceof HTMLDialogElement) closeDialog(dialog);
  });

  return {
    editTask(task) {
      els.taskDialogTitle.textContent = "编辑任务";
      els.dialogTaskTitle.value = task.title;
      els.dialogTaskPriority.value = task.priority;
      els.dialogTaskDueDate.value = task.dueDate;
      els.dialogTaskTag.value = task.tag;

      return new Promise((resolve) => {
        const onSubmit = (event: SubmitEvent) => {
          event.preventDefault();
          const draft = readDialogTaskDraft(els);
          cleanup();
          closeDialog(els.taskDialog);
          resolve(draft.title ? draft : null);
        };
        const onClose = () => {
          cleanup();
          resolve(null);
        };
        const cleanup = () => {
          els.taskDialogForm.removeEventListener("submit", onSubmit);
          els.taskDialog.removeEventListener("close", onClose);
        };

        els.taskDialogForm.addEventListener("submit", onSubmit);
        els.taskDialog.addEventListener("close", onClose, { once: true });
        els.taskDialog.showModal();
        els.dialogTaskTitle.focus();
      });
    },

    addChecklistItem(kind) {
      els.itemDialogTitle.textContent = kind === "completed" ? "添加改进记录" : "添加下一轮改进项";
      els.itemDialogLabel.textContent = kind === "completed" ? "完成了什么" : "准备改进什么";
      els.itemDialogText.value = "";

      return new Promise((resolve) => {
        const onSubmit = (event: SubmitEvent) => {
          event.preventDefault();
          const text = normalizeText(els.itemDialogText.value);
          cleanup();
          closeDialog(els.itemDialog);
          resolve(text || null);
        };
        const onClose = () => {
          cleanup();
          resolve(null);
        };
        const cleanup = () => {
          els.itemDialogForm.removeEventListener("submit", onSubmit);
          els.itemDialog.removeEventListener("close", onClose);
        };

        els.itemDialogForm.addEventListener("submit", onSubmit);
        els.itemDialog.addEventListener("close", onClose, { once: true });
        els.itemDialog.showModal();
        els.itemDialogText.focus();
      });
    },

    confirm(title, message) {
      els.confirmTitle.textContent = title;
      els.confirmText.textContent = message;

      return new Promise((resolve) => {
        const finish = (value: boolean) => {
          cleanup();
          closeDialog(els.confirmDialog);
          resolve(value);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onClose = () => finish(false);
        const cleanup = () => {
          els.confirmOk.removeEventListener("click", onOk);
          els.confirmCancel.removeEventListener("click", onCancel);
          els.confirmClose.removeEventListener("click", onCancel);
          els.confirmDialog.removeEventListener("close", onClose);
        };

        els.confirmOk.addEventListener("click", onOk);
        els.confirmCancel.addEventListener("click", onCancel);
        els.confirmClose.addEventListener("click", onCancel);
        els.confirmDialog.addEventListener("close", onClose, { once: true });
        els.confirmDialog.showModal();
      });
    },

    toast(message) {
      window.clearTimeout(toastTimer);
      els.toast.textContent = message;
      els.toast.hidden = false;
      toastTimer = window.setTimeout(() => {
        els.toast.hidden = true;
      }, 2600);
    },
  };
}

function readDialogTaskDraft(els: Elements): TaskDraft {
  return {
    title: normalizeText(els.dialogTaskTitle.value),
    priority: els.dialogTaskPriority.value as Priority,
    dueDate: els.dialogTaskDueDate.value,
    tag: normalizeText(els.dialogTaskTag.value),
  };
}

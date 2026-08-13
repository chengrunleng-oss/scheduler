import { canAddFolder, canMoveFolder, getFolderDepth, normalizeText } from "../domain.js";
import type { Folder, FolderDeleteStrategy, FolderDraft } from "../types.js";
import type { Elements } from "./selectors.js";

export interface Dialogs {
  editFolder(folder: Folder | null, folders: Folder[], initialParentId?: string | null): Promise<FolderDraft | null>;
  moveFolder(folder: Folder, folders: Folder[]): Promise<{ parentId: string | null; targetIndex: number } | null>;
  chooseFolderDeletion(folder: Folder, childFolderCount: number, taskCount: number): Promise<FolderDeleteStrategy | null>;
  confirm(title: string, message: string): Promise<boolean>;
  resolveConflict(message: string): Promise<"reload" | "copy" | "cancel">;
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
    editFolder(folder, folders, initialParentId = null) {
      els.folderDialogTitle.textContent = folder ? "重命名文件夹" : "新建文件夹";
      els.folderName.value = folder?.name ?? "";
      fillFolderParents(els.folderParent, folders, folder);
      const preferredParent = folder?.parentId ?? initialParentId;
      els.folderParent.value = preferredParent && hasOption(els.folderParent, preferredParent) ? preferredParent : "";
      els.folderParent.disabled = Boolean(folder);

      return new Promise((resolve) => {
        const onSubmit = (event: SubmitEvent) => {
          event.preventDefault();
          const name = normalizeText(els.folderName.value);
          const parentId = (folder?.parentId ?? els.folderParent.value) || null;
          cleanup();
          closeDialog(els.folderDialog);
          resolve(name ? { name, parentId } : null);
        };
        const onClose = () => {
          cleanup();
          resolve(null);
        };
        const cleanup = () => {
          els.folderDialogForm.removeEventListener("submit", onSubmit);
          els.folderDialog.removeEventListener("close", onClose);
        };

        els.folderDialogForm.addEventListener("submit", onSubmit);
        els.folderDialog.addEventListener("close", onClose, { once: true });
        els.folderDialog.showModal();
        els.folderName.focus();
      });
    },

    moveFolder(folder, folders) {
      els.folderMoveName.textContent = `移动“${folder.name}”，并指定它在目标上级中的位置。`;
      fillFolderParents(els.folderMoveParent, folders, folder);
      els.folderMoveParent.value = folder.parentId ?? "";
      const fillPositions = () => {
        const parentId = els.folderMoveParent.value || null;
        const siblings = folders
          .filter((item) => item.id !== folder.id && item.parentId === parentId)
          .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        els.folderMovePosition.replaceChildren(new Option("第一位", "0"));
        siblings.forEach((item, index) => els.folderMovePosition.add(new Option(`在“${item.name}”之后`, String(index + 1))));
        const currentIndex = folder.parentId === parentId
          ? folders.filter((item) => item.id !== folder.id && item.parentId === parentId && item.order < folder.order).length
          : siblings.length;
        els.folderMovePosition.value = String(currentIndex);
      };
      fillPositions();

      return new Promise((resolve) => {
        const onParentChange = () => fillPositions();
        const onSubmit = (event: SubmitEvent) => {
          event.preventDefault();
          const result = { parentId: els.folderMoveParent.value || null, targetIndex: Number(els.folderMovePosition.value) };
          cleanup();
          closeDialog(els.folderMoveDialog);
          resolve(result);
        };
        const onClose = () => { cleanup(); resolve(null); };
        const cleanup = () => {
          els.folderMoveParent.removeEventListener("change", onParentChange);
          els.folderMoveForm.removeEventListener("submit", onSubmit);
          els.folderMoveDialog.removeEventListener("close", onClose);
        };
        els.folderMoveParent.addEventListener("change", onParentChange);
        els.folderMoveForm.addEventListener("submit", onSubmit);
        els.folderMoveDialog.addEventListener("close", onClose, { once: true });
        els.folderMoveDialog.showModal();
        els.folderMoveParent.focus();
      });
    },

    chooseFolderDeletion(folder, childFolderCount, taskCount) {
      els.folderDeleteText.textContent = `“${folder.name}”包含 ${childFolderCount} 个子文件夹和 ${taskCount} 个任务。请选择将内容移到上一级，或删除整个分支；附件仍保留在本地备份数据中。`;
      return new Promise((resolve) => {
        const finish = (value: FolderDeleteStrategy | null) => {
          cleanup();
          closeDialog(els.folderDeleteDialog);
          resolve(value);
        };
        const onMove = () => finish("move-contents");
        const onBranch = () => finish("delete-branch");
        const onCancel = () => finish(null);
        const cleanup = () => {
          els.folderDeleteMove.removeEventListener("click", onMove);
          els.folderDeleteBranch.removeEventListener("click", onBranch);
          els.folderDeleteCancel.removeEventListener("click", onCancel);
          els.folderDeleteClose.removeEventListener("click", onCancel);
          els.folderDeleteDialog.removeEventListener("close", onCancel);
        };

        els.folderDeleteMove.addEventListener("click", onMove);
        els.folderDeleteBranch.addEventListener("click", onBranch);
        els.folderDeleteCancel.addEventListener("click", onCancel);
        els.folderDeleteClose.addEventListener("click", onCancel);
        els.folderDeleteDialog.addEventListener("close", onCancel, { once: true });
        els.folderDeleteDialog.showModal();
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
        const cleanup = () => {
          els.confirmOk.removeEventListener("click", onOk);
          els.confirmCancel.removeEventListener("click", onCancel);
          els.confirmClose.removeEventListener("click", onCancel);
          els.confirmDialog.removeEventListener("close", onCancel);
        };

        els.confirmOk.addEventListener("click", onOk);
        els.confirmCancel.addEventListener("click", onCancel);
        els.confirmClose.addEventListener("click", onCancel);
        els.confirmDialog.addEventListener("close", onCancel, { once: true });
        els.confirmDialog.showModal();
      });
    },

    resolveConflict(message) {
      els.conflictText.textContent = `${message} 请选择如何处理当前未保存内容。`;
      return new Promise((resolve) => {
        const finish = (value: "reload" | "copy" | "cancel") => {
          cleanup();
          closeDialog(els.conflictDialog);
          resolve(value);
        };
        const onReload = () => finish("reload");
        const onCopy = () => finish("copy");
        const onCancel = () => finish("cancel");
        const cleanup = () => {
          els.conflictReload.removeEventListener("click", onReload);
          els.conflictCopy.removeEventListener("click", onCopy);
          els.conflictCancel.removeEventListener("click", onCancel);
          els.conflictClose.removeEventListener("click", onCancel);
          els.conflictDialog.removeEventListener("close", onCancel);
        };
        els.conflictReload.addEventListener("click", onReload);
        els.conflictCopy.addEventListener("click", onCopy);
        els.conflictCancel.addEventListener("click", onCancel);
        els.conflictClose.addEventListener("click", onCancel);
        els.conflictDialog.addEventListener("close", onCancel, { once: true });
        els.conflictDialog.showModal();
      });
    },

    toast(message) {
      window.clearTimeout(toastTimer);
      els.toast.textContent = message;
      els.toast.hidden = false;
      toastTimer = window.setTimeout(() => {
        els.toast.hidden = true;
      }, 2800);
    },
  };
}

function fillFolderParents(select: HTMLSelectElement, folders: Folder[], editing: Folder | null): void {
  select.replaceChildren(new Option("根目录", ""));
  const sorted = [...folders].sort((a, b) => getFolderDepth(folders, a.id) - getFolderDepth(folders, b.id) || a.order - b.order);
  for (const folder of sorted) {
    const allowed = editing ? canMoveFolder(folders, editing.id, folder.id) : canAddFolder(folders, folder.id);
    if (!allowed) continue;
    const depth = getFolderDepth(folders, folder.id);
    select.add(new Option(`${"  ".repeat(Math.max(0, depth - 1))}${folder.name}`, folder.id));
  }
}

function hasOption(select: HTMLSelectElement, value: string): boolean {
  return Array.from(select.options).some((option) => option.value === value);
}

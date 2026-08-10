import { canAddFolder, canMoveFolder, getFolderDepth, normalizeText } from "../domain.js";
import type { Folder, FolderDeleteStrategy, FolderDraft } from "../types.js";
import type { Elements } from "./selectors.js";

export interface Dialogs {
  editFolder(folder: Folder | null, folders: Folder[], initialParentId?: string | null): Promise<FolderDraft | null>;
  chooseFolderDeletion(folder: Folder): Promise<FolderDeleteStrategy | null>;
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
    editFolder(folder, folders, initialParentId = null) {
      els.folderDialogTitle.textContent = folder ? "编辑文件夹" : "新建文件夹";
      els.folderName.value = folder?.name ?? "";
      fillFolderParents(els.folderParent, folders, folder);
      const preferredParent = folder?.parentId ?? initialParentId;
      els.folderParent.value = preferredParent && hasOption(els.folderParent, preferredParent) ? preferredParent : "";

      return new Promise((resolve) => {
        const onSubmit = (event: SubmitEvent) => {
          event.preventDefault();
          const name = normalizeText(els.folderName.value);
          const parentId = els.folderParent.value || null;
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

    chooseFolderDeletion(folder) {
      els.folderDeleteText.textContent = `“${folder.name}”中仍有任务或子文件夹。请选择如何处理这些内容。`;
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

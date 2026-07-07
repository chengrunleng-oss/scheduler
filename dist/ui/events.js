import { coercePriority, normalizeText, toISODate } from "../domain.js";
import { createBackupBlob, parseBackupFile } from "../storage.js";
export function bindEvents(els, store, dialogs, requestRender) {
    function readTaskDraft() {
        return {
            title: normalizeText(els.taskTitle.value),
            priority: coercePriority(els.taskPriority.value),
            dueDate: els.taskDueDate.value,
            tag: normalizeText(els.taskTag.value),
        };
    }
    function resetTaskForm() {
        els.taskForm.reset();
        els.taskPriority.value = "medium";
        els.taskTitle.focus();
    }
    els.taskForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const draft = readTaskDraft();
        if (!draft.title)
            return;
        store.dispatch({ type: "add-task", draft });
        resetTaskForm();
    });
    els.taskForm.addEventListener("keydown", (event) => {
        if (event.ctrlKey && event.key === "Enter") {
            els.taskForm.requestSubmit();
        }
    });
    els.clearForm.addEventListener("click", resetTaskForm);
    els.searchInput.addEventListener("input", requestRender);
    els.filters.forEach((button) => {
        button.addEventListener("click", () => {
            store.dispatch({ type: "set-filter", filter: (button.dataset.filter || "all") });
        });
    });
    els.themeSelect.addEventListener("change", () => {
        store.dispatch({ type: "set-theme", theme: els.themeSelect.value });
    });
    els.taskList.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.type !== "checkbox")
            return;
        const taskId = target.closest(".task-item")?.dataset.id;
        if (!taskId)
            return;
        store.dispatch({ type: "toggle-task", id: taskId, done: target.checked });
    });
    els.taskList.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button)
            return;
        const taskId = button.closest(".task-item")?.dataset.id;
        const task = store.getState().tasks.find((item) => item.id === taskId);
        if (!task)
            return;
        if (button.dataset.action === "delete") {
            const confirmed = await dialogs.confirm("删除任务", `确认删除“${task.title}”吗？`);
            if (confirmed)
                store.dispatch({ type: "delete-task", id: task.id });
            return;
        }
        if (button.dataset.action === "edit") {
            const draft = await dialogs.editTask(task);
            if (draft)
                store.dispatch({ type: "update-task", id: task.id, draft });
        }
    });
    els.doneLog.addEventListener("click", (event) => handleChecklistEvent(event, "completed"));
    els.nextPlan.addEventListener("click", (event) => handleChecklistEvent(event, "next"));
    els.addDoneItem.addEventListener("click", async () => {
        const text = await dialogs.addChecklistItem("completed");
        if (text)
            store.dispatch({ type: "add-checklist-item", kind: "completed", text });
    });
    els.addNextItem.addEventListener("click", async () => {
        const text = await dialogs.addChecklistItem("next");
        if (text)
            store.dispatch({ type: "add-checklist-item", kind: "next", text });
    });
    els.applyFeedback.addEventListener("click", () => {
        const feedback = normalizeText(els.feedbackInput.value);
        if (!feedback) {
            els.feedbackInput.focus();
            return;
        }
        store.dispatch({ type: "apply-feedback", feedback });
        els.feedbackInput.value = "";
        dialogs.toast("反馈已整理为改进项。");
    });
    els.completeIteration.addEventListener("click", () => {
        store.dispatch({ type: "complete-iteration", feedback: normalizeText(els.feedbackInput.value) });
        els.feedbackInput.value = "";
        dialogs.toast("本轮已归档。");
    });
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
        if (!file)
            return;
        const text = await file.text();
        const result = parseBackupFile(text);
        if (!result.recovered) {
            dialogs.toast(result.message);
            return;
        }
        const confirmed = await dialogs.confirm("导入备份", "导入会替换当前浏览器里的数据，继续吗？");
        if (confirmed) {
            store.dispatch({ type: "replace-state", state: result.state });
            dialogs.toast(result.message);
        }
    });
    els.resetDemo.addEventListener("click", async () => {
        const confirmed = await dialogs.confirm("重置示例数据", "重置会清除当前浏览器里的记录，继续吗？");
        if (confirmed) {
            store.dispatch({ type: "reset" });
            els.searchInput.value = "";
            dialogs.toast("已恢复示例数据。");
        }
    });
    function handleChecklistEvent(event, kind) {
        const row = event.target.closest(".check-row");
        if (!row?.dataset.id)
            return;
        if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
            store.dispatch({ type: "toggle-checklist-item", kind, id: row.dataset.id, checked: event.target.checked });
        }
        if (event.target.closest("button")) {
            store.dispatch({ type: "delete-checklist-item", kind, id: row.dataset.id });
        }
    }
    return {
        getQuery: () => els.searchInput.value,
    };
}

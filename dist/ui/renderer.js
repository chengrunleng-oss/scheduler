import { isDueOrOverdue, PRIORITY_LABELS, selectVisibleTasks, toISODate } from "../domain.js";
import { createElement, setChildren, setHidden } from "./dom.js";
export function createRenderer(els) {
    const taskNodes = new Map();
    function render(state, previous, query, canUndo, canRedo) {
        applyTheme(state.preferences.theme);
        renderHeader(state);
        renderControls(state, canUndo, canRedo);
        renderMetrics(state);
        renderTasks(state, previous, query, taskNodes, els);
        renderChecklist(els.doneLog, state.currentIteration.completed, "completed");
        renderChecklist(els.nextPlan, state.currentIteration.next, "next");
        renderHistory(state);
    }
    return {
        render,
        clearTaskCache() {
            taskNodes.clear();
        },
    };
    function renderHeader(state) {
        els.currentIterationTitle.textContent = `第 ${state.currentIteration.number} 轮：${state.currentIteration.title}`;
    }
    function renderControls(state, canUndo, canRedo) {
        els.filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.preferences.activeFilter));
        els.themeSelect.value = state.preferences.theme;
        els.undoAction.disabled = !canUndo;
        els.redoAction.disabled = !canRedo;
    }
    function renderMetrics(state) {
        const today = toISODate();
        els.metricOpen.textContent = String(state.tasks.filter((task) => !task.done).length);
        els.metricDone.textContent = String(state.tasks.filter((task) => task.done).length);
        els.metricDue.textContent = String(state.tasks.filter((task) => isDueOrOverdue(task, today)).length);
    }
    function renderHistory(state) {
        els.iterationHistory.replaceChildren();
        els.iterationCount.textContent = `${state.iterations.length} 条`;
        if (state.iterations.length === 0) {
            const empty = createElement("article", { className: "history-item" });
            const title = createElement("strong", { text: "暂无历史" });
            const note = createElement("small", { text: "点击“归档本轮”后会生成记录。" });
            empty.append(title, note);
            els.iterationHistory.append(empty);
            return;
        }
        for (const item of [...state.iterations].reverse()) {
            const node = createElement("article", { className: "history-item" });
            const title = createElement("strong", { text: `第 ${item.number} 轮：${item.title}` });
            const finished = createElement("small", { text: formatDateTime(item.finishedAt) });
            const completed = createElement("p");
            setChildren(completed, [createElement("b", { text: "完成：" }), item.completed.join("；") || "未填写"]);
            const next = createElement("p");
            setChildren(next, [createElement("b", { text: "下一轮：" }), item.next.join("；") || "未填写"]);
            node.append(title, finished, completed, next);
            if (item.feedback) {
                const feedback = createElement("p");
                setChildren(feedback, [createElement("b", { text: "反馈：" }), item.feedback]);
                node.append(feedback);
            }
            els.iterationHistory.append(node);
        }
    }
}
function renderTasks(state, _previous, query, taskNodes, els) {
    const visibleTasks = selectVisibleTasks(state, query);
    const visibleIds = new Set(visibleTasks.map((task) => task.id));
    for (const [id, node] of taskNodes) {
        if (!state.tasks.some((task) => task.id === id)) {
            node.remove();
            taskNodes.delete(id);
        }
    }
    for (const child of Array.from(els.taskList.children)) {
        const taskId = child.dataset.id;
        if (!taskId || !visibleIds.has(taskId))
            child.remove();
    }
    visibleTasks.forEach((task, targetIndex) => {
        const node = taskNodes.get(task.id) ?? createTaskNode(els);
        updateTaskNode(node, task);
        taskNodes.set(task.id, node);
        const currentNodeAtIndex = els.taskList.children.item(targetIndex);
        if (currentNodeAtIndex !== node) {
            els.taskList.insertBefore(node, currentNodeAtIndex);
        }
    });
    setHidden(els.emptyState, visibleTasks.length > 0);
}
function createTaskNode(els) {
    const node = els.taskTemplate.content.firstElementChild?.cloneNode(true);
    if (!(node instanceof HTMLElement)) {
        throw new Error("Task template is invalid.");
    }
    return node;
}
function updateTaskNode(node, task) {
    const checkbox = node.querySelector('input[type="checkbox"]');
    const title = node.querySelector("strong");
    const meta = node.querySelector("small");
    const priority = node.querySelector(".priority");
    const time = node.querySelector("time");
    if (!checkbox || !title || !meta || !priority || !time) {
        throw new Error("Task node is missing required children.");
    }
    node.dataset.id = task.id;
    node.classList.toggle("done", task.done);
    node.classList.toggle("due", isDueOrOverdue(task));
    checkbox.checked = task.done;
    title.textContent = task.title;
    meta.textContent = task.tag ? `#${task.tag}` : "未设置标签";
    priority.textContent = PRIORITY_LABELS[task.priority];
    priority.className = `priority ${task.priority}`;
    time.textContent = formatDueDate(task);
    time.dateTime = task.dueDate;
}
function renderChecklist(container, items, kind) {
    container.replaceChildren();
    for (const item of items) {
        const row = createElement("div", { className: "check-row" });
        row.dataset.id = item.id;
        row.dataset.kind = kind;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.checked;
        const text = createElement("span", { text: item.text });
        const remove = createElement("button", { className: "icon-button danger", text: "×", title: "删除" });
        remove.type = "button";
        remove.setAttribute("aria-label", "删除");
        row.append(checkbox, text, remove);
        container.append(row);
    }
}
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
function formatDueDate(task) {
    if (!task.dueDate)
        return "未定";
    const date = new Date(`${task.dueDate}T00:00:00`);
    const label = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
    return isDueOrOverdue(task) ? `${label} 到期` : label;
}
function formatDateTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

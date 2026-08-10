import { dueDateGroup, getFolderDepth, getFolderDescendantIds, isDueOrOverdue, MAX_FOLDER_DEPTH, PRIORITY_LABELS, selectVisibleTasks, STATUS_LABELS, taskComparator, toISODate, } from "../domain.js";
import { createElement, setHidden } from "./dom.js";
export function createRenderer(els) {
    return {
        render(state, view, canUndo, canRedo) {
            applyTheme(state.preferences.theme);
            renderControls(state, canUndo, canRedo);
            renderMetrics(state);
            renderFolderControls(state);
            renderTasks(state, view);
            renderDetail(state, view);
        },
    };
    function renderControls(state, canUndo, canRedo) {
        els.statusFilters.forEach((item) => {
            const active = item.dataset.filter === state.preferences.activeStatusFilter;
            item.classList.toggle("active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        els.viewModes.forEach((item) => {
            const active = item.dataset.view === state.preferences.viewMode;
            item.classList.toggle("active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        els.themeSelect.value = state.preferences.theme;
        els.sortMode.value = state.preferences.sortMode;
        els.undoAction.disabled = !canUndo;
        els.redoAction.disabled = !canRedo;
        if (state.preferences.folderScope === "all") {
            els.workspaceTitle.textContent = "全部任务";
        }
        else if (state.preferences.folderScope === "root") {
            els.workspaceTitle.textContent = "未分类";
        }
        else {
            els.workspaceTitle.textContent = state.folders.find((folder) => folder.id === state.preferences.folderScope)?.name ?? "全部任务";
        }
    }
    function renderMetrics(state) {
        const today = toISODate();
        els.metricActive.textContent = String(state.tasks.filter((task) => task.status === "active").length);
        els.metricCompleted.textContent = String(state.tasks.filter((task) => task.status === "completed").length);
        els.metricDiscarded.textContent = String(state.tasks.filter((task) => task.status === "discarded").length);
        els.metricDue.textContent = String(state.tasks.filter((task) => isDueOrOverdue(task, today)).length);
    }
    function renderFolderControls(state) {
        renderFolderTree(state, els.folderTree);
        fillFolderSelect(els.taskFolder, state.folders, els.taskFolder.value, "未分类");
    }
    function renderTasks(state, view) {
        const visibleTasks = selectVisibleTasks(state, view.query);
        els.taskList.replaceChildren();
        if (state.preferences.viewMode === "tree") {
            renderTreeView(state, visibleTasks, view, els.taskList);
        }
        else if (state.preferences.viewMode === "priority") {
            renderPriorityView(state, visibleTasks, view, els.taskList);
        }
        else {
            renderDueDateView(state, visibleTasks, view, els.taskList);
        }
        setHidden(els.emptyState, visibleTasks.length > 0);
    }
    function renderDetail(state, view) {
        const task = state.tasks.find((item) => item.id === view.selectedTaskId);
        const hasTask = Boolean(task);
        setHidden(els.detailEmpty, hasTask);
        setHidden(els.detailForm, !hasTask);
        els.taskDetail.classList.toggle("is-open", hasTask && view.detailPanelOpen);
        if (!task)
            return;
        fillFolderSelect(els.detailFolder, state.folders, view.detailDirty ? els.detailFolder.value : task.folderId ?? "", "未分类");
        if (view.detailDirty)
            return;
        els.detailTitle.value = task.title;
        els.detailNotes.value = task.notes;
        els.detailStatus.value = task.status;
        els.detailPriority.value = task.priority;
        els.detailFolder.value = task.folderId ?? "";
        els.detailDueDate.value = task.dueDate;
        els.detailTag.value = task.tag;
        els.detailCreatedAt.textContent = formatDateTime(task.createdAt);
        els.detailUpdatedAt.textContent = formatDateTime(task.updatedAt);
    }
}
function renderFolderTree(state, container) {
    container.replaceChildren();
    container.append(createScopeRow("all", "全部任务", state.tasks.length, state.preferences.folderScope === "all"), createScopeRow("root", "未分类", state.tasks.filter((task) => task.folderId === null).length, state.preferences.folderScope === "root"));
    const childrenByParent = groupFoldersByParent(state.folders);
    const appendFolder = (folder, depth) => {
        const children = childrenByParent.get(folder.id) ?? [];
        const descendantIds = getFolderDescendantIds(state.folders, folder.id);
        const count = state.tasks.filter((task) => task.folderId === folder.id || Boolean(task.folderId && descendantIds.has(task.folderId))).length;
        const row = createElement("div", { className: `folder-row${state.preferences.folderScope === folder.id ? " selected" : ""}` });
        row.style.setProperty("--depth", String(depth));
        const toggle = createElement("button", {
            className: "folder-toggle",
            text: children.length > 0 ? (folder.collapsed ? "›" : "⌄") : "",
            title: folder.collapsed ? "展开文件夹" : "折叠文件夹",
        });
        toggle.type = "button";
        toggle.dataset.action = "toggle-folder";
        toggle.dataset.folderId = folder.id;
        toggle.setAttribute("aria-label", folder.collapsed ? "展开文件夹" : "折叠文件夹");
        toggle.disabled = children.length === 0;
        const name = createElement("button", { className: "folder-name", title: folder.name });
        name.type = "button";
        name.dataset.action = "select-folder";
        name.dataset.folderId = folder.id;
        name.append(document.createTextNode(folder.name), createElement("span", { className: "folder-count", text: String(count) }));
        const actions = createElement("span", { className: "folder-actions" });
        actions.append(createFolderAction("add-child-folder", folder.id, "＋", "新建子文件夹", getFolderDepth(state.folders, folder.id) >= MAX_FOLDER_DEPTH), createFolderAction("edit-folder", folder.id, "✎", "编辑文件夹"), createFolderAction("delete-folder", folder.id, "×", "删除文件夹"));
        row.append(toggle, name, actions);
        container.append(row);
        if (!folder.collapsed) {
            for (const child of children)
                appendFolder(child, depth + 1);
        }
    };
    for (const folder of childrenByParent.get(null) ?? [])
        appendFolder(folder, 0);
}
function createScopeRow(scope, label, count, selected) {
    const row = createElement("div", { className: `folder-row root-folder-row${selected ? " selected" : ""}` });
    const icon = createElement("span", { className: "folder-toggle", text: scope === "all" ? "≡" : "⌂" });
    const button = createElement("button", { className: "folder-name", title: label });
    button.type = "button";
    button.dataset.action = "select-folder";
    button.dataset.folderId = scope;
    button.append(document.createTextNode(label), createElement("span", { className: "folder-count", text: String(count) }));
    row.append(icon, button);
    return row;
}
function createFolderAction(action, folderId, text, label, disabled = false) {
    const button = createElement("button", { className: "folder-action", text, title: label });
    button.type = "button";
    button.dataset.action = action;
    button.dataset.folderId = folderId;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    return button;
}
function renderTreeView(state, visibleTasks, view, container) {
    const childrenByParent = groupFoldersByParent(state.folders);
    const visibleIds = new Set(visibleTasks.map((task) => task.id));
    const showEmptyFolders = !view.query && state.preferences.activeStatusFilter === "all";
    const appendTasks = (folderId, depth) => {
        for (const task of visibleTasks.filter((item) => item.folderId === folderId)) {
            container.append(createTaskNode(task, view.selectedTaskId, depth, state.folders, Boolean(view.query)));
        }
    };
    const appendFolder = (folder, depth) => {
        const descendantIds = getFolderDescendantIds(state.folders, folder.id);
        const taskCount = visibleTasks.filter((task) => task.folderId === folder.id || Boolean(task.folderId && descendantIds.has(task.folderId))).length;
        if (!showEmptyFolders && taskCount === 0)
            return;
        const heading = createElement("div", { className: "group-heading tree-group-heading" });
        heading.style.setProperty("--group-depth", String(depth));
        const toggle = createElement("button", {
            className: "folder-toggle",
            text: folder.collapsed && !view.query ? "›" : "⌄",
            title: folder.collapsed ? "展开文件夹" : "折叠文件夹",
        });
        toggle.type = "button";
        toggle.dataset.action = "toggle-folder";
        toggle.dataset.folderId = folder.id;
        toggle.setAttribute("aria-label", folder.collapsed ? "展开文件夹" : "折叠文件夹");
        heading.append(toggle, document.createTextNode(folder.name), createElement("span", { className: "group-count", text: String(taskCount) }));
        container.append(heading);
        if (folder.collapsed && !view.query)
            return;
        appendTasks(folder.id, depth + 1);
        for (const child of childrenByParent.get(folder.id) ?? [])
            appendFolder(child, depth + 1);
    };
    if (state.preferences.folderScope === "root") {
        appendTasks(null, 0);
        return;
    }
    if (state.preferences.folderScope !== "all") {
        const selectedFolder = state.folders.find((folder) => folder.id === state.preferences.folderScope);
        if (selectedFolder)
            appendFolder(selectedFolder, 0);
        return;
    }
    appendTasks(null, 0);
    for (const folder of childrenByParent.get(null) ?? [])
        appendFolder(folder, 0);
    // Guard against a malformed state hiding tasks with orphaned folder references.
    for (const task of state.tasks) {
        if (visibleIds.has(task.id) && task.folderId && !state.folders.some((folder) => folder.id === task.folderId)) {
            container.append(createTaskNode(task, view.selectedTaskId, 0, state.folders, Boolean(view.query)));
        }
    }
}
function renderPriorityView(state, tasks, view, container) {
    const groups = [
        ["high", "高优先级"],
        ["medium", "中优先级"],
        ["low", "低优先级"],
    ];
    for (const [priority, label] of groups) {
        const members = tasks.filter((task) => task.priority === priority);
        if (members.length === 0)
            continue;
        container.append(createGroupHeading(label, members.length));
        for (const task of members.sort(taskComparator(state.preferences.sortMode))) {
            container.append(createTaskNode(task, view.selectedTaskId, 0, state.folders, Boolean(view.query)));
        }
    }
}
function renderDueDateView(state, tasks, view, container) {
    const groups = [
        ["overdue", "已逾期"],
        ["today", "今天"],
        ["next_seven_days", "未来七天"],
        ["later", "更晚"],
        ["unscheduled", "未设置日期"],
    ];
    const today = toISODate();
    for (const [group, label] of groups) {
        const members = tasks.filter((task) => dueDateGroup(task, today) === group);
        if (members.length === 0)
            continue;
        container.append(createGroupHeading(label, members.length));
        for (const task of members.sort(taskComparator(state.preferences.sortMode))) {
            container.append(createTaskNode(task, view.selectedTaskId, 0, state.folders, Boolean(view.query)));
        }
    }
}
function createGroupHeading(label, count) {
    const heading = createElement("div", { className: "group-heading" });
    heading.append(document.createTextNode(label), createElement("span", { className: "group-count", text: String(count) }));
    return heading;
}
function createTaskNode(task, selectedTaskId, depth, folders, searchMatch = false) {
    const selected = task.id === selectedTaskId;
    const taskDueGroup = task.status === "active" ? dueDateGroup(task, toISODate()) : null;
    const node = createElement("article", {
        className: `task-item ${task.status}${selected ? " selected" : ""}${searchMatch ? " search-match" : ""}${taskDueGroup === "overdue" ? " overdue" : ""}${taskDueGroup === "today" ? " due-today" : ""}`,
    });
    node.dataset.id = task.id;
    node.tabIndex = 0;
    node.setAttribute("role", "option");
    node.setAttribute("aria-selected", String(selected));
    node.setAttribute("aria-label", `${task.title}，${STATUS_LABELS[task.status]}，${PRIORITY_LABELS[task.priority]}优先级`);
    const main = createElement("div", { className: "task-main" });
    const titleLine = createElement("div", { className: "task-title-line" });
    titleLine.style.setProperty("--task-depth", String(depth));
    titleLine.append(createElement("span", { className: "status-dot" }), createElement("strong", { text: task.title }));
    const folderName = task.folderId ? folders.find((folder) => folder.id === task.folderId)?.name : "未分类";
    const metaParts = [task.tag ? `#${task.tag}` : "无标签", STATUS_LABELS[task.status], folderName ?? "未分类"];
    main.append(titleLine, createElement("small", { text: metaParts.join(" · ") }));
    const priority = createElement("span", { className: `priority ${task.priority}`, text: PRIORITY_LABELS[task.priority] });
    const time = createElement("time", { text: formatDueDate(task) });
    time.dateTime = task.dueDate;
    const actions = createTaskActions(task);
    node.append(main, priority, time, actions);
    return node;
}
function createTaskActions(task) {
    const actions = createElement("div", { className: "task-actions" });
    if (task.status === "active") {
        actions.append(createTaskAction("complete", "✓", "移至已完成"), createTaskAction("discard", "∅", "移至不再需要"));
    }
    else {
        actions.append(createTaskAction("restore", "↺", "恢复为待办"));
    }
    actions.append(createTaskAction("raise-priority", "↑", "提高优先级", task.priority === "high"), createTaskAction("lower-priority", "↓", "降低优先级", task.priority === "low"), createTaskAction("delete", "×", "删除任务", false, true));
    return actions;
}
function createTaskAction(action, text, label, disabled = false, danger = false) {
    const button = createElement("button", { className: `icon-button${danger ? " danger" : ""}`, text, title: label });
    button.type = "button";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    return button;
}
function fillFolderSelect(select, folders, selectedValue, rootLabel) {
    select.replaceChildren(new Option(rootLabel, ""));
    const sorted = [...folders].sort((a, b) => getFolderDepth(folders, a.id) - getFolderDepth(folders, b.id) || a.order - b.order);
    for (const folder of sorted) {
        const depth = getFolderDepth(folders, folder.id);
        select.add(new Option(`${"  ".repeat(Math.max(0, depth - 1))}${folder.name}`, folder.id));
    }
    select.value = Array.from(select.options).some((option) => option.value === selectedValue) ? selectedValue : "";
}
function groupFoldersByParent(folders) {
    const result = new Map();
    for (const folder of folders) {
        const siblings = result.get(folder.parentId) ?? [];
        siblings.push(folder);
        result.set(folder.parentId, siblings);
    }
    for (const siblings of result.values())
        siblings.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    return result;
}
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
}
function formatDueDate(task) {
    if (!task.dueDate)
        return "无截止日期";
    const date = new Date(`${task.dueDate}T00:00:00`);
    const label = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
    if (task.status === "active") {
        const group = dueDateGroup(task, toISODate());
        if (group === "overdue")
            return `逾期 · ${label}`;
        if (group === "today")
            return "今天截止";
    }
    return `${label} 截止`;
}
function formatDateTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(timestamp));
}

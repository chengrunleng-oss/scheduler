import {
  dueDateGroup,
  getFolderDepth,
  getFolderDescendantIds,
  getFolderPath,
  isDueOrOverdue,
  isOverdue,
  MAX_FOLDER_DEPTH,
  overdueDays,
  PRIORITY_LABELS,
  resolveDefaultDueDate,
  selectVisibleTasks,
  STATUS_LABELS,
  taskComparator,
  toISODate,
} from "../domain.js";
import type { AppState, Folder, Priority, Task, ThemeMode, WorkspaceTab } from "../types.js";
import { createElement, setHidden } from "./dom.js";
import { icon, type IconName } from "./icons.js";
import type { Elements } from "./selectors.js";

export interface InlineCreateState {
  kind: "task" | "folder";
  folderId: string | null;
}

export interface ViewState {
  query: string;
  selectedTaskId: string | null;
  detailPanelOpen: boolean;
  detailDirty: boolean;
  workspaceTab: WorkspaceTab;
  inlineCreate: InlineCreateState | null;
  flashTaskId: string | null;
}

export interface Renderer {
  render(state: AppState, view: ViewState, canUndo: boolean, canRedo: boolean): void;
}

export function createRenderer(els: Elements): Renderer {
  return {
    render(state, view, canUndo, canRedo) {
      applyTheme(state.preferences.theme);
      renderControls(state, view, canUndo, canRedo);
      renderMetrics(state);
      renderFolderControls(state);
      renderTasks(state, view);
      renderDetail(state, view);
    },
  };

  function renderControls(state: AppState, view: ViewState, canUndo: boolean, canRedo: boolean): void {
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
    els.defaultDueDate.value = state.preferences.defaultTaskDueDate;
    els.defaultPriority.value = state.preferences.defaultTaskPriority;
    const preferredWorkspaceWidth = Number.isFinite(state.preferences.workspaceWidth) ? state.preferences.workspaceWidth : 620;
    // TEST-V08-017：1180px 起即可拖拽调节工作区宽度；1180-1339 使用图标导航（72px）与更窄的任务列表。
    let workspaceWidth = preferredWorkspaceWidth;
    if (window.innerWidth >= 1340) workspaceWidth = Math.min(680, Math.max(480, preferredWorkspaceWidth), Math.max(480, window.innerWidth - 732));
    else if (window.innerWidth >= 1180) workspaceWidth = Math.min(680, Math.max(560, preferredWorkspaceWidth), Math.max(560, window.innerWidth - 492));
    document.documentElement.style.setProperty("--workspace-width", `${workspaceWidth}px`);
    const workspaceOpen = view.detailPanelOpen && Boolean(view.selectedTaskId);
    els.appShell.classList.toggle("workspace-open", workspaceOpen);
    els.undoAction.disabled = !canUndo;
    els.redoAction.disabled = !canRedo;
    const dragEnabled = isDragMode(state, view);
    els.dragHint.textContent = dragEnabled ? "可拖动待办任务和左侧优先级标签" : "切换到无搜索的任务树待办视图可拖动";
    els.dragHint.classList.toggle("is-disabled", !dragEnabled);
    if (state.preferences.folderScope === "all") els.workspaceTitle.textContent = "全部任务";
    else if (state.preferences.folderScope === "root") els.workspaceTitle.textContent = "未分类";
    else els.workspaceTitle.textContent = state.folders.find((folder) => folder.id === state.preferences.folderScope)?.name ?? "全部任务";
  }

  function renderMetrics(state: AppState): void {
    const today = toISODate();
    els.metricActive.textContent = String(state.tasks.filter((task) => task.status === "active").length);
    els.metricCompleted.textContent = String(state.tasks.filter((task) => task.status === "completed").length);
    els.metricDiscarded.textContent = String(state.tasks.filter((task) => task.status === "discarded").length);
    els.metricDue.textContent = String(state.tasks.filter((task) => isDueOrOverdue(task, today)).length);
  }

  function renderFolderControls(state: AppState): void {
    renderFolderTree(state, els.folderTree);
  }

  function renderTasks(state: AppState, view: ViewState): void {
    const visibleTasks = selectVisibleTasks(state, view.query);
    els.taskList.replaceChildren();
    if (state.preferences.viewMode === "tree_manual") renderTreeView(state, visibleTasks, view, els.taskList);
    else renderGlobalView(state, visibleTasks, view, els.taskList);
    setHidden(els.emptyState, visibleTasks.length > 0);
    requestAnimationFrame(() => {
      els.taskList.querySelector<HTMLInputElement>(".inline-create input[name='title']")?.focus();
    });
  }

  function renderDetail(state: AppState, view: ViewState): void {
    const task = state.tasks.find((item) => item.id === view.selectedTaskId);
    setHidden(els.detailEmpty, Boolean(task));
    setHidden(els.workspaceContent, !task);
    setHidden(els.workspaceTabs, !task);
    els.taskDetail.classList.toggle("is-open", Boolean(task) && view.detailPanelOpen);
    els.workspaceTabButtons.forEach((button) => {
      const active = button.dataset.workspaceTab === view.workspaceTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    els.workspacePanels.forEach((panel) => {
      const active = panel.id === `${view.workspaceTab}Panel`;
      panel.classList.toggle("active", active);
      setHidden(panel, !active);
    });
    if (!task) return;
    fillFolderSelect(els.detailFolder, state.folders, view.detailDirty ? els.detailFolder.value : task.folderId ?? "", "未分类");
    els.detailStatusBadge.className = `detail-status ${task.status}${task.pendingResolution ? " pending" : ""}`;
    els.detailStatusBadge.textContent = task.pendingResolution ? `${STATUS_LABELS[task.status]} · 等待确认` : STATUS_LABELS[task.status];
    els.overviewSaveStatus.textContent = view.detailDirty ? "未保存" : "已保存";
    els.overviewSaveStatus.className = `save-status${view.detailDirty ? " dirty" : ""}`;
    setHidden(els.timelineSection, task.rescheduleHistory.length + task.statusHistory.length === 0);
    renderTimeline(task, els.rescheduleTimeline);
    if (view.detailDirty) return;
    // TEST-V08-018：正在编辑（聚焦中）的字段不被重绘覆盖，避免保存规范化后
    // 的值把用户刚敲入的空格/回车抹掉。
    const writeIfNotEditing = (field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
      if (document.activeElement !== field) field.value = value;
    };
    writeIfNotEditing(els.detailTitle, task.title);
    writeIfNotEditing(els.detailNotes, task.notes);
    writeIfNotEditing(els.detailPriority, task.priority);
    writeIfNotEditing(els.detailFolder, task.folderId ?? "");
    writeIfNotEditing(els.detailDueDate, task.dueDate);
    writeIfNotEditing(els.detailTag, task.tag);
    writeIfNotEditing(els.detailRescheduleReason, "");
    els.detailCreatedAt.textContent = formatDateTime(task.createdAt);
    els.detailUpdatedAt.textContent = formatDateTime(task.updatedAt);
  }
}

function renderFolderTree(state: AppState, container: HTMLElement): void {
  container.replaceChildren();
  container.append(
    createScopeRow("all", "全部任务", state.tasks.length, state.preferences.folderScope === "all", "Folder"),
    createScopeRow("root", "未分类", state.tasks.filter((task) => task.folderId === null).length, state.preferences.folderScope === "root", "ListPlus"),
  );
  const childrenByParent = groupFoldersByParent(state.folders);
  const appendFolder = (folder: Folder, depth: number) => {
    const children = childrenByParent.get(folder.id) ?? [];
    const navCollapsed = state.preferences.navigationCollapsedFolders.includes(folder.id);
    const descendantIds = getFolderDescendantIds(state.folders, folder.id);
    const count = state.tasks.filter((task) => task.folderId === folder.id || Boolean(task.folderId && descendantIds.has(task.folderId))).length;
    const row = createElement("div", { className: `folder-row${state.preferences.folderScope === folder.id ? " selected" : ""}` });
    row.style.setProperty("--depth", String(depth));
    const toggle = iconButton("toggle-navigation-folder", navCollapsed ? "ChevronRight" : "ChevronDown", navCollapsed ? "展开导航文件夹" : "折叠导航文件夹", "folder-toggle");
    toggle.dataset.folderId = folder.id;
    toggle.disabled = children.length === 0;
    const name = createElement("button", { className: "folder-name", title: folder.name });
    name.type = "button";
    name.dataset.action = "select-folder";
    name.dataset.folderId = folder.id;
    name.append(icon("Folder", 16), document.createTextNode(folder.name), createElement("span", { className: "folder-count", text: String(count) }));
    const actions = createElement("span", { className: "folder-actions" });
    const addTask = iconButton("start-inline-task", "ListPlus", "在此文件夹新建任务", "folder-action create-task-action");
    disableWithoutWorkspace(addTask);
    addTask.dataset.folderId = folder.id;
    const addFolder = iconButton("start-inline-folder", "FolderPlus", "新建子文件夹", "folder-action create-folder-action");
    addFolder.dataset.folderId = folder.id;
    addFolder.disabled = getFolderDepth(state.folders, folder.id) >= MAX_FOLDER_DEPTH;
    disableWithoutWorkspace(addFolder);
    const edit = iconButton("edit-folder", "FolderPen", "编辑文件夹", "folder-action");
    edit.dataset.folderId = folder.id;
    const remove = iconButton("delete-folder", "Trash2", "删除文件夹", "folder-action danger");
    remove.dataset.folderId = folder.id;
    actions.append(addTask, addFolder, edit, remove);
    row.append(toggle, name, actions);
    container.append(row);
    if (!navCollapsed) for (const child of children) appendFolder(child, depth + 1);
  };
  for (const folder of childrenByParent.get(null) ?? []) appendFolder(folder, 0);
}

function createScopeRow(scope: "all" | "root", label: string, count: number, selected: boolean, iconName: IconName): HTMLElement {
  const row = createElement("div", { className: `folder-row root-folder-row${selected ? " selected" : ""}` });
  const button = createElement("button", { className: "folder-name", title: label });
  button.type = "button";
  button.dataset.action = "select-folder";
  button.dataset.folderId = scope;
  button.append(icon(iconName, 16), document.createTextNode(label), createElement("span", { className: "folder-count", text: String(count) }));
  row.append(createElement("span", { className: "folder-toggle-spacer" }), button);
  return row;
}

function renderTreeView(state: AppState, visibleTasks: Task[], view: ViewState, container: HTMLElement): void {
  const childrenByParent = groupFoldersByParent(state.folders);
  const showEmpty = !view.query && state.preferences.activeStatusFilter === "all";
  const appendContainer = (folder: Folder | null, depth: number, parent: HTMLElement, includeRootFolders = false) => {
    const folderId = folder?.id ?? null;
    const descendants = folder ? getFolderDescendantIds(state.folders, folder.id) : new Set<string>();
    const direct = visibleTasks.filter((task) => task.folderId === folderId);
    const branchCount = folder
      ? visibleTasks.filter((task) => task.folderId === folder.id || Boolean(task.folderId && descendants.has(task.folderId))).length
      : includeRootFolders ? visibleTasks.length : direct.length;
    if (!showEmpty && branchCount === 0 && view.inlineCreate?.folderId !== folderId) return;
    const sortableCount = direct.filter((task) => task.status === "active" && !isOverdue(task)).length;
    const heading = createTreeHeading(state, folder, folder ? branchCount : direct.length, sortableCount, depth);
    const layer = folder ? Math.max(1, Math.min(4, getFolderDepth(state.folders, folder.id))) : 0;
    const branch = createElement("section", { className: `tree-container tree-depth-${layer}${folder ? " folder-container" : " root-container"}` });
    branch.dataset.treeFolderId = folderId ?? "root";
    branch.style.setProperty("--tree-depth", String(depth));
    const contents = createElement("div", { className: "tree-container-contents" });
    if (folder?.collapsed && !view.query) contents.hidden = true;
    branch.append(heading, contents);
    parent.append(branch);
    if (folder && view.inlineCreate?.folderId === folderId) contents.append(createInlineForm(state, view.inlineCreate));
    renderDirectTasks(state, direct, view, folderId, depth + 1, contents);
    if (folder) for (const child of childrenByParent.get(folder.id) ?? []) appendContainer(child, depth + 1, contents);
    else if (includeRootFolders) for (const child of childrenByParent.get(null) ?? []) appendContainer(child, depth, contents);
    if (!view.query && state.preferences.activeStatusFilter === "all") renderHandledSection(state, direct, view, folderId, depth + 1, contents);
  };
  if (state.preferences.folderScope === "root") {
    appendContainer(null, 0, container);
    if (view.inlineCreate?.folderId === null) container.append(createInlineForm(state, view.inlineCreate));
    container.append(createRootCreateActions());
  }
  else if (state.preferences.folderScope !== "all") {
    const folder = state.folders.find((item) => item.id === state.preferences.folderScope);
    if (folder) appendContainer(folder, 0, container);
  } else {
    appendContainer(null, 0, container, true);
    if (view.inlineCreate?.folderId === null) container.append(createInlineForm(state, view.inlineCreate));
    container.append(createRootCreateActions());
  }
}

function createTreeHeading(state: AppState, folder: Folder | null, count: number, sortableCount: number, depth: number): HTMLElement {
  const folderId = folder?.id ?? null;
  const heading = createElement("div", { className: "group-heading tree-group-heading" });
  heading.style.setProperty("--group-depth", String(depth));
  heading.dataset.dropFolderId = folderId ?? "root";
  if (folder) {
    const toggle = iconButton("toggle-folder", folder.collapsed ? "ChevronRight" : "ChevronDown", folder.collapsed ? "展开文件夹" : "折叠文件夹", "folder-toggle");
    toggle.dataset.folderId = folder.id;
    heading.append(toggle);
    // TEST-V08-011：整个文件夹头部都可点击切换展开/折叠（按钮以外的区域）。
    heading.dataset.toggleFolderId = folder.id;
    heading.title = folder.collapsed ? "展开文件夹" : "折叠文件夹";
  } else heading.append(createElement("span", { className: "folder-toggle-spacer" }));
  const label = createElement("strong", { text: folder?.name ?? "未分类" });
  heading.append(icon("Folder", 16), label, createElement("span", { className: "group-count", text: String(count) }));
  const actions = createElement("span", { className: "group-actions" });
  if (folder) {
    const addTask = iconButton("start-inline-task", "ListPlus", "在此处新建任务", "group-action create-task-action");
    disableWithoutWorkspace(addTask);
    addTask.dataset.folderId = folder.id;
    const addFolder = iconButton("start-inline-folder", "FolderPlus", "新建子文件夹", "group-action create-folder-action");
    addFolder.dataset.folderId = folder.id;
    addFolder.disabled = getFolderDepth(state.folders, folder.id) >= MAX_FOLDER_DEPTH;
    disableWithoutWorkspace(addFolder);
    actions.append(addTask, addFolder, createFolderMenu(folder));
  }
  if (sortableCount >= 2) {
    const suggest = iconButton("suggest-order", "CalendarPlus", "建议按截止日期整理", "group-action");
    suggest.dataset.folderId = folderId ?? "root";
    actions.append(suggest);
  }
  if (actions.childElementCount) heading.append(actions);
  return heading;
}

function createFolderMenu(folder: Folder): HTMLElement {
  const menu = createElement("details", { className: "folder-menu" });
  const trigger = createElement("summary", { className: "group-action folder-menu-trigger", title: `管理“${folder.name}”` });
  trigger.setAttribute("aria-label", `管理文件夹“${folder.name}”`);
  trigger.append(icon("MoreHorizontal"));
  const popup = createElement("div", { className: "folder-menu-popup" });
  const items = [
    ["rename-folder", "Pencil", "重命名"],
    ["move-folder", "FolderInput", "移动"],
    ["delete-folder", "Trash2", "删除"],
  ] as const;
  for (const [action, iconName, label] of items) {
    const button = createElement("button", { className: `folder-menu-item${action === "delete-folder" ? " danger" : ""}` });
    button.type = "button";
    button.dataset.action = action;
    button.dataset.folderId = folder.id;
    button.append(icon(iconName, 16), document.createTextNode(label));
    popup.append(button);
  }
  menu.append(trigger, popup);
  return menu;
}

function createRootCreateActions(): HTMLElement {
  const row = createElement("div", { className: "root-create-actions" });
  const addTask = iconButton("start-inline-task", "ListPlus", "新建未分类任务", "root-create-button create-task-action");
  disableWithoutWorkspace(addTask);
  addTask.dataset.folderId = "root";
  addTask.append(createElement("span", { text: "新建任务" }));
  const addFolder = iconButton("start-inline-folder", "FolderPlus", "新建根文件夹", "root-create-button create-folder-action");
  disableWithoutWorkspace(addFolder);
  addFolder.dataset.folderId = "root";
  addFolder.append(createElement("span", { text: "新建文件夹" }));
  row.append(addTask, addFolder);
  return row;
}

function disableWithoutWorkspace(button: HTMLButtonElement): void {
  button.dataset.workspaceAvailableTitle = button.title;
  button.dataset.workspaceConstraintDisabled = String(button.disabled);
  if (document.documentElement.dataset.workspaceWritable === "true") {
    button.setAttribute("aria-disabled", String(button.disabled));
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.title = "请先选择本地工作区目录";
}

function createInlineForm(state: AppState, inline: InlineCreateState): HTMLElement {
  const form = createElement("form", { className: `inline-create ${inline.kind}` });
  form.dataset.inlineKind = inline.kind;
  form.dataset.folderId = inline.folderId ?? "root";
  const input = document.createElement("input");
  input.name = "title";
  input.maxLength = inline.kind === "task" ? 180 : 48;
  input.placeholder = inline.kind === "task" ? "输入任务名称" : "输入文件夹名称";
  input.required = true;
  form.append(input);
  if (inline.kind === "task") {
    const priority = document.createElement("select");
    priority.name = "priority";
    priority.append(new Option("高", "high"), new Option("低", "low"));
    priority.value = state.preferences.defaultTaskPriority;
    const dueDate = document.createElement("input");
    dueDate.type = "date";
    dueDate.name = "dueDate";
    dueDate.value = resolveDefaultDueDate(state.preferences.defaultTaskDueDate);
    form.append(priority, dueDate);
  }
  const save = iconButton("save-inline", "Check", inline.kind === "task" ? "保存任务" : "保存文件夹");
  save.type = "submit";
  form.append(save, iconButton("cancel-inline", "X", "取消"));
  return form;
}

function renderDirectTasks(state: AppState, tasks: Task[], view: ViewState, folderId: string | null, depth: number, container: HTMLElement): void {
  const today = toISODate();
  const dragEnabled = isDragMode(state, view);
  if (view.query) {
    for (const task of tasks) container.append(createTaskNode(task, state, view, depth, false));
    return;
  }
  if (state.preferences.activeStatusFilter === "completed" || state.preferences.activeStatusFilter === "discarded") {
    for (const task of [...tasks].sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))) container.append(createTaskNode(task, state, view, depth, false));
    return;
  }
  const overdue = tasks.filter((task) => isOverdue(task, today)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdue.length) {
    container.append(createSubheading("逾期", overdue.length, "overdue-heading"));
    for (const task of overdue) container.append(createTaskNode(task, state, view, depth, false));
  }
  const pending = tasks.filter((task) => Boolean(task.pendingResolution) && !isOverdue(task, today));
  const ordinary = tasks.filter((task) => task.status === "active" && !isOverdue(task, today));
  const high = [...ordinary.filter((task) => task.priority === "high"), ...pending.filter((task) => task.priority === "high")].sort(stableTaskOrder);
  const low = [...ordinary.filter((task) => task.priority === "low"), ...pending.filter((task) => task.priority === "low")].sort(stableTaskOrder);
  for (const task of high) container.append(createTaskNode(task, state, view, depth, dragEnabled, false, "high"));
  if (state.preferences.activeStatusFilter !== "all" || ordinary.length || pending.length) container.append(createPriorityDivider(folderId, dragEnabled));
  for (const task of low) container.append(createTaskNode(task, state, view, depth, dragEnabled, false, "low"));
}

function createPriorityDivider(folderId: string | null, draggable: boolean): HTMLElement {
  const divider = createElement("div", { className: `priority-divider${draggable ? " is-draggable" : ""}` });
  divider.dataset.dividerFolderId = folderId ?? "root";
  divider.tabIndex = draggable ? 0 : -1;
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", "调整高优先级和低优先级分界");
  divider.title = "拖动调整优先级分界";
  const threshold = createElement("span", { className: "priority-threshold" });
  threshold.append(
    createElement("span", { className: "priority-threshold-high" }),
    createElement("span", { className: "priority-threshold-low" }),
    icon("GripHorizontal", 16),
  );
  divider.append(threshold);
  return divider;
}

function renderHandledSection(state: AppState, tasks: Task[], view: ViewState, folderId: string | null, depth: number, container: HTMLElement): void {
  const handled = tasks.filter((task) => task.status !== "active" && !task.pendingResolution).sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  if (!handled.length) return;
  const containerId = folderId ?? "root";
  const expanded = state.preferences.expandedHandledContainers.includes(containerId);
  const heading = createElement("button", { className: "handled-heading" });
  heading.type = "button";
  heading.dataset.action = "toggle-handled";
  heading.dataset.containerId = containerId;
  heading.setAttribute("aria-expanded", String(expanded));
  heading.append(icon(expanded ? "ChevronDown" : "ChevronRight", 16), document.createTextNode("已处理"), createElement("span", { text: String(handled.length) }));
  container.append(heading);
  // TEST-V08-016：折叠态完全收起全部已处理条目（不再保留“最新 3 条”预览），
  // 少量已完成条目时点击折叠才有明确可见效果；展开态显示全部。
  if (expanded) for (const task of handled) container.append(createTaskNode(task, state, view, depth, false));
}

function renderGlobalView(state: AppState, tasks: Task[], view: ViewState, container: HTMLElement): void {
  if (state.preferences.viewMode === "global_priority") {
    for (const priority of ["high", "low"] as const) {
      const members = tasks.filter((task) => task.priority === priority).sort(taskComparator("global_priority"));
      if (!members.length) continue;
      container.append(createGroupHeading(`${PRIORITY_LABELS[priority]}优先级`, members.length));
      for (const task of members) container.append(createTaskNode(task, state, view, 0, false, true));
    }
    return;
  }
  if (state.preferences.viewMode === "global_due_date") {
    const groups = [["overdue", "已逾期"], ["today", "今天"], ["next_seven_days", "未来七天"], ["later", "更晚"], ["unscheduled", "未设置日期"]] as const;
    for (const [group, label] of groups) {
      const members = tasks.filter((task) => dueDateGroup(task) === group).sort(taskComparator("global_due_date"));
      if (!members.length) continue;
      container.append(createGroupHeading(label, members.length));
      for (const task of members) container.append(createTaskNode(task, state, view, 0, false, true));
    }
    return;
  }
  for (const priority of ["high", "low"] as const) {
    const members = tasks.filter((task) => task.priority === priority).sort(taskComparator("priority_then_due_date"));
    if (!members.length) continue;
    container.append(createGroupHeading(`${PRIORITY_LABELS[priority]}优先级 · 按日期`, members.length));
    for (const task of members) container.append(createTaskNode(task, state, view, 0, false, true));
  }
}

function createTaskNode(task: Task, state: AppState, view: ViewState, depth: number, draggable: boolean, global = false, priorityBand?: Priority): HTMLElement {
  const selected = task.id === view.selectedTaskId;
  const overdue = isOverdue(task);
  const pending = Boolean(task.pendingResolution);
  const node = createElement("article", {
    className: `task-item ${task.status}${priorityBand ? ` priority-band priority-band-${priorityBand}` : ""}${selected ? " selected" : ""}${view.query ? " search-match" : ""}${overdue ? " overdue" : ""}${pending ? " pending" : ""}${view.flashTaskId === task.id ? " locating" : ""}`,
  });
  node.dataset.id = task.id;
  node.dataset.folderId = task.folderId ?? "root";
  node.dataset.priority = task.priority;
  node.style.setProperty("--task-depth", String(depth));
  node.tabIndex = 0;
  node.setAttribute("role", "option");
  node.setAttribute("aria-selected", String(selected));
  node.setAttribute("aria-label", `${task.title}，${pending ? "等待确认" : STATUS_LABELS[task.status]}，${PRIORITY_LABELS[task.priority]}优先级`);
  if (draggable && task.status === "active" && !overdue) node.classList.add("is-draggable");

  const main = createElement("div", { className: "task-main" });
  const titleLine = createElement("div", { className: "task-title-line" });
  if (draggable && task.status === "active" && !overdue) {
    const handle = iconButton("drag-task", "GripVertical", "拖动任务", "drag-handle");
    handle.dataset.taskId = task.id;
    titleLine.append(handle);
  } else titleLine.append(createElement("span", { className: "status-dot" }));
  titleLine.append(createElement("strong", { text: task.title }));
  const meta = createElement("small", { className: "task-meta" });
  if (global) {
    const path = createElement("button", { className: "folder-path", text: getFolderPath(state.folders, task.folderId), title: "在任务树中定位" });
    path.type = "button";
    path.dataset.action = "locate-task";
    meta.append(path);
  } else meta.append(document.createTextNode(task.tag ? `#${task.tag}` : "无标签"));
  if (pending && task.pendingResolution) {
    const seconds = Math.max(0, Math.ceil((task.pendingResolution.executeAt - Date.now()) / 1_000));
    meta.append(document.createTextNode(` · ${seconds} 秒内可撤销`));
    node.style.setProperty("--pending-progress", `${Math.max(0, Math.min(100, ((task.pendingResolution.executeAt - Date.now()) / 8_000) * 100))}%`);
  }
  main.append(titleLine, meta);
  const priority = createElement("span", { className: `priority ${task.priority}`, text: PRIORITY_LABELS[task.priority] });
  const time = createElement("time", { text: formatDueDate(task) });
  time.dateTime = task.dueDate;
  node.append(main, priority, time, createTaskActions(task, global));
  return node;
}

function createTaskActions(task: Task, global: boolean): HTMLElement {
  const actions = createElement("div", { className: "task-actions" });
  if (task.pendingResolution) {
    actions.append(iconButton("cancel-resolution", "Undo2", "撤销处理"));
    return actions;
  }
  if (task.status === "active") {
    actions.append(iconButton("complete", "Check", "标记为已完成"), iconButton("discard", "Ban", "标记为不再需要"));
    if (isOverdue(task)) actions.append(iconButton("reschedule", "CalendarPlus", "重新安排截止日期"));
    actions.append(iconButton("move-menu", "MoreHorizontal", "更多任务操作"));
  } else {
    actions.append(iconButton("restore", "Undo2", "恢复为待办"));
    if (global) actions.append(iconButton("locate-task", "LocateFixed", "在任务树中定位"));
  }
  if (task.status !== "active") actions.append(iconButton("delete", "Trash2", "删除任务", "icon-button danger"));
  return actions;
}

function createSubheading(label: string, count: number, className: string): HTMLElement {
  const heading = createElement("div", { className: `subheading ${className}` });
  heading.append(document.createTextNode(label), createElement("span", { text: String(count) }));
  return heading;
}

function createGroupHeading(label: string, count: number): HTMLElement {
  const heading = createElement("div", { className: "group-heading" });
  heading.append(document.createTextNode(label), createElement("span", { className: "group-count", text: String(count) }));
  return heading;
}

function iconButton(action: string, iconName: IconName, label: string, className = "icon-button"): HTMLButtonElement {
  const button = createElement("button", { className, title: label });
  button.type = "button";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.append(icon(iconName));
  return button;
}

export function fillFolderSelect(select: HTMLSelectElement, folders: Folder[], selectedValue: string, rootLabel: string): void {
  select.replaceChildren(new Option(rootLabel, ""));
  const sorted = [...folders].sort((a, b) => getFolderDepth(folders, a.id) - getFolderDepth(folders, b.id) || a.order - b.order);
  for (const folder of sorted) select.add(new Option(`${"  ".repeat(Math.max(0, getFolderDepth(folders, folder.id) - 1))}${folder.name}`, folder.id));
  select.value = Array.from(select.options).some((option) => option.value === selectedValue) ? selectedValue : "";
}

function groupFoldersByParent(folders: Folder[]): Map<string | null, Folder[]> {
  const result = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const siblings = result.get(folder.parentId) ?? [];
    siblings.push(folder);
    result.set(folder.parentId, siblings);
  }
  for (const siblings of result.values()) siblings.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  return result;
}

function renderTimeline(task: Task, container: HTMLOListElement): void {
  container.replaceChildren();
  const records = [
    ...task.rescheduleHistory.map((record) => ({ kind: "reschedule" as const, changedAt: record.changedAt, record })),
    ...task.statusHistory.map((record) => ({ kind: "status" as const, changedAt: record.changedAt, record })),
  ].sort((a, b) => b.changedAt - a.changedAt || a.record.eventId.localeCompare(b.record.eventId));
  for (const entry of records) {
    const item = createElement("li");
    if (entry.kind === "status") {
      const labels = { active: "待办", completed: "已完成", discarded: "不再需要" };
      item.append(
        createElement("strong", { text: `${labels[entry.record.fromStatus]} → ${labels[entry.record.toStatus]}` }),
        createElement("span", { text: `${formatDateTime(entry.record.changedAt)} · ${entry.record.source === "restore" ? "恢复任务" : entry.record.source === "migration" ? "旧数据迁移" : "状态变更"}` }),
      );
      container.append(item);
      continue;
    }
    const record = entry.record;
    const change = createElement("strong", { text: `${record.fromDate || "未设置"} → ${record.toDate}` });
    const meta = createElement("span", { text: `${formatDateTime(record.changedAt)} · ${record.source === "quick" ? "快捷改期" : "详情修改"}` });
    item.append(change, meta);
    if (record.reason) item.append(createElement("p", { text: record.reason }));
    container.append(item);
  }
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}

function formatDueDate(task: Task): string {
  if (!task.dueDate) return "无截止日期";
  const date = new Date(`${task.dueDate}T00:00:00`);
  const label = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
  if (isOverdue(task)) return `已逾期 ${overdueDays(task)} 天 · ${label}`;
  if (task.status === "active" && task.dueDate === toISODate()) return "今天截止";
  return `${label} 截止`;
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

function stableTaskOrder(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function isDragMode(state: AppState, view: ViewState): boolean {
  return state.preferences.viewMode === "tree_manual" && !view.query && !["completed", "discarded"].includes(state.preferences.activeStatusFilter);
}

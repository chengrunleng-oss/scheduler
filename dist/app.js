(() => {
  "use strict";

  const STORAGE_KEY = "task-workbench-state-v2";
  const LEGACY_STORAGE_KEY = "plan-workbench-state-v1";
  const SCHEMA_VERSION = 2;
  const PRIORITY_LABELS = { high: "高", medium: "中", low: "低" };
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const FEEDBACK_RULES = [
    { keywords: ["提醒", "通知", "到期", "逾期"], suggestion: "增加截止日期状态、到期提醒和逾期标记。" },
    { keywords: ["统计", "报表", "图表", "趋势"], suggestion: "增加按标签、优先级和完成率的统计视图。" },
    { keywords: ["同步", "多设备", "账号"], suggestion: "评估数据同步、账号体系和冲突合并策略。" },
    { keywords: ["导入", "备份", "恢复"], suggestion: "完善 JSON 导入、备份恢复和数据校验提示。" },
    { keywords: ["日历", "周视图", "月视图"], suggestion: "增加日历视图，按日期查看任务安排。" },
    { keywords: ["分类", "标签", "项目"], suggestion: "增强标签和项目分类管理能力。" },
    { keywords: ["子任务", "清单", "拆分"], suggestion: "支持任务下的子任务清单和完成进度。" },
    { keywords: ["离线", "安装", "桌面"], suggestion: "升级为 PWA，支持离线访问和安装到桌面。" },
    { keywords: ["撤销", "重做", "误删"], suggestion: "增强撤销、重做和删除恢复体验。" },
  ];

  function createDefaultState(now = Date.now()) {
    const today = toISODate(now);
    return {
      schemaVersion: SCHEMA_VERSION,
      preferences: { activeFilter: "all", theme: "system" },
      currentIteration: {
        number: 2,
        title: "结构优化版",
        completed: [
          createChecklistItem("done-1", "完成基础任务记录、筛选、搜索和完成状态切换。", true, now - 3_000),
          createChecklistItem("done-2", "建立本地保存、导出和开发迭代记录。", true, now - 2_000),
        ],
        next: [
          createChecklistItem("next-1", "拆分单文件巨石，建立类型、状态、存储、UI 模块边界。", false, now - 1_000),
          createChecklistItem("next-2", "加入数据校验、导入恢复、撤销重做和深色主题。", false, now),
        ],
      },
      tasks: [
        {
          id: "task-1",
          title: "记录今天必须推进的三件事",
          priority: "high",
          dueDate: today,
          tag: "工作",
          done: false,
          createdAt: now - 7_200_000,
          updatedAt: now - 7_200_000,
        },
        {
          id: "task-2",
          title: "把反馈整理成下一轮改进清单",
          priority: "medium",
          dueDate: "",
          tag: "改进",
          done: false,
          createdAt: now - 3_600_000,
          updatedAt: now - 3_600_000,
        },
      ],
      iterations: [],
    };
  }

  function createTask(draft, now = Date.now(), id = createId("task", now)) {
    return {
      id,
      title: normalizeText(draft.title),
      priority: coercePriority(draft.priority),
      dueDate: normalizeDate(draft.dueDate),
      tag: normalizeText(draft.tag),
      done: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  function updateTask(task, draft, now = Date.now()) {
    return {
      ...task,
      title: normalizeText(draft.title),
      priority: coercePriority(draft.priority),
      dueDate: normalizeDate(draft.dueDate),
      tag: normalizeText(draft.tag),
      updatedAt: now,
    };
  }

  function createChecklistItem(id, text, checked = false, now = Date.now()) {
    return { id, text: normalizeText(text), checked, createdAt: now };
  }

  function createId(prefix, now = Date.now()) {
    return `${prefix}-${now}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  }

  function normalizeDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  }

  function coercePriority(value) {
    if (value === "high" || value === "高") return "high";
    if (value === "low" || value === "低") return "low";
    return "medium";
  }

  function coerceFilter(value) {
    return value === "open" || value === "done" || value === "all" ? value : "all";
  }

  function coerceTheme(value) {
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  }

  function priorityRank(priority) {
    return PRIORITY_RANK[priority] ?? 3;
  }

  function toISODate(value = Date.now()) {
    const date = typeof value === "number" ? new Date(value) : value;
    return date.toISOString().slice(0, 10);
  }

  function isDueOrOverdue(task, todayISO = toISODate()) {
    return !task.done && Boolean(task.dueDate) && task.dueDate <= todayISO;
  }

  function selectVisibleTasks(state, query) {
    const normalizedQuery = normalizeText(query).toLowerCase();
    return state.tasks
      .filter((task) => {
        const matchesStatus =
          state.preferences.activeFilter === "all" ||
          (state.preferences.activeFilter === "open" && !task.done) ||
          (state.preferences.activeFilter === "done" && task.done);
        const haystack = `${task.title} ${task.tag} ${PRIORITY_LABELS[task.priority]}`.toLowerCase();
        return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
      })
      .sort((a, b) => Number(a.done) - Number(b.done) || priorityRank(a.priority) - priorityRank(b.priority) || b.createdAt - a.createdAt);
  }

  function buildFeedbackSuggestions(feedback) {
    const normalized = normalizeText(feedback);
    if (!normalized) return [];
    const matched = FEEDBACK_RULES.filter((rule) => rule.keywords.some((keyword) => normalized.includes(keyword))).map((rule) => rule.suggestion);
    if (matched.length > 0) return [...new Set(matched)];
    return [`澄清并拆解反馈：“${normalized}”。`, "把反馈拆成可验证的小功能并纳入下一轮验收。"];
  }

  function deriveNextRound(previousNext, feedback, now = Date.now()) {
    const feedbackItems = buildFeedbackSuggestions(feedback).map((text) => createChecklistItem(createId("next", now), text, false, now));
    const carryItems = previousNext
      .slice(1, 4)
      .map((text, index) => createChecklistItem(createId(`next-${index}`, now + index), text, false, now + index));
    const seen = new Set();
    const merged = [...feedbackItems, ...carryItems].filter((item) => {
      if (seen.has(item.text)) return false;
      seen.add(item.text);
      return true;
    });
    if (merged.length > 0) return merged.slice(0, 5);
    return [
      createChecklistItem(createId("next", now), "验证当前版本的日常记录效率。", false, now),
      createChecklistItem(createId("next", now + 1), "根据真实使用场景补充批量操作。", false, now + 1),
    ];
  }

  function hydrateState(input, now = Date.now()) {
    const fallback = createDefaultState(now);
    if (!isRecord(input)) return fallback;
    const preferences = hydratePreferences(input.preferences, input);
    const currentIteration = hydrateCurrentIteration(input.currentIteration, fallback.currentIteration, now);
    const tasks = Array.isArray(input.tasks) ? input.tasks.map((item, index) => hydrateTask(item, now + index)).filter(Boolean) : fallback.tasks;
    const iterations = Array.isArray(input.iterations)
      ? input.iterations.map((item, index) => hydrateIteration(item, now + index)).filter(Boolean)
      : fallback.iterations;
    return { schemaVersion: SCHEMA_VERSION, preferences, currentIteration, tasks, iterations };
  }

  function hydratePreferences(value, legacyRoot) {
    const source = isRecord(value) ? value : legacyRoot;
    return { activeFilter: coerceFilter(source.activeFilter), theme: coerceTheme(source.theme) };
  }

  function hydrateCurrentIteration(value, fallback, now) {
    if (!isRecord(value)) return fallback;
    const number = typeof value.number === "number" && Number.isFinite(value.number) ? Math.max(1, Math.floor(value.number)) : fallback.number;
    const title = normalizeText(value.title) || fallback.title;
    const completed = Array.isArray(value.completed)
      ? value.completed.map((item, index) => hydrateChecklistItem(item, `done-${index}`, now + index)).filter(Boolean)
      : fallback.completed;
    const next = Array.isArray(value.next)
      ? value.next.map((item, index) => hydrateChecklistItem(item, `next-${index}`, now + index)).filter(Boolean)
      : fallback.next;
    return { number, title, completed, next };
  }

  function hydrateTask(value, now) {
    if (!isRecord(value)) return null;
    const title = normalizeText(value.title);
    if (!title) return null;
    const createdAt = toTimestamp(value.createdAt, now);
    return {
      id: normalizeText(value.id) || createId("task", now),
      title,
      priority: coercePriority(value.priority),
      dueDate: normalizeDate(value.dueDate) || normalizeDate(value.date),
      tag: normalizeText(value.tag),
      done: Boolean(value.done),
      createdAt,
      updatedAt: toTimestamp(value.updatedAt, createdAt),
    };
  }

  function hydrateChecklistItem(value, fallbackId, now) {
    if (!isRecord(value)) return null;
    const text = normalizeText(value.text);
    if (!text) return null;
    return { id: normalizeText(value.id) || fallbackId, text, checked: Boolean(value.checked), createdAt: toTimestamp(value.createdAt, now) };
  }

  function hydrateIteration(value, now) {
    if (!isRecord(value)) return null;
    const title = normalizeText(value.title);
    if (!title) return null;
    return {
      id: normalizeText(value.id) || createId("iteration", now),
      number: typeof value.number === "number" && Number.isFinite(value.number) ? Math.max(1, Math.floor(value.number)) : 1,
      title,
      completed: Array.isArray(value.completed) ? value.completed.map(normalizeText).filter(Boolean) : [],
      next: Array.isArray(value.next) ? value.next.map(normalizeText).filter(Boolean) : [],
      feedback: normalizeText(value.feedback),
      finishedAt: toTimestamp(value.finishedAt, now),
    };
  }

  function toTimestamp(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function loadStateFromStorage(storage = localStorage) {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { state: createDefaultState(), recovered: false, message: "" };
    try {
      return { state: hydrateState(JSON.parse(raw)), recovered: true, message: "已从本地存储恢复数据。" };
    } catch {
      return { state: createDefaultState(), recovered: false, message: "本地数据无法解析，已恢复为默认数据。" };
    }
  }

  function saveStateToStorage(state, storage = localStorage) {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function parseBackupFile(text) {
    try {
      return { state: hydrateState(JSON.parse(text)), recovered: true, message: "备份文件已导入。" };
    } catch {
      return { state: createDefaultState(), recovered: false, message: "备份文件不是有效 JSON，未导入。" };
    }
  }

  function createBackupBlob(state) {
    return new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
  }

  function createStore(initialState) {
    let state = initialState;
    let previousState = null;
    const past = [];
    const future = [];
    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener(state, previousState));

    return {
      getState: () => state,
      dispatch(action) {
        const next = reduceState(state, action);
        if (next === state) return;
        previousState = state;
        if (isHistoryAction(action)) {
          past.push(state);
          future.length = 0;
        }
        state = next;
        notify();
      },
      undo() {
        const snapshot = past.pop();
        if (!snapshot) return;
        future.push(state);
        previousState = state;
        state = snapshot;
        notify();
      },
      redo() {
        const snapshot = future.pop();
        if (!snapshot) return;
        past.push(state);
        previousState = state;
        state = snapshot;
        notify();
      },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  function reduceState(state, action) {
    switch (action.type) {
      case "add-task": {
        const task = createTask(action.draft, action.now);
        return task.title ? { ...state, tasks: [task, ...state.tasks] } : state;
      }
      case "update-task":
        return { ...state, tasks: state.tasks.map((task) => (task.id === action.id ? updateTask(task, action.draft, action.now) : task)) };
      case "toggle-task":
        return {
          ...state,
          tasks: state.tasks.map((task) => (task.id === action.id ? { ...task, done: action.done, updatedAt: action.now ?? Date.now() } : task)),
        };
      case "delete-task":
        return { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) };
      case "set-filter":
        return { ...state, preferences: { ...state.preferences, activeFilter: action.filter } };
      case "set-theme":
        return { ...state, preferences: { ...state.preferences, theme: action.theme } };
      case "add-checklist-item": {
        const text = normalizeText(action.text);
        if (!text) return state;
        return updateChecklist(state, action.kind, (items) => [
          ...items,
          createChecklistItem(createId(action.kind === "completed" ? "done" : "next", action.now), text, action.kind === "completed", action.now),
        ]);
      }
      case "toggle-checklist-item":
        return updateChecklist(state, action.kind, (items) => items.map((item) => (item.id === action.id ? { ...item, checked: action.checked } : item)));
      case "delete-checklist-item":
        return updateChecklist(state, action.kind, (items) => items.filter((item) => item.id !== action.id));
      case "apply-feedback":
        return applyFeedback(state, action.feedback, action.now);
      case "complete-iteration":
        return completeIteration(state, action.feedback, action.now);
      case "replace-state":
        return action.state;
      case "reset":
        return createDefaultState(action.now);
      default:
        return state;
    }
  }

  function updateChecklist(state, kind, updater) {
    return { ...state, currentIteration: { ...state.currentIteration, [kind]: updater(state.currentIteration[kind]) } };
  }

  function applyFeedback(state, feedback, now = Date.now()) {
    const normalized = normalizeText(feedback);
    if (!normalized) return state;
    const suggestions = buildFeedbackSuggestions(normalized);
    const existing = new Set(state.currentIteration.next.map((item) => item.text));
    const nextItems = suggestions
      .filter((text) => !existing.has(text))
      .map((text, index) => createChecklistItem(createId("next", now + index), text, false, now + index));
    const feedbackTask = createTask({ title: `处理反馈：${normalized}`, priority: "high", dueDate: "", tag: "反馈" }, now);
    return {
      ...state,
      tasks: [feedbackTask, ...state.tasks],
      currentIteration: { ...state.currentIteration, next: [...state.currentIteration.next, ...nextItems] },
    };
  }

  function completeIteration(state, feedback, now = Date.now()) {
    const completed = state.currentIteration.completed.filter((item) => item.checked).map((item) => item.text);
    const next = state.currentIteration.next.map((item) => item.text);
    const normalizedFeedback = normalizeText(feedback);
    const summary = {
      id: createId("iteration", now),
      number: state.currentIteration.number,
      title: state.currentIteration.title,
      completed,
      next,
      feedback: normalizedFeedback,
      finishedAt: now,
    };
    return {
      ...state,
      iterations: [...state.iterations, summary],
      currentIteration: {
        number: state.currentIteration.number + 1,
        title: next[0]?.replace(/[。.!！]$/, "") || "反馈优化版",
        completed: [createChecklistItem(createId("done", now), "根据上一轮反馈确认本轮改进范围。", false, now)],
        next: deriveNextRound(next, normalizedFeedback, now),
      },
    };
  }

  function isHistoryAction(action) {
    return action.type !== "set-filter" && action.type !== "set-theme";
  }

  function requiredElement(selector, root = document) {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.title) element.title = options.title;
    return element;
  }

  function setChildren(parent, children) {
    parent.replaceChildren(...children.map((child) => (typeof child === "string" ? document.createTextNode(child) : child)));
  }

  function queryElements() {
    return {
      taskForm: requiredElement("#taskForm"),
      taskTitle: requiredElement("#taskTitle"),
      taskPriority: requiredElement("#taskPriority"),
      taskDueDate: requiredElement("#taskDueDate"),
      taskTag: requiredElement("#taskTag"),
      clearForm: requiredElement("#clearForm"),
      taskList: requiredElement("#taskList"),
      emptyState: requiredElement("#emptyState"),
      taskTemplate: requiredElement("#taskTemplate"),
      searchInput: requiredElement("#searchInput"),
      filters: document.querySelectorAll(".segment"),
      metricOpen: requiredElement("#metricOpen"),
      metricDone: requiredElement("#metricDone"),
      metricDue: requiredElement("#metricDue"),
      doneLog: requiredElement("#doneLog"),
      nextPlan: requiredElement("#nextPlan"),
      addDoneItem: requiredElement("#addDoneItem"),
      addNextItem: requiredElement("#addNextItem"),
      feedbackInput: requiredElement("#feedbackInput"),
      applyFeedback: requiredElement("#applyFeedback"),
      iterationHistory: requiredElement("#iterationHistory"),
      iterationCount: requiredElement("#iterationCount"),
      currentIterationTitle: requiredElement("#currentIterationTitle"),
      completeIteration: requiredElement("#completeIteration"),
      exportData: requiredElement("#exportData"),
      importData: requiredElement("#importData"),
      importFile: requiredElement("#importFile"),
      resetDemo: requiredElement("#resetDemo"),
      undoAction: requiredElement("#undoAction"),
      redoAction: requiredElement("#redoAction"),
      themeSelect: requiredElement("#themeSelect"),
      taskDialog: requiredElement("#taskDialog"),
      taskDialogForm: requiredElement("#taskDialogForm"),
      taskDialogTitle: requiredElement("#taskDialogTitle"),
      dialogTaskTitle: requiredElement("#dialogTaskTitle"),
      dialogTaskPriority: requiredElement("#dialogTaskPriority"),
      dialogTaskDueDate: requiredElement("#dialogTaskDueDate"),
      dialogTaskTag: requiredElement("#dialogTaskTag"),
      itemDialog: requiredElement("#itemDialog"),
      itemDialogForm: requiredElement("#itemDialogForm"),
      itemDialogTitle: requiredElement("#itemDialogTitle"),
      itemDialogLabel: requiredElement("#itemDialogLabel"),
      itemDialogText: requiredElement("#itemDialogText"),
      confirmDialog: requiredElement("#confirmDialog"),
      confirmTitle: requiredElement("#confirmTitle"),
      confirmText: requiredElement("#confirmText"),
      confirmClose: requiredElement("#confirmClose"),
      confirmCancel: requiredElement("#confirmCancel"),
      confirmOk: requiredElement("#confirmOk"),
      toast: requiredElement("#toast"),
    };
  }

  function createDialogs(els) {
    let toastTimer = 0;
    const closeDialog = (dialog) => {
      if (dialog.open) dialog.close();
    };

    document.addEventListener("click", (event) => {
      const closeButton = event.target.closest("[data-close-dialog]");
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
          const cleanup = () => {
            els.taskDialogForm.removeEventListener("submit", onSubmit);
            els.taskDialog.removeEventListener("close", onClose);
          };
          const onSubmit = (event) => {
            event.preventDefault();
            const draft = {
              title: normalizeText(els.dialogTaskTitle.value),
              priority: coercePriority(els.dialogTaskPriority.value),
              dueDate: els.dialogTaskDueDate.value,
              tag: normalizeText(els.dialogTaskTag.value),
            };
            cleanup();
            closeDialog(els.taskDialog);
            resolve(draft.title ? draft : null);
          };
          const onClose = () => {
            cleanup();
            resolve(null);
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
          const cleanup = () => {
            els.itemDialogForm.removeEventListener("submit", onSubmit);
            els.itemDialog.removeEventListener("close", onClose);
          };
          const onSubmit = (event) => {
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
          const cleanup = () => {
            els.confirmOk.removeEventListener("click", onOk);
            els.confirmCancel.removeEventListener("click", onCancel);
            els.confirmClose.removeEventListener("click", onCancel);
            els.confirmDialog.removeEventListener("close", onClose);
          };
          const finish = (value) => {
            cleanup();
            closeDialog(els.confirmDialog);
            resolve(value);
          };
          const onOk = () => finish(true);
          const onCancel = () => finish(false);
          const onClose = () => finish(false);
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

  function createRenderer(els) {
    const taskNodes = new Map();
    return {
      render(state, previous, query, canUndo, canRedo) {
        document.documentElement.dataset.theme = state.preferences.theme;
        els.currentIterationTitle.textContent = `第 ${state.currentIteration.number} 轮：${state.currentIteration.title}`;
        els.filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.preferences.activeFilter));
        els.themeSelect.value = state.preferences.theme;
        els.undoAction.disabled = !canUndo;
        els.redoAction.disabled = !canRedo;
        renderMetrics(els, state);
        renderTasks(els, state, previous, query, taskNodes);
        renderChecklist(els.doneLog, state.currentIteration.completed, "completed");
        renderChecklist(els.nextPlan, state.currentIteration.next, "next");
        renderHistory(els, state);
      },
      clearTaskCache() {
        taskNodes.clear();
      },
    };
  }

  function renderMetrics(els, state) {
    const today = toISODate();
    els.metricOpen.textContent = String(state.tasks.filter((task) => !task.done).length);
    els.metricDone.textContent = String(state.tasks.filter((task) => task.done).length);
    els.metricDue.textContent = String(state.tasks.filter((task) => isDueOrOverdue(task, today)).length);
  }

  function renderTasks(els, state, _previous, query, taskNodes) {
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
      if (!taskId || !visibleIds.has(taskId)) child.remove();
    }
    visibleTasks.forEach((task, targetIndex) => {
      const node = taskNodes.get(task.id) ?? createTaskNode(els);
      updateTaskNode(node, task);
      taskNodes.set(task.id, node);
      const currentNodeAtIndex = els.taskList.children.item(targetIndex);
      if (currentNodeAtIndex !== node) els.taskList.insertBefore(node, currentNodeAtIndex);
    });
    els.emptyState.hidden = visibleTasks.length > 0;
  }

  function createTaskNode(els) {
    const node = els.taskTemplate.content.firstElementChild?.cloneNode(true);
    if (!(node instanceof HTMLElement)) throw new Error("Task template is invalid.");
    return node;
  }

  function updateTaskNode(node, task) {
    const checkbox = node.querySelector('input[type="checkbox"]');
    const title = node.querySelector("strong");
    const meta = node.querySelector("small");
    const priority = node.querySelector(".priority");
    const time = node.querySelector("time");
    if (!checkbox || !title || !meta || !priority || !time) throw new Error("Task node is missing required children.");
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

  function renderHistory(els, state) {
    els.iterationHistory.replaceChildren();
    els.iterationCount.textContent = `${state.iterations.length} 条`;
    if (state.iterations.length === 0) {
      const empty = createElement("article", { className: "history-item" });
      empty.append(createElement("strong", { text: "暂无历史" }), createElement("small", { text: "点击“归档本轮”后会生成记录。" }));
      els.iterationHistory.append(empty);
      return;
    }
    for (const item of [...state.iterations].reverse()) {
      const node = createElement("article", { className: "history-item" });
      const completed = createElement("p");
      setChildren(completed, [createElement("b", { text: "完成：" }), item.completed.join("；") || "未填写"]);
      const next = createElement("p");
      setChildren(next, [createElement("b", { text: "下一轮：" }), item.next.join("；") || "未填写"]);
      node.append(createElement("strong", { text: `第 ${item.number} 轮：${item.title}` }), createElement("small", { text: formatDateTime(item.finishedAt) }), completed, next);
      if (item.feedback) {
        const feedback = createElement("p");
        setChildren(feedback, [createElement("b", { text: "反馈：" }), item.feedback]);
        node.append(feedback);
      }
      els.iterationHistory.append(node);
    }
  }

  function formatDueDate(task) {
    if (!task.dueDate) return "未定";
    const date = new Date(`${task.dueDate}T00:00:00`);
    const label = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
    return isDueOrOverdue(task) ? `${label} 到期` : label;
  }

  function formatDateTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  }

  function bindEvents(els, store, dialogs, requestRender) {
    const readTaskDraft = () => ({
      title: normalizeText(els.taskTitle.value),
      priority: coercePriority(els.taskPriority.value),
      dueDate: els.taskDueDate.value,
      tag: normalizeText(els.taskTag.value),
    });
    const resetTaskForm = () => {
      els.taskForm.reset();
      els.taskPriority.value = "medium";
      els.taskTitle.focus();
    };

    els.taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const draft = readTaskDraft();
      if (!draft.title) return;
      store.dispatch({ type: "add-task", draft });
      resetTaskForm();
    });
    els.taskForm.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") els.taskForm.requestSubmit();
    });
    els.clearForm.addEventListener("click", resetTaskForm);
    els.searchInput.addEventListener("input", requestRender);
    els.filters.forEach((button) => {
      button.addEventListener("click", () => store.dispatch({ type: "set-filter", filter: button.dataset.filter || "all" }));
    });
    els.themeSelect.addEventListener("change", () => store.dispatch({ type: "set-theme", theme: els.themeSelect.value }));
    els.taskList.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      const taskId = target.closest(".task-item")?.dataset.id;
      if (taskId) store.dispatch({ type: "toggle-task", id: taskId, done: target.checked });
    });
    els.taskList.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const taskId = button.closest(".task-item")?.dataset.id;
      const task = store.getState().tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (button.dataset.action === "delete") {
        if (await dialogs.confirm("删除任务", `确认删除“${task.title}”吗？`)) store.dispatch({ type: "delete-task", id: task.id });
        return;
      }
      if (button.dataset.action === "edit") {
        const draft = await dialogs.editTask(task);
        if (draft) store.dispatch({ type: "update-task", id: task.id, draft });
      }
    });
    els.doneLog.addEventListener("click", (event) => handleChecklistEvent(event, "completed"));
    els.nextPlan.addEventListener("click", (event) => handleChecklistEvent(event, "next"));
    els.addDoneItem.addEventListener("click", async () => {
      const text = await dialogs.addChecklistItem("completed");
      if (text) store.dispatch({ type: "add-checklist-item", kind: "completed", text });
    });
    els.addNextItem.addEventListener("click", async () => {
      const text = await dialogs.addChecklistItem("next");
      if (text) store.dispatch({ type: "add-checklist-item", kind: "next", text });
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
      link.download = `task-workbench-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
    els.importData.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", async () => {
      const file = els.importFile.files?.[0];
      els.importFile.value = "";
      if (!file) return;
      const result = parseBackupFile(await file.text());
      if (!result.recovered) {
        dialogs.toast(result.message);
        return;
      }
      if (await dialogs.confirm("导入备份", "导入会替换当前浏览器里的数据，继续吗？")) {
        store.dispatch({ type: "replace-state", state: result.state });
        dialogs.toast(result.message);
      }
    });
    els.resetDemo.addEventListener("click", async () => {
      if (await dialogs.confirm("重置示例数据", "重置会清除当前浏览器里的记录，继续吗？")) {
        store.dispatch({ type: "reset" });
        els.searchInput.value = "";
        dialogs.toast("已恢复示例数据。");
      }
    });

    function handleChecklistEvent(event, kind) {
      const row = event.target.closest(".check-row");
      if (!row?.dataset.id) return;
      if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
        store.dispatch({ type: "toggle-checklist-item", kind, id: row.dataset.id, checked: event.target.checked });
      }
      if (event.target.closest("button")) {
        store.dispatch({ type: "delete-checklist-item", kind, id: row.dataset.id });
      }
    }

    return { getQuery: () => els.searchInput.value };
  }

  const els = queryElements();
  const loaded = loadStateFromStorage();
  const store = createStore(hydrateState(loaded.state));
  const renderer = createRenderer(els);
  const dialogs = createDialogs(els);
  const bindings = bindEvents(els, store, dialogs, render);

  store.subscribe((state, previous) => {
    saveStateToStorage(state);
    renderer.render(state, previous, bindings.getQuery(), store.canUndo(), store.canRedo());
  });

  function render() {
    renderer.render(store.getState(), null, bindings.getQuery(), store.canUndo(), store.canRedo());
  }

  render();
  if (loaded.message) dialogs.toast(loaded.message);
})();

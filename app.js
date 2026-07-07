const STORAGE_KEY = "plan-workbench-state-v1";

const seedState = {
  activeFilter: "all",
  currentIteration: {
    number: 1,
    title: "基础可用版",
    completed: [
      { id: "done-1", text: "完成计划新增、筛选、搜索、完成状态切换。", checked: true },
      { id: "done-2", text: "完成本地保存，刷新页面后数据仍保留。", checked: true },
      { id: "done-3", text: "建立反馈输入和下一轮目标生成流程。", checked: true },
    ],
    next: [
      { id: "next-1", text: "增加提醒时间和到期提示。", checked: false },
      { id: "next-2", text: "增加按标签统计与周视图。", checked: false },
      { id: "next-3", text: "支持导入备份文件。", checked: false },
    ],
  },
  tasks: [
    {
      id: "task-1",
      title: "记录今天必须推进的三件事",
      priority: "高",
      date: new Date().toISOString().slice(0, 10),
      tag: "工作",
      done: false,
      createdAt: Date.now() - 7200000,
    },
    {
      id: "task-2",
      title: "把用户反馈整理成下一轮优化清单",
      priority: "中",
      date: "",
      tag: "迭代",
      done: false,
      createdAt: Date.now() - 3600000,
    },
  ],
  iterations: [],
};

const state = loadState();

const els = {
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskPriority: document.querySelector("#taskPriority"),
  taskDate: document.querySelector("#taskDate"),
  taskTag: document.querySelector("#taskTag"),
  clearForm: document.querySelector("#clearForm"),
  taskList: document.querySelector("#taskList"),
  emptyState: document.querySelector("#emptyState"),
  taskTemplate: document.querySelector("#taskTemplate"),
  searchInput: document.querySelector("#searchInput"),
  filters: document.querySelectorAll(".segment"),
  metricOpen: document.querySelector("#metricOpen"),
  metricDone: document.querySelector("#metricDone"),
  metricHigh: document.querySelector("#metricHigh"),
  doneLog: document.querySelector("#doneLog"),
  nextPlan: document.querySelector("#nextPlan"),
  addDoneItem: document.querySelector("#addDoneItem"),
  addNextItem: document.querySelector("#addNextItem"),
  feedbackInput: document.querySelector("#feedbackInput"),
  applyFeedback: document.querySelector("#applyFeedback"),
  iterationHistory: document.querySelector("#iterationHistory"),
  iterationCount: document.querySelector("#iterationCount"),
  currentIterationTitle: document.querySelector("#currentIterationTitle"),
  completeIteration: document.querySelector("#completeIteration"),
  exportData: document.querySelector("#exportData"),
  resetDemo: document.querySelector("#resetDemo"),
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return structuredClone(seedState);
  }

  try {
    return { ...structuredClone(seedState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value) {
  return value.trim().replace(/\s+/g, " ");
}

function formatDate(dateValue) {
  if (!dateValue) return "未定";
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function priorityClass(priority) {
  return {
    高: "high",
    中: "medium",
    低: "low",
  }[priority];
}

function render() {
  renderHeader();
  renderTasks();
  renderMetrics();
  renderChecklist(els.doneLog, state.currentIteration.completed, "done");
  renderChecklist(els.nextPlan, state.currentIteration.next, "next");
  renderHistory();
  saveState();
}

function renderHeader() {
  els.currentIterationTitle.textContent = `第 ${state.currentIteration.number} 轮：${state.currentIteration.title}`;
}

function renderTasks() {
  const query = normalize(els.searchInput.value || "").toLowerCase();
  const filtered = state.tasks
    .filter((task) => {
      const matchesStatus =
        state.activeFilter === "all" ||
        (state.activeFilter === "open" && !task.done) ||
        (state.activeFilter === "done" && task.done);
      const haystack = `${task.title} ${task.tag} ${task.priority}`.toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || priorityRank(a.priority) - priorityRank(b.priority) || b.createdAt - a.createdAt);

  els.taskList.replaceChildren();
  els.emptyState.hidden = filtered.length > 0;

  for (const task of filtered) {
    const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
    const checkbox = node.querySelector("input");
    const title = node.querySelector("strong");
    const meta = node.querySelector("small");
    const priority = node.querySelector(".priority");
    const time = node.querySelector("time");

    node.dataset.id = task.id;
    node.classList.toggle("done", task.done);
    checkbox.checked = task.done;
    title.textContent = task.title;
    meta.textContent = task.tag ? `#${task.tag}` : "未设置标签";
    priority.textContent = task.priority;
    priority.classList.add(priorityClass(task.priority));
    time.textContent = formatDate(task.date);
    time.dateTime = task.date || "";

    els.taskList.append(node);
  }
}

function priorityRank(priority) {
  return { 高: 0, 中: 1, 低: 2 }[priority] ?? 3;
}

function renderMetrics() {
  const open = state.tasks.filter((task) => !task.done).length;
  const done = state.tasks.filter((task) => task.done).length;
  const high = state.tasks.filter((task) => !task.done && task.priority === "高").length;

  els.metricOpen.textContent = open;
  els.metricDone.textContent = done;
  els.metricHigh.textContent = high;
}

function renderChecklist(container, items, type) {
  container.replaceChildren();

  for (const item of items) {
    const row = document.createElement("label");
    row.className = "check-row";
    row.dataset.id = item.id;
    row.dataset.type = type;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.checked;

    const text = document.createElement("span");
    text.textContent = item.text;

    const remove = document.createElement("button");
    remove.className = "icon-button danger";
    remove.type = "button";
    remove.title = "删除";
    remove.setAttribute("aria-label", "删除");
    remove.textContent = "×";

    row.append(checkbox, text, remove);
    container.append(row);
  }
}

function renderHistory() {
  els.iterationHistory.replaceChildren();
  els.iterationCount.textContent = `${state.iterations.length} 条`;

  if (state.iterations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-item";
    empty.innerHTML = "<strong>暂无历史</strong><small>点击“完成本轮”后会生成记录。</small>";
    els.iterationHistory.append(empty);
    return;
  }

  for (const item of [...state.iterations].reverse()) {
    const node = document.createElement("article");
    node.className = "history-item";
    const finished = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(item.finishedAt));

    node.innerHTML = `
      <strong>第 ${item.number} 轮：${escapeHtml(item.title)}</strong>
      <small>${finished}</small>
      <p><b>完成：</b>${escapeHtml(item.completed.join("；") || "未填写")}</p>
      <p><b>下一轮：</b>${escapeHtml(item.next.join("；") || "未填写")}</p>
      ${item.feedback ? `<p><b>反馈：</b>${escapeHtml(item.feedback)}</p>` : ""}
    `;
    els.iterationHistory.append(node);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetForm() {
  els.taskForm.reset();
  els.taskPriority.value = "中";
  els.taskTitle.focus();
}

function addChecklistItem(type) {
  const label = type === "done" ? "请输入本轮完成了什么：" : "请输入下一轮要实现什么：";
  const text = normalize(window.prompt(label) || "");
  if (!text) return;

  const target = type === "done" ? state.currentIteration.completed : state.currentIteration.next;
  target.push({ id: uid(type), text, checked: type === "done" });
  render();
}

function applyFeedback() {
  const feedback = normalize(els.feedbackInput.value);
  if (!feedback) {
    els.feedbackInput.focus();
    return;
  }

  const suggestions = buildSuggestions(feedback);
  for (const text of suggestions) {
    if (!state.currentIteration.next.some((item) => item.text === text)) {
      state.currentIteration.next.push({ id: uid("next"), text, checked: false });
    }
  }

  state.tasks.unshift({
    id: uid("task"),
    title: `处理反馈：${feedback}`,
    priority: "高",
    date: "",
    tag: "反馈",
    done: false,
    createdAt: Date.now(),
  });

  els.feedbackInput.value = "";
  render();
}

function buildSuggestions(feedback) {
  const rules = [
    { keys: ["提醒", "通知", "到期"], text: "设计提醒时间、到期状态和逾期提示。" },
    { keys: ["统计", "报表", "图表"], text: "增加按标签、优先级和完成率的统计视图。" },
    { keys: ["同步", "多设备", "账号"], text: "评估数据同步与账号体系的实现方式。" },
    { keys: ["导入", "备份", "恢复"], text: "支持导入备份文件并提供恢复校验。" },
    { keys: ["日历", "周视图", "月视图"], text: "增加日历视图，按日期查看计划安排。" },
    { keys: ["分类", "标签", "项目"], text: "增强标签和项目分类管理能力。" },
  ];

  const matched = rules.filter((rule) => rule.keys.some((key) => feedback.includes(key))).map((rule) => rule.text);
  if (matched.length > 0) return matched;

  return [`根据反馈补充需求澄清：${feedback}`, "把反馈拆成可验证的小功能并纳入下一轮验收。"];
}

function completeIteration() {
  const completed = state.currentIteration.completed.filter((item) => item.checked).map((item) => item.text);
  const next = state.currentIteration.next.map((item) => item.text);
  const feedback = normalize(els.feedbackInput.value);

  state.iterations.push({
    number: state.currentIteration.number,
    title: state.currentIteration.title,
    completed,
    next,
    feedback,
    finishedAt: Date.now(),
  });

  state.currentIteration = {
    number: state.currentIteration.number + 1,
    title: next[0] ? next[0].replace(/[。.!！]$/, "") : "反馈优化版",
    completed: [{ id: uid("done"), text: "根据上一轮反馈确认本轮改进范围。", checked: false }],
    next: deriveNextRound(next, feedback),
  };

  els.feedbackInput.value = "";
  render();
}

function deriveNextRound(previousNext, feedback) {
  const base = previousNext.slice(1, 4).map((text) => ({ id: uid("next"), text, checked: false }));
  const feedbackItems = feedback ? buildSuggestions(feedback).map((text) => ({ id: uid("next"), text, checked: false })) : [];
  const merged = [...feedbackItems, ...base];

  if (merged.length === 0) {
    merged.push(
      { id: uid("next"), text: "验证当前版本的日常记录效率。", checked: false },
      { id: uid("next"), text: "根据真实使用场景补充批量操作。", checked: false },
    );
  }

  return merged.slice(0, 5);
}

function exportState() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `plan-workbench-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

els.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = normalize(els.taskTitle.value);
  if (!title) return;

  state.tasks.unshift({
    id: uid("task"),
    title,
    priority: els.taskPriority.value,
    date: els.taskDate.value,
    tag: normalize(els.taskTag.value),
    done: false,
    createdAt: Date.now(),
  });

  resetForm();
  render();
});

els.taskForm.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    els.taskForm.requestSubmit();
  }
});

els.clearForm.addEventListener("click", resetForm);

els.searchInput.addEventListener("input", renderTasks);

els.filters.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeFilter = button.dataset.filter;
    els.filters.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

els.taskList.addEventListener("change", (event) => {
  if (!event.target.matches('input[type="checkbox"]')) return;
  const task = state.tasks.find((item) => item.id === event.target.closest(".task-item").dataset.id);
  if (!task) return;
  task.done = event.target.checked;
  render();
});

els.taskList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const item = button.closest(".task-item");
  const task = state.tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;

  if (button.dataset.action === "delete") {
    state.tasks = state.tasks.filter((entry) => entry.id !== task.id);
  }

  if (button.dataset.action === "edit") {
    const nextTitle = normalize(window.prompt("编辑计划内容：", task.title) || "");
    if (nextTitle) task.title = nextTitle;
  }

  render();
});

function handleChecklistClick(event) {
  const row = event.target.closest(".check-row");
  if (!row) return;
  const list = row.dataset.type === "done" ? state.currentIteration.completed : state.currentIteration.next;
  const item = list.find((entry) => entry.id === row.dataset.id);
  if (!item) return;

  if (event.target.matches('input[type="checkbox"]')) {
    item.checked = event.target.checked;
  }

  if (event.target.matches("button")) {
    const index = list.findIndex((entry) => entry.id === item.id);
    list.splice(index, 1);
  }

  render();
}

els.doneLog.addEventListener("click", handleChecklistClick);
els.nextPlan.addEventListener("click", handleChecklistClick);
els.addDoneItem.addEventListener("click", () => addChecklistItem("done"));
els.addNextItem.addEventListener("click", () => addChecklistItem("next"));
els.applyFeedback.addEventListener("click", applyFeedback);
els.completeIteration.addEventListener("click", completeIteration);
els.exportData.addEventListener("click", exportState);
els.resetDemo.addEventListener("click", () => {
  if (!window.confirm("重置会恢复示例数据，并清除当前浏览器里的记录。继续吗？")) return;
  Object.assign(state, structuredClone(seedState));
  els.feedbackInput.value = "";
  els.searchInput.value = "";
  els.filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
  render();
});

els.filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.activeFilter));
render();

export const SCHEMA_VERSION = 2;

export const PRIORITY_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
};

export const PRIORITY_RANK = {
  high: 0,
  medium: 1,
  low: 2,
};

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

export function createDefaultState(now = Date.now()) {
  const today = toISODate(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences: {
      activeFilter: "all",
      theme: "system",
    },
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

export function createTask(draft, now = Date.now(), id = createId("task", now)) {
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

export function updateTask(task, draft, now = Date.now()) {
  return {
    ...task,
    title: normalizeText(draft.title),
    priority: coercePriority(draft.priority),
    dueDate: normalizeDate(draft.dueDate),
    tag: normalizeText(draft.tag),
    updatedAt: now,
  };
}

export function createChecklistItem(id, text, checked = false, now = Date.now()) {
  return {
    id,
    text: normalizeText(text),
    checked,
    createdAt: now,
  };
}

export function createId(prefix, now = Date.now()) {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${now}-${random}`;
}

export function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeDate(value) {
  if (typeof value !== "string") return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function coercePriority(value) {
  if (value === "high" || value === "高") return "high";
  if (value === "low" || value === "低") return "low";
  return "medium";
}

export function coerceFilter(value) {
  if (value === "open" || value === "done" || value === "all") return value;
  return "all";
}

export function coerceTheme(value) {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? 3;
}

export function toISODate(value = Date.now()) {
  const date = typeof value === "number" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function isDueOrOverdue(task, todayISO = toISODate()) {
  return !task.done && Boolean(task.dueDate) && task.dueDate <= todayISO;
}

export function selectVisibleTasks(state, query) {
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

export function buildFeedbackSuggestions(feedback) {
  const normalized = normalizeText(feedback);
  if (!normalized) return [];
  const matched = FEEDBACK_RULES.filter((rule) => rule.keywords.some((keyword) => normalized.includes(keyword))).map((rule) => rule.suggestion);
  if (matched.length > 0) return uniqueStrings(matched);
  return [`澄清并拆解反馈：“${normalized}”。`, "把反馈拆成可验证的小功能并纳入下一轮验收。"];
}

export function deriveNextRound(previousNext, feedback, now = Date.now()) {
  const feedbackItems = buildFeedbackSuggestions(feedback).map((text) => createChecklistItem(createId("next", now), text, false, now));
  const carryItems = previousNext
    .slice(1, 4)
    .map((text, index) => createChecklistItem(createId(`next-${index}`, now + index), text, false, now + index));
  const merged = uniqueChecklistItems([...feedbackItems, ...carryItems]);
  if (merged.length > 0) return merged.slice(0, 5);
  return [
    createChecklistItem(createId("next", now), "验证当前版本的日常记录效率。", false, now),
    createChecklistItem(createId("next", now + 1), "根据真实使用场景补充批量操作。", false, now + 1),
  ];
}

export function hydrateState(input, now = Date.now()) {
  const fallback = createDefaultState(now);
  if (!isRecord(input)) return fallback;
  const source = input;
  const preferences = hydratePreferences(source.preferences, source);
  const currentIteration = hydrateCurrentIteration(source.currentIteration, fallback.currentIteration, now);
  const tasks = Array.isArray(source.tasks) ? source.tasks.map((item, index) => hydrateTask(item, now + index)).filter(Boolean) : fallback.tasks;
  const iterations = Array.isArray(source.iterations)
    ? source.iterations.map((item, index) => hydrateIteration(item, now + index)).filter(Boolean)
    : fallback.iterations;
  return {
    schemaVersion: SCHEMA_VERSION,
    preferences,
    currentIteration,
    tasks,
    iterations,
  };
}

function hydratePreferences(value, legacyRoot) {
  const source = isRecord(value) ? value : legacyRoot;
  return {
    activeFilter: coerceFilter(source.activeFilter),
    theme: coerceTheme(source.theme),
  };
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
  return {
    id: normalizeText(value.id) || fallbackId,
    text,
    checked: Boolean(value.checked),
    createdAt: toTimestamp(value.createdAt, now),
  };
}

function hydrateIteration(value, now) {
  if (!isRecord(value)) return null;
  const title = normalizeText(value.title);
  if (!title) return null;
  const completed = Array.isArray(value.completed) ? value.completed.map(normalizeText).filter(Boolean) : [];
  const next = Array.isArray(value.next) ? value.next.map(normalizeText).filter(Boolean) : [];
  return {
    id: normalizeText(value.id) || createId("iteration", now),
    number: typeof value.number === "number" && Number.isFinite(value.number) ? Math.max(1, Math.floor(value.number)) : 1,
    title,
    completed,
    next,
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

function uniqueStrings(values) {
  return [...new Set(values)];
}

function uniqueChecklistItems(values) {
  const seen = new Set();
  return values.filter((item) => {
    if (seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  });
}

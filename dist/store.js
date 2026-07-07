import {
  buildFeedbackSuggestions,
  createChecklistItem,
  createDefaultState,
  createId,
  createTask,
  deriveNextRound,
  normalizeText,
  updateTask,
} from "./domain.js";

export function createStore(initialState) {
  let state = initialState;
  let previousState = null;
  const past = [];
  const future = [];
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener(state, previousState);
  }

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

export function reduceState(state, action) {
  switch (action.type) {
    case "add-task": {
      const task = createTask(action.draft, action.now);
      if (!task.title) return state;
      return { ...state, tasks: [task, ...state.tasks] };
    }
    case "update-task":
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.id ? updateTask(task, action.draft, action.now) : task)),
      };
    case "toggle-task":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, done: action.done, updatedAt: action.now ?? Date.now() } : task,
        ),
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
      return updateChecklist(state, action.kind, (items) =>
        items.map((item) => (item.id === action.id ? { ...item, checked: action.checked } : item)),
      );
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
  const currentIteration = {
    ...state.currentIteration,
    [kind]: updater(state.currentIteration[kind]),
  };
  return { ...state, currentIteration };
}

function applyFeedback(state, feedback, now = Date.now()) {
  const normalized = normalizeText(feedback);
  if (!normalized) return state;
  const suggestions = buildFeedbackSuggestions(normalized);
  const existing = new Set(state.currentIteration.next.map((item) => item.text));
  const nextItems = suggestions
    .filter((text) => !existing.has(text))
    .map((text, index) => createChecklistItem(createId("next", now + index), text, false, now + index));
  const feedbackTask = createTask(
    {
      title: `处理反馈：${normalized}`,
      priority: "high",
      dueDate: "",
      tag: "反馈",
    },
    now,
  );
  return {
    ...state,
    tasks: [feedbackTask, ...state.tasks],
    currentIteration: {
      ...state.currentIteration,
      next: [...state.currentIteration.next, ...nextItems],
    },
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

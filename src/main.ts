import { createApp, nextTick } from "vue";
import App from "./App.vue";
import "./styles/index.css";
import { createDefaultState, createEmptyState, hydrateState } from "./domain.js";
import { LocalDirectoryBackend, type WorkspaceDirectoryHandle } from "./local-directory-backend.js";
import { createStore } from "./store.js";
import type { AppState } from "./types.js";
import type { WorkspaceBackend } from "./workspace-backend.js";
import { LegacyBrowserImportReader } from "./workspace-db.js";
import { hasLegacyStateInStorage, loadPreferencesFromStorage, savePreferencesToStorage } from "./storage.js";
import { UnavailableWorkspaceBackend } from "./unavailable-workspace-backend.js";
import { clearWorkspaceDirectoryHandle, loadWorkspaceDirectoryHandle, saveWorkspaceDirectoryHandle } from "./workspace-handle-store.js";
import { createDialogs } from "./ui/dialogs.js";
import { createDragAndDrop } from "./ui/drag-drop.js";
import { bindEvents } from "./ui/events.js";
import { refreshStaticIcons } from "./ui/icons.js";
import { createRenderer } from "./ui/renderer.js";
import { queryElements } from "./ui/selectors.js";
import { createWorkspaceController } from "./ui/workspace.js";

createApp(App).mount("#app");
await nextTick();

const els = queryElements();
let backend: WorkspaceBackend = new UnavailableWorkspaceBackend();
let storedDirectoryHandle: WorkspaceDirectoryHandle | null = null;
let directoryRecovery: "none" | "permission" | "replace" = "none";
let unavailableDirectoryName = "";
let loaded = await backend.loadWorkspace();
try {
  storedDirectoryHandle = await loadWorkspaceDirectoryHandle();
  if (storedDirectoryHandle) {
    const candidate = new LocalDirectoryBackend(storedDirectoryHandle);
    if (await candidate.ensurePermission(false)) {
      try {
        loaded = await candidate.loadWorkspace();
        backend = candidate;
      } catch (error) {
        candidate.close();
        unavailableDirectoryName = candidate.workspaceName;
        directoryRecovery = isDirectoryPermissionError(error) ? "permission" : "replace";
        if (directoryRecovery === "replace") {
          storedDirectoryHandle = null;
          await clearWorkspaceDirectoryHandle();
        }
        backend = new UnavailableWorkspaceBackend(
          isDirectoryPermissionError(error) ? `需要重新授权本地目录：${candidate.workspaceName}` : `本地工作区不可用：${candidate.workspaceName}`,
        );
        loaded = await backend.loadWorkspace();
      }
    } else {
      directoryRecovery = "permission";
      backend = new UnavailableWorkspaceBackend(`需要重新授权本地目录：${storedDirectoryHandle.name}`);
      loaded = await backend.loadWorkspace();
    }
  }
} catch {
  directoryRecovery = "replace";
  storedDirectoryHandle = null;
  await clearWorkspaceDirectoryHandle();
  backend = new UnavailableWorkspaceBackend("已保存的本地工作区无法恢复，请重新选择目录。");
  loaded = await backend.loadWorkspace();
}
const storedPreferences = loadPreferencesFromStorage();
if (!backend.available && storedPreferences) loaded.state = { ...createEmptyState(), preferences: storedPreferences };
if (import.meta.env.DEV) {
  const testGlobals = globalThis as typeof globalThis & {
    __workspaceBackendForTests?: WorkspaceBackend;
    __localDirectoryBackendForTests?: typeof LocalDirectoryBackend;
    __createDefaultStateForTests?: typeof createDefaultState;
  };
  testGlobals.__workspaceBackendForTests = backend;
  testGlobals.__localDirectoryBackendForTests = LocalDirectoryBackend;
  testGlobals.__createDefaultStateForTests = createDefaultState;
}
const store = createStore(hydrateState(loaded.state));
const renderer = createRenderer(els);
const dialogs = createDialogs(els);
refreshStaticIcons(document);
updateWorkspaceStorageStatus();
let lastStorageFailureMessage = "";
let lastScheduledState: AppState | null = store.getState();
let currentSave = Promise.resolve(true);
let pendingSaveState: AppState | null = null;
let saveLoop: Promise<boolean> | null = null;
document.documentElement.dataset.workspaceSaveState = backend.available ? "saved" : "unavailable";

function persistState(): Promise<boolean> {
  const state = store.getState();
  savePreferencesToStorage(state.preferences);
  if (!backend.available) return Promise.resolve(true);
  if (state === lastScheduledState) return currentSave;
  lastScheduledState = state;
  pendingSaveState = state;
  document.documentElement.dataset.workspaceSaveState = "saving";
  if (!saveLoop) {
    saveLoop = drainWorkspaceSaves().finally(() => { saveLoop = null; });
    currentSave = saveLoop;
  }
  return currentSave;
}

async function drainWorkspaceSaves(): Promise<boolean> {
  let latestSucceeded = true;
  while (pendingSaveState) {
    const state = pendingSaveState;
    pendingSaveState = null;
    try {
      await backend.saveWorkspaceIndex(state);
      latestSucceeded = true;
      lastStorageFailureMessage = "";
    } catch (error) {
      latestSucceeded = false;
      if (lastScheduledState === state) lastScheduledState = null;
      const message = error instanceof Error ? error.message : "本地任务存储不可用。";
      if (message !== lastStorageFailureMessage) {
        lastStorageFailureMessage = message;
        dialogs.toast(message);
      }
    }
  }
  document.documentElement.dataset.workspaceSaveState = latestSucceeded ? "saved" : "error";
  return latestSucceeded;
}

const workspace = createWorkspaceController(els, store, backend, dialogs, persistState);
const bindings = bindEvents(els, store, dialogs, workspace, backend, persistState, render);
const dragAndDrop = createDragAndDrop(els.taskList, store, bindings.getViewState, (message) => {
  els.liveRegion.textContent = message;
});
store.subscribe((state) => {
  void persistState();
  bindings.reconcileResolutionTimers();
  render();
});

function render(): void {
  bindings.reconcileSelection();
  renderer.render(store.getState(), bindings.getViewState(), store.canUndo(), store.canRedo());
  workspace.syncTaskState();
  dragAndDrop.refresh();
}

bindings.reconcileResolutionTimers();
render();
document.documentElement.dataset.appReady = "true";

window.setInterval(() => {
  if (store.getState().tasks.some((task) => task.pendingResolution)) render();
}, 1_000);
window.addEventListener("pagehide", () => { void currentSave.finally(() => backend.close()); }, { once: true });

els.chooseWorkspaceDirectory.addEventListener("click", () => {
  void switchWorkspaceDirectory(false);
});

els.reauthorizeWorkspaceDirectory.addEventListener("click", () => {
  void switchWorkspaceDirectory(true);
});

async function switchWorkspaceDirectory(reauthorize: boolean): Promise<void> {
  if (!(await flushBeforeBackendSwitch())) return;
  if (!LocalDirectoryBackend.supported()) {
    dialogs.toast("当前浏览器不支持本地目录工作区，请使用最新版 Chrome 或 Edge。");
    return;
  }
  els.chooseWorkspaceDirectory.disabled = true;
  els.reauthorizeWorkspaceDirectory.disabled = true;
  try {
    let handle: WorkspaceDirectoryHandle;
    if (reauthorize && storedDirectoryHandle) {
      handle = storedDirectoryHandle;
    } else {
      const picker = (window as typeof window & {
        showDirectoryPicker(options?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker;
      handle = await picker.call(window, { id: "task-workbench-workspace", mode: "readwrite" }) as WorkspaceDirectoryHandle;
    }
    const directoryBackend = new LocalDirectoryBackend(handle);
    if (!(await directoryBackend.ensurePermission(true))) {
      dialogs.toast("未获得目录读写权限，请重新授权原目录或改选本地目录。");
      return;
    }

    const existing = await directoryBackend.loadWorkspace();
    if (existing.recovered) {
      if (!(await dialogs.confirm("打开本地工作区", `切换到“${handle.name}”并重新加载其中的任务吗？`))) return;
    } else {
      const setup = await dialogs.chooseWorkspaceSetup(handle.name);
      if (!setup) return;
      if (setup === "import") {
        if (!hasLegacyStateInStorage()) {
          dialogs.toast("没有找到可迁移的旧浏览器任务数据，请创建空工作区。");
          return;
        }
        const legacyBackend = await LegacyBrowserImportReader.open();
        if (!legacyBackend.available) {
          legacyBackend.close();
          dialogs.toast("旧浏览器数据不可读取，请改为创建空工作区。");
          return;
        }
        try {
          const legacyLoaded = await legacyBackend.loadWorkspace();
          if (!legacyLoaded.recovered) {
            dialogs.toast("没有找到可迁移的有效旧浏览器任务数据，请创建空工作区。");
            return;
          }
          await directoryBackend.importSnapshot(await legacyBackend.exportSnapshot());
        } finally {
          legacyBackend.close();
        }
      } else {
        await directoryBackend.importSnapshot({ state: { ...createEmptyState(), preferences: store.getState().preferences }, workLogs: [], attachments: [], attachmentBlobs: new Map() });
      }
    }
    await saveWorkspaceDirectoryHandle(handle);
    window.location.reload();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (reauthorize && isUnavailableDirectoryHandleError(error)) {
      unavailableDirectoryName = storedDirectoryHandle?.name ?? unavailableDirectoryName;
      storedDirectoryHandle = null;
      directoryRecovery = "replace";
      await clearWorkspaceDirectoryHandle();
      updateWorkspaceStorageStatus();
      dialogs.toast("原目录已移动、删除或无法恢复，请改选本地目录。旧浏览器数据不会自动作为运行时数据加载。");
      return;
    }
    dialogs.toast(error instanceof Error ? error.message : "本地工作区切换失败，当前数据未更改。");
  } finally {
    els.chooseWorkspaceDirectory.disabled = false;
    els.reauthorizeWorkspaceDirectory.disabled = false;
  }
}

function updateWorkspaceStorageStatus(): void {
  const localBackend = backend instanceof LocalDirectoryBackend ? backend : null;
  const local = Boolean(localBackend);
  els.workspaceStorageStatus.textContent = local
    ? `本地目录：${localBackend!.workspaceName}`
    : directoryRecovery === "permission" && storedDirectoryHandle
      ? `需要重新授权：${storedDirectoryHandle.name}`
      : directoryRecovery === "replace" && unavailableDirectoryName
        ? `原工作区不可用：${unavailableDirectoryName}`
      : backend.errorMessage || "尚未选择本地工作区";
  els.workspaceStorageIndicator.classList.toggle("local", local);
  els.workspaceStorageIndicator.classList.toggle("attention", directoryRecovery !== "none");
  document.documentElement.dataset.workspaceWritable = String(local);
  const directoryAction = directoryRecovery === "replace" ? "改选本地目录" : local ? "切换本地目录" : "选择本地目录";
  els.chooseWorkspaceDirectory.querySelector("span")!.textContent = directoryAction;
  els.chooseWorkspaceDirectory.title = directoryAction;
  els.chooseWorkspaceDirectory.setAttribute("aria-label", directoryAction);
  els.reauthorizeWorkspaceDirectory.hidden = directoryRecovery !== "permission" || !storedDirectoryHandle;
  for (const control of [els.exportData, els.importData, els.importHistory, els.resetDemo, els.undoAction, els.redoAction]) {
    control.disabled = !local;
    control.setAttribute("aria-disabled", String(!local));
  }
  [els.globalNewTask, els.newFolder, ...document.querySelectorAll<HTMLButtonElement>(".create-task-action, .create-folder-action")]
    .forEach((control) => updateWorkspaceRequiredControl(control, local));
}

function updateWorkspaceRequiredControl(control: HTMLButtonElement, workspaceWritable: boolean): void {
  control.dataset.workspaceAvailableTitle ??= control.title;
  const constrained = control.dataset.workspaceConstraintDisabled === "true";
  const disabled = !workspaceWritable || constrained;
  control.disabled = disabled;
  control.setAttribute("aria-disabled", String(disabled));
  control.title = workspaceWritable ? control.dataset.workspaceAvailableTitle : "请先选择本地工作区目录";
}

async function flushBeforeBackendSwitch(): Promise<boolean> {
  if (!(await bindings.flushWorkspace()) || !(await currentSave)) {
    dialogs.toast("仍有内容未保存，工作区切换已取消。");
    return false;
  }
  return true;
}

let externalChangeNotified = false;
window.addEventListener("workspace-external-change", () => {
  if (externalChangeNotified || !(backend instanceof LocalDirectoryBackend)) return;
  externalChangeNotified = true;
  dialogs.toast("本地工作区已在另一个标签页更新，请刷新页面后继续编辑。");
});

if (loaded.message) {
  dialogs.toast(loaded.message);
} else if (backend.errorMessage) {
  dialogs.toast(backend.errorMessage);
}

function isDirectoryPermissionError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "NotAllowedError" || error.name === "SecurityError"
    : error instanceof Error && error.message.includes("重新授权");
}

function isUnavailableDirectoryHandleError(error: unknown): boolean {
  return error instanceof Error && ["NotFoundError", "InvalidStateError"].includes(error.name);
}

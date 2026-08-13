import { createApp, nextTick } from "vue";
import App from "./App.vue";
import "./styles/index.css";
import { hydrateState } from "./domain.js";
import { LocalDirectoryBackend, type WorkspaceDirectoryHandle } from "./local-directory-backend.js";
import { createStore } from "./store.js";
import type { AppState } from "./types.js";
import type { WorkspaceBackend } from "./workspace-backend.js";
import { IndexedDbBackend } from "./workspace-db.js";
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
const browserBackend = await IndexedDbBackend.open();
let backend: WorkspaceBackend = browserBackend;
let storedDirectoryHandle: WorkspaceDirectoryHandle | null = null;
let directoryRecovery: "none" | "permission" | "replace" = "none";
let unavailableDirectoryName = "";
try {
  storedDirectoryHandle = await loadWorkspaceDirectoryHandle();
  if (storedDirectoryHandle) {
    const candidate = new LocalDirectoryBackend(storedDirectoryHandle);
    if (await candidate.ensurePermission(false)) backend = candidate;
    else directoryRecovery = "permission";
  }
} catch {
  directoryRecovery = "replace";
}
let loaded;
try {
  loaded = await backend.loadWorkspace();
} catch (error) {
  if (backend !== browserBackend) {
    unavailableDirectoryName = (backend as LocalDirectoryBackend).workspaceName;
    backend = browserBackend;
    directoryRecovery = isDirectoryPermissionError(error) ? "permission" : "replace";
    if (directoryRecovery === "replace") {
      storedDirectoryHandle = null;
      await clearWorkspaceDirectoryHandle();
    }
    loaded = await browserBackend.loadWorkspace();
    loaded.message = error instanceof Error
      ? `本地工作区无法打开，已回退到浏览器存储：${error.message}`
      : "本地工作区无法打开，已回退到浏览器存储。";
  } else {
    throw error;
  }
}
if (import.meta.env.DEV) {
  const testGlobals = globalThis as typeof globalThis & {
    __workspaceBackendForTests?: WorkspaceBackend;
    __localDirectoryBackendForTests?: typeof LocalDirectoryBackend;
  };
  testGlobals.__workspaceBackendForTests = backend;
  testGlobals.__localDirectoryBackendForTests = LocalDirectoryBackend;
}
const store = createStore(hydrateState(loaded.state));
const renderer = createRenderer(els);
const dialogs = createDialogs(els);
refreshStaticIcons(document);
updateWorkspaceStorageStatus();
let lastStorageFailureMessage = "";
let lastScheduledState: AppState | null = store.getState();
let currentSave = Promise.resolve(true);
let writeQueue = Promise.resolve();

function persistState(): Promise<boolean> {
  const state = store.getState();
  if (state === lastScheduledState) return currentSave;
  lastScheduledState = state;
  const write = writeQueue.then(() => backend.saveWorkspaceIndex(state));
  writeQueue = write.catch(() => undefined);
  currentSave = write.then(() => {
    lastStorageFailureMessage = "";
    return true;
  }, (error: unknown) => {
    if (lastScheduledState === state) lastScheduledState = null;
    const message = error instanceof Error ? error.message : "本地任务存储不可用。";
    if (message !== lastStorageFailureMessage) {
      lastStorageFailureMessage = message;
      dialogs.toast(message);
    }
    return false;
  });
  return currentSave;
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
window.addEventListener("pagehide", () => {
  backend.close();
  if (backend !== browserBackend) browserBackend.close();
}, { once: true });

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
      dialogs.toast("未获得目录读写权限，继续使用浏览器存储。");
      return;
    }

    const existing = await directoryBackend.loadWorkspace();
    if (existing.recovered) {
      if (!(await dialogs.confirm("打开本地工作区", `切换到“${handle.name}”并重新加载其中的任务吗？`))) return;
    } else {
      if (!(await dialogs.confirm("创建本地工作区", `将当前任务、工作记录和附件复制到“${handle.name}”吗？`))) return;
      await directoryBackend.importSnapshot(await backend.exportSnapshot());
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
      dialogs.toast("原目录已移动、删除或无法恢复，请改选本地目录；浏览器数据仍然保留。");
      return;
    }
    dialogs.toast(error instanceof Error ? error.message : "本地工作区切换失败，当前数据未更改。");
  } finally {
    els.chooseWorkspaceDirectory.disabled = false;
    els.reauthorizeWorkspaceDirectory.disabled = false;
  }
}

els.useBrowserStorage.addEventListener("click", async () => {
  if (backend === browserBackend) return;
  if (!(await flushBeforeBackendSwitch())) return;
  if (!(await dialogs.confirm("切回浏览器存储", "将当前本地工作区完整复制到浏览器存储，并重新加载吗？"))) return;
  els.useBrowserStorage.disabled = true;
  try {
    await browserBackend.importSnapshot(await backend.exportSnapshot());
    await clearWorkspaceDirectoryHandle();
    window.location.reload();
  } catch (error) {
    dialogs.toast(error instanceof Error ? error.message : "切换失败，当前工作区未更改。");
    els.useBrowserStorage.disabled = false;
  }
});

function updateWorkspaceStorageStatus(): void {
  const localBackend = backend instanceof LocalDirectoryBackend ? backend : null;
  const local = Boolean(localBackend);
  els.workspaceStorageStatus.textContent = local
    ? `本地目录：${localBackend!.workspaceName}`
    : directoryRecovery === "permission" && storedDirectoryHandle
      ? `需要重新授权：${storedDirectoryHandle.name}`
      : directoryRecovery === "replace" && unavailableDirectoryName
        ? `原工作区不可用：${unavailableDirectoryName}`
      : "浏览器存储";
  els.workspaceStorageIndicator.classList.toggle("local", local);
  els.workspaceStorageIndicator.classList.toggle("attention", directoryRecovery !== "none");
  const directoryAction = directoryRecovery === "replace" ? "改选本地目录" : local ? "切换本地目录" : "选择本地目录";
  els.chooseWorkspaceDirectory.querySelector("span")!.textContent = directoryAction;
  els.chooseWorkspaceDirectory.title = directoryAction;
  els.chooseWorkspaceDirectory.setAttribute("aria-label", directoryAction);
  els.reauthorizeWorkspaceDirectory.hidden = directoryRecovery !== "permission" || !storedDirectoryHandle;
  els.useBrowserStorage.hidden = !local;
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

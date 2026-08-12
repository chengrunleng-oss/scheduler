import { createApp, nextTick } from "vue";
import App from "./App.vue";
import "./styles/index.css";
import { hydrateState } from "./domain.js";
import { loadStateFromStorage, saveStateToStorage } from "./storage.js";
import { createStore } from "./store.js";
import { WorkspaceRepository } from "./workspace-db.js";
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
const loaded = loadStateFromStorage();
const store = createStore(hydrateState(loaded.state));
const renderer = createRenderer(els);
const dialogs = createDialogs(els);
const repository = await WorkspaceRepository.open();
refreshStaticIcons(document);
let lastStorageFailureMessage = "";

function persistState(): boolean {
  const saveResult = saveStateToStorage(store.getState());
  if (!saveResult.saved && saveResult.message !== lastStorageFailureMessage) {
    lastStorageFailureMessage = saveResult.message;
    dialogs.toast(saveResult.message);
  } else if (saveResult.saved) {
    lastStorageFailureMessage = "";
  }
  return saveResult.saved;
}

const workspace = createWorkspaceController(els, store, repository, dialogs, persistState);
const bindings = bindEvents(els, store, dialogs, workspace, repository, persistState, render);
const dragAndDrop = createDragAndDrop(els.taskList, store, bindings.getViewState, (message) => {
  els.liveRegion.textContent = message;
});
store.subscribe((state) => {
  persistState();
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

window.setInterval(() => {
  if (store.getState().tasks.some((task) => task.pendingResolution)) render();
}, 1_000);

if (loaded.message) {
  dialogs.toast(loaded.message);
} else if (repository.errorMessage) {
  dialogs.toast(repository.errorMessage);
}

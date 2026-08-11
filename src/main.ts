import { hydrateState } from "./domain.js";
import { loadStateFromStorage, saveStateToStorage } from "./storage.js";
import { createStore } from "./store.js";
import { createDialogs } from "./ui/dialogs.js";
import { createDragAndDrop } from "./ui/drag-drop.js";
import { bindEvents } from "./ui/events.js";
import { refreshStaticIcons } from "./ui/icons.js";
import { createRenderer } from "./ui/renderer.js";
import { queryElements } from "./ui/selectors.js";

const els = queryElements();
const loaded = loadStateFromStorage();
const store = createStore(hydrateState(loaded.state));
const renderer = createRenderer(els);
const dialogs = createDialogs(els);
refreshStaticIcons(document);
const bindings = bindEvents(els, store, dialogs, render);
const dragAndDrop = createDragAndDrop(els.taskList, store, bindings.getViewState, (message) => {
  els.liveRegion.textContent = message;
});
let lastStorageFailureMessage = "";

store.subscribe((state) => {
  const saveResult = saveStateToStorage(state);
  if (!saveResult.saved && saveResult.message !== lastStorageFailureMessage) {
    lastStorageFailureMessage = saveResult.message;
    dialogs.toast(saveResult.message);
  } else if (saveResult.saved) {
    lastStorageFailureMessage = "";
  }
  bindings.reconcileResolutionTimers();
  render();
});

function render(): void {
  bindings.reconcileSelection();
  renderer.render(store.getState(), bindings.getViewState(), store.canUndo(), store.canRedo());
  dragAndDrop.refresh();
}

bindings.reconcileResolutionTimers();
render();

window.setInterval(() => {
  if (store.getState().tasks.some((task) => task.pendingResolution)) render();
}, 1_000);

if (loaded.message) {
  dialogs.toast(loaded.message);
}

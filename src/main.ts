import { hydrateState } from "./domain.js";
import { loadStateFromStorage, saveStateToStorage } from "./storage.js";
import { createStore } from "./store.js";
import { createDialogs } from "./ui/dialogs.js";
import { bindEvents } from "./ui/events.js";
import { createRenderer } from "./ui/renderer.js";
import { queryElements } from "./ui/selectors.js";

const els = queryElements();
const loaded = loadStateFromStorage();
const store = createStore(hydrateState(loaded.state));
const renderer = createRenderer(els);
const dialogs = createDialogs(els);
const bindings = bindEvents(els, store, dialogs, render);
let lastStorageFailureMessage = "";

store.subscribe((state, previous) => {
  const saveResult = saveStateToStorage(state);
  if (!saveResult.saved && saveResult.message !== lastStorageFailureMessage) {
    lastStorageFailureMessage = saveResult.message;
    dialogs.toast(saveResult.message);
  } else if (saveResult.saved) {
    lastStorageFailureMessage = "";
  }
  renderer.render(state, previous, bindings.getQuery(), store.canUndo(), store.canRedo());
});

function render(): void {
  renderer.render(store.getState(), null, bindings.getQuery(), store.canUndo(), store.canRedo());
}

render();

if (loaded.message) {
  dialogs.toast(loaded.message);
}

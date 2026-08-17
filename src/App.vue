<script setup lang="ts">
import AppDialogs from "./components/AppDialogs.vue";
import AppSidebar from "./components/AppSidebar.vue";
import TaskBoard from "./components/TaskBoard.vue";
import TaskWorkspace from "./components/TaskWorkspace.vue";
</script>

<template>
  <div id="appShell" class="app-shell">
    <AppSidebar />
    <TaskBoard />
    <TaskWorkspace />
  </div>
  <AppDialogs />
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <div id="liveRegion" class="sr-only" role="status" aria-live="assertive" aria-atomic="true"></div>
</template>

<style scoped>
.toast {
  position: fixed;
  z-index: 60;
  right: 20px;
  bottom: 20px;
  max-width: min(380px, calc(100vw - 40px));
}

.app-shell.workspace-open ~ .toast {
  bottom: 88px;
}

@media (max-width: 880px) {
  .app-shell.workspace-open ~ .toast {
    right: 12px;
    bottom: calc(140px + env(safe-area-inset-bottom));
    max-width: calc(100vw - 24px);
  }
}
</style>

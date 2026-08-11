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

<template>
  <main class="workspace">
    <header class="topbar">
      <div class="workspace-title">
        <button class="icon-button nav-toggle" id="navToggle" type="button" title="打开导航" aria-label="打开导航"><i data-lucide="panel-left"></i></button>
        <h2 id="workspaceTitle">全部任务</h2>
      </div>
      <div class="topbar-actions">
        <button class="icon-button" id="undoAction" type="button" title="撤销" aria-label="撤销"><i data-lucide="undo-2"></i></button>
        <button class="icon-button" id="redoAction" type="button" title="重做" aria-label="重做"><i data-lucide="redo-2"></i></button>
        <label class="theme-control" title="主题"><span class="sr-only">主题</span><select id="themeSelect" aria-label="主题"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <input id="importFile" class="file-input" type="file" accept="application/zip,application/json,.zip,.json" />
        <button class="icon-button" id="importData" type="button" title="导入备份" aria-label="导入备份"><i data-lucide="upload"></i></button>
        <button class="icon-button" id="exportData" type="button" title="导出备份" aria-label="导出备份"><i data-lucide="download"></i></button>
      </div>
    </header>

    <section class="board" aria-label="任务列表">
      <div class="board-toolbar">
        <label class="search-wrap"><i data-lucide="search"></i><span class="sr-only">搜索任务</span><input id="searchInput" type="search" placeholder="搜索标题、说明、标签或状态" /></label>
        <div class="segmented view-segments" role="group" aria-label="任务视图">
          <button class="segment view-segment active" data-view="tree_manual" type="button">任务树</button>
          <button class="segment view-segment" data-view="global_priority" type="button">全局优先级</button>
          <button class="segment view-segment" data-view="global_due_date" type="button">全局日期</button>
          <button class="segment view-segment" data-view="priority_then_due_date" type="button">优先级＋日期</button>
        </div>
      </div>
      <div class="filterbar">
        <div class="segmented status-segments" role="group" aria-label="任务状态筛选">
          <button class="segment status-segment active" data-filter="all" type="button">全部</button>
          <button class="segment status-segment" data-filter="active" type="button">待办</button>
          <button class="segment status-segment" data-filter="completed" type="button">已完成</button>
          <button class="segment status-segment" data-filter="discarded" type="button">不再需要</button>
        </div>
        <p id="dragHint" class="mode-hint">任务树中可拖动待办任务和优先级分界线</p>
      </div>
      <div class="list-head" aria-hidden="true"><span>任务</span><span>优先级</span><span>截止日期</span><span>操作</span></div>
      <div id="taskList" class="task-list" role="listbox" aria-label="任务"></div>
      <div id="emptyState" class="empty-state" hidden><strong>没有匹配的任务</strong><span>调整筛选条件，或新建一项任务。</span></div>
    </section>
  </main>
</template>

<style scoped>
.workspace,
.board,
.board-toolbar,
.filterbar {
  min-width: 0;
}

.topbar-actions {
  flex-wrap: nowrap;
}
</style>

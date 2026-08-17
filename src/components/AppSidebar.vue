<template>
  <aside id="sidebar" class="sidebar" aria-label="任务导航">
    <header class="brand">
      <div class="brand-mark" aria-hidden="true">任</div>
      <div class="brand-copy"><h1>任务工作台</h1><p>清楚安排，专注完成</p></div>
      <button class="icon-button sidebar-close" id="sidebarClose" type="button" title="关闭导航" aria-label="关闭导航"><i data-lucide="x"></i></button>
    </header>

    <section class="sidebar-section sidebar-create">
      <button class="button primary wide" id="globalNewTask" type="button" title="新建任务" aria-label="新建任务"><i data-lucide="list-plus"></i><span>新建任务</span></button>
    </section>

    <section class="sidebar-section folder-section">
      <div class="section-heading">
        <h2>文件夹</h2>
        <button class="icon-button subtle" id="newFolder" type="button" title="新建根文件夹" aria-label="新建根文件夹"><i data-lucide="folder-plus"></i></button>
      </div>
      <nav id="folderTree" class="folder-tree" aria-label="文件夹树"></nav>
    </section>

    <details class="sidebar-section defaults-section">
      <summary><span><i data-lucide="settings-2"></i>新任务默认值</span></summary>
      <div class="field-grid defaults-grid">
        <label class="field"><span>截止日期</span><select id="defaultDueDate"><option value="today">今天</option><option value="tomorrow">明天</option><option value="next_workday">下个工作日</option><option value="none">不设置</option></select></label>
        <label class="field"><span>优先级</span><select id="defaultPriority"><option value="high">高</option><option value="low">低</option></select></label>
        <label class="field"><span>近期活跃标记</span><select id="recentWorklogDays" aria-label="近期活跃标记的时间窗口"><option value="7">一周内（默认）</option><option value="1">今天</option><option value="3">三天内</option><option value="14">两周内</option><option value="30">一个月内</option><option value="0">关闭标记</option></select></label>
      </div>
    </details>

    <section class="sidebar-section workspace-storage-section">
      <div class="section-heading"><h2>工作区</h2><span id="workspaceStorageIndicator" class="workspace-storage-indicator" aria-hidden="true"></span></div>
      <p id="workspaceStorageStatus" class="workspace-storage-status">尚未选择本地工作区</p>
      <div class="workspace-storage-actions">
        <button id="chooseWorkspaceDirectory" class="button secondary wide" type="button" title="选择本地目录" aria-label="选择本地目录"><i data-lucide="folder-open"></i><span>选择本地目录</span></button>
        <button id="reauthorizeWorkspaceDirectory" class="button ghost wide" type="button" title="重新授权原目录" aria-label="重新授权原目录" hidden><i data-lucide="folder-pen"></i><span>重新授权原目录</span></button>
      </div>
    </section>

    <section class="sidebar-section overview-section">
      <div class="section-heading"><h2>任务概览</h2><button class="icon-button subtle" id="resetDemo" type="button" title="重置为示例数据" aria-label="重置为示例数据"><i data-lucide="rotate-ccw"></i></button></div>
      <div class="metric-grid">
        <div class="metric"><span id="metricActive">0</span><small>待办</small></div>
        <div class="metric"><span id="metricCompleted">0</span><small>完成</small></div>
        <div class="metric"><span id="metricDiscarded">0</span><small>不再需要</small></div>
        <div class="metric"><span id="metricDue">0</span><small>今日/逾期</small></div>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.brand-copy,
.section-heading,
.defaults-grid,
.metric-grid {
  min-width: 0;
}

.brand-copy h1,
.section-heading h2 {
  letter-spacing: 0;
}

.workspace-storage-status {
  overflow: hidden;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-storage-actions {
  display: grid;
  gap: 6px;
  margin-top: 9px;
}

.workspace-storage-actions .button {
  justify-content: flex-start;
}

.workspace-storage-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
}

.workspace-storage-indicator.local { background: var(--completed); }
.workspace-storage-indicator.attention { background: var(--pending); }

@media (min-width: 881px) and (max-width: 1180px) {
  .workspace-storage-section {
    display: grid;
    justify-items: center;
    padding-inline: 16px;
  }

  .workspace-storage-section .section-heading {
    min-height: 8px;
    justify-content: center;
  }

  .workspace-storage-section .section-heading h2,
  .workspace-storage-status,
  .workspace-storage-actions .button span {
    display: none;
  }

  .workspace-storage-actions {
    justify-items: center;
    margin-top: 7px;
  }

  .workspace-storage-actions .button {
    width: 40px;
    min-width: 40px;
    height: 40px;
    min-height: 40px;
    justify-content: center;
    padding: 0;
  }
}
</style>

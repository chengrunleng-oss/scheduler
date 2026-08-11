<template>
  <aside id="sidebar" class="sidebar" aria-label="任务导航">
    <header class="brand">
      <div class="brand-mark" aria-hidden="true">任</div>
      <div class="brand-copy"><h1>任务工作台</h1><p>清楚安排，专注完成</p></div>
      <button class="icon-button sidebar-close" id="sidebarClose" type="button" title="关闭导航" aria-label="关闭导航"><i data-lucide="x"></i></button>
    </header>

    <section class="sidebar-section sidebar-create">
      <button class="button primary wide" id="globalNewTask" type="button"><i data-lucide="list-plus"></i><span>新建任务</span></button>
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
      </div>
    </details>

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

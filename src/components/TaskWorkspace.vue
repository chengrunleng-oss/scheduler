<template>
  <aside id="taskDetail" class="detail-panel" aria-label="任务工作区">
    <div id="detailResizer" class="detail-resizer" role="separator" aria-label="调整任务工作区宽度" aria-orientation="vertical" tabindex="0"></div>
    <header class="detail-header"><div><p class="eyebrow">当前选择</p><h2>任务工作区</h2></div><button class="icon-button detail-close" id="detailClose" type="button" title="关闭任务工作区" aria-label="关闭任务工作区"><i data-lucide="x"></i></button></header>
    <div id="workspaceTabs" class="workspace-tabs" role="tablist" aria-label="任务工作区页面">
      <button id="overviewTab" class="workspace-tab active" type="button" role="tab" data-workspace-tab="overview" aria-controls="overviewPanel" aria-selected="true">概览</button>
      <button id="worklogTab" class="workspace-tab" type="button" role="tab" data-workspace-tab="worklog" aria-controls="worklogPanel" aria-selected="false">工作记录</button>
      <button id="attachmentsTab" class="workspace-tab" type="button" role="tab" data-workspace-tab="attachments" aria-controls="attachmentsPanel" aria-selected="false">附件</button>
    </div>
    <div id="detailEmpty" class="detail-empty"><strong>选择任务以查看详情</strong></div>
    <div id="workspaceContent" class="workspace-content" hidden>
      <section id="overviewPanel" class="workspace-panel active" role="tabpanel" aria-labelledby="overviewTab">
        <form id="detailForm" class="detail-form" autocomplete="off">
          <div class="detail-fields">
            <div class="status-line"><div id="detailStatusBadge" class="detail-status"></div><span id="overviewSaveStatus" class="save-status" aria-live="polite">已保存</span></div>
            <label class="field"><span>任务名称</span><textarea id="detailTitle" rows="3" maxlength="180" required></textarea></label>
            <label class="field"><span>说明</span><textarea id="detailNotes" rows="5" maxlength="2000" placeholder="补充背景、步骤或结果"></textarea></label>
            <div class="field-grid">
              <label class="field"><span>优先级</span><select id="detailPriority"><option value="high">高</option><option value="low">低</option></select></label>
              <label class="field"><span>文件夹</span><select id="detailFolder"></select></label>
            </div>
            <div class="field-grid">
              <label class="field"><span>截止日期</span><input id="detailDueDate" type="date" /></label>
              <label class="field"><span>标签</span><input id="detailTag" type="text" maxlength="24" /></label>
            </div>
            <label class="field"><span>改期原因</span><input id="detailRescheduleReason" type="text" maxlength="120" placeholder="延期时可选填" /></label>
            <dl class="timestamps"><div><dt>创建时间</dt><dd id="detailCreatedAt">-</dd></div><div><dt>更新时间</dt><dd id="detailUpdatedAt">-</dd></div></dl>
            <section id="timelineSection" class="timeline-section" aria-labelledby="timelineTitle" hidden><h3 id="timelineTitle">变更记录</h3><ol id="rescheduleTimeline" class="timeline"></ol></section>
          </div>
          <div class="detail-actions"><button class="button ghost" id="cancelDetail" type="button">取消</button><button class="button primary" type="submit">保存更改</button></div>
        </form>
      </section>
      <section id="worklogPanel" class="workspace-panel worklog-panel" role="tabpanel" aria-labelledby="worklogTab" hidden>
        <div class="editor-section" id="descriptionSection">
          <div class="workspace-section-heading"><h3>长期描述</h3><button class="icon-button subtle section-collapse-toggle" id="collapseDescription" type="button" title="折叠长期描述" aria-label="折叠长期描述" aria-pressed="false"><i data-lucide="chevron-down"></i></button><button class="icon-button subtle section-zoom" id="zoomDescription" type="button" title="放大长期描述" aria-label="放大长期描述" aria-pressed="false"></button><button class="button text-button" id="exportDescriptionPdf" type="button" title="导出长期描述为 PDF"><i data-lucide="download"></i><span>导出 PDF</span></button><span id="descriptionSaveStatus" class="save-status" aria-live="polite">已保存</span><button id="descriptionRetry" class="button text-button" type="button" hidden>重试</button></div>
          <div id="descriptionEditor" class="markdown-editor" aria-label="长期描述编辑器"></div>
        </div>
        <div class="editor-section daily-section" id="dailySection">
          <div class="workspace-section-heading daily-heading"><h3>每日记录</h3><button class="icon-button subtle section-collapse-toggle" id="collapseDaily" type="button" title="折叠每日记录" aria-label="折叠每日记录" aria-pressed="false"><i data-lucide="chevron-down"></i></button><button class="icon-button subtle section-zoom" id="zoomDaily" type="button" title="放大每日记录" aria-label="放大每日记录" aria-pressed="false"></button><button class="button text-button" id="exportWorklogPdf" type="button" title="导出当前每日记录为 PDF"><i data-lucide="download"></i><span>导出 PDF</span></button><button id="newWorklog" class="button secondary compact-button" type="button"><i data-lucide="circle-plus"></i><span>新建记录</span></button><label class="compact-field"><span class="sr-only">工作日期</span><input id="worklogDate" type="date" /></label><label class="progress-field"><span>进度</span><input id="worklogProgress" type="number" min="0" max="100" step="1" inputmode="numeric" /><span>%</span></label></div>
          <div class="editor-save-line"><span id="worklogSaveStatus" class="save-status" aria-live="polite">已保存</span><button id="worklogRetry" class="button text-button" type="button" hidden>重试</button></div>
          <div id="worklogEditor" class="markdown-editor" aria-label="每日工作记录编辑器"></div>
        </div>
        <section class="worklog-history-section" id="worklogHistorySection" aria-labelledby="worklogHistoryTitle"><div class="workspace-section-heading"><h3 id="worklogHistoryTitle">历史记录</h3><button class="icon-button subtle section-zoom" id="zoomHistory" type="button" title="放大历史记录" aria-label="放大历史记录" aria-pressed="false"></button></div><nav id="historyZoomToc" class="history-zoom-toc" aria-label="历史记录日期目录" hidden></nav><div id="worklogUndo" class="worklog-undo" role="status" hidden><span id="worklogUndoText"></span><button id="undoWorklogDelete" class="button text-button" type="button">撤销删除</button></div><div id="worklogHistory" class="worklog-history"></div></section>
      </section>
      <section id="attachmentsPanel" class="workspace-panel attachments-panel" role="tabpanel" aria-labelledby="attachmentsTab" hidden>
        <input id="attachmentFile" class="file-input" type="file" multiple />
        <input id="descriptionImportFile" class="file-input" type="file" accept="text/markdown,text/plain,.md,.markdown,.txt" />
        <input id="worklogImportFile" class="file-input" type="file" accept="text/markdown,text/plain,application/json,text/csv,.md,.markdown,.txt,.json,.csv,.log" />
        <div class="attachment-toolbar">
          <button id="addAttachment" class="button primary" type="button"><i data-lucide="paperclip"></i><span>添加附件</span></button>
          <button id="openTaskFolder" class="button secondary" type="button"><i data-lucide="folder-open"></i><span>打开任务文件夹</span></button>
          <button id="importDescription" class="button secondary" type="button"><i data-lucide="file-input"></i><span>导入长期描述</span></button>
          <button id="importWorklog" class="button secondary" type="button"><i data-lucide="notebook-tabs"></i><span>导入每日记录</span></button>
          <button id="migrateEmbeddedImages" class="button secondary" type="button"><i data-lucide="images"></i><span>整理内嵌图片</span></button>
        </div>
        <p id="attachmentDropHint" class="attachment-drop-hint">也可以把文件直接拖到下方列表区域上传，单个文件不超过 20 MB。</p>
        <div class="storage-meter"><div class="storage-copy"><span>本地附件空间</span><strong id="storageUsage">0 B</strong></div><progress id="storageProgress" max="100" value="0"></progress></div>
        <div id="attachmentList" class="attachment-list"></div>
        <div id="attachmentPreview" class="attachment-preview" hidden></div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.detail-panel,
.workspace-content,
.workspace-panel {
  min-width: 0;
}

.workspace-tabs {
  isolation: isolate;
}

.detail-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.attachment-drop-hint {
  margin: -6px 0 4px;
  color: var(--muted);
  font-size: 12px;
}

.attachments-panel.drag-over {
  border-radius: 8px;
  background: var(--teal-soft);
  outline: 2px dashed var(--teal);
  outline-offset: -8px;
}
</style>

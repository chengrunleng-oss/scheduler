<template>
  <dialog id="folderDialog" class="modal"><form id="folderDialogForm" class="modal-card stack"><div class="modal-head"><h2 id="folderDialogTitle">新建文件夹</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭"><i data-lucide="x"></i></button></div><label class="field"><span>名称</span><input id="folderName" type="text" maxlength="48" required /></label><label class="field"><span>上级文件夹</span><select id="folderParent"></select></label><div class="modal-actions"><button class="button ghost" type="button" data-close-dialog>取消</button><button class="button primary" type="submit">保存</button></div></form></dialog>
  <dialog id="folderMoveDialog" class="modal"><form id="folderMoveForm" class="modal-card stack"><div class="modal-head"><h2>移动文件夹</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭"><i data-lucide="x"></i></button></div><p id="folderMoveName" class="confirm-text"></p><label class="field"><span>目标上级</span><select id="folderMoveParent"></select></label><label class="field"><span>同级位置</span><select id="folderMovePosition"></select></label><div class="modal-actions"><button class="button ghost" type="button" data-close-dialog>取消</button><button class="button primary" type="submit">确认移动</button></div></form></dialog>
  <dialog id="folderDeleteDialog" class="modal"><form class="modal-card stack"><div class="modal-head"><h2>删除非空文件夹</h2><button class="icon-button" id="folderDeleteClose" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div><p id="folderDeleteText" class="confirm-text"></p><div class="choice-actions"><button class="button secondary" id="folderDeleteMove" type="button">内容移到上一级</button><button class="button danger-button" id="folderDeleteBranch" type="button">删除整个分支</button><button class="button ghost" id="folderDeleteCancel" type="button">取消</button></div></form></dialog>
  <dialog id="confirmDialog" class="modal"><form class="modal-card stack"><div class="modal-head"><h2 id="confirmTitle">确认操作</h2><button class="icon-button" id="confirmClose" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div><p id="confirmText" class="confirm-text"></p><div class="modal-actions"><button class="button ghost" id="confirmCancel" type="button">取消</button><button class="button primary" id="confirmOk" type="button">确认</button></div></form></dialog>
  <dialog id="workspaceSetupDialog" class="modal"><form class="modal-card stack"><div class="modal-head"><h2>初始化本地工作区</h2><button class="icon-button" id="workspaceSetupCancel" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div><p class="confirm-text"></p><div class="choice-actions"><button class="button secondary" id="workspaceSetupImport" type="button">从旧数据导入</button><button class="button primary" id="workspaceSetupEmpty" type="button">创建空工作区</button></div></form></dialog>
  <dialog id="conflictDialog" class="modal"><form class="modal-card stack"><div class="modal-head"><h2>检测到外部修改</h2><button class="icon-button" id="conflictClose" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div><p id="conflictText" class="confirm-text"></p><div class="conflict-actions"><button class="button primary" id="conflictReload" type="button">重新加载外部版本</button><button class="button secondary" id="conflictCopy" type="button">保存当前内容为冲突副本</button><button class="button ghost" id="conflictCancel" type="button">取消保存</button></div></form></dialog>

  <dialog id="importCenterDialog" class="modal import-center-dialog">
    <div class="modal-card import-center-card">
      <div class="modal-head"><div><p class="modal-eyebrow">导入中心</p><h2>预览并合并备份</h2></div><button class="icon-button" id="importCenterClose" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div>
      <div class="import-source"><strong id="importSourceName"></strong><span id="importSourceMeta"></span><p id="importCompatibilityNote" class="field-note"></p></div>
      <div id="importSummary" class="import-summary" aria-label="合并统计"></div>
      <div class="import-toolbar"><div id="importFilters" class="segmented import-filters" role="group" aria-label="筛选合并项目"></div><span id="importVisibleCount" class="field-note"></span></div>
      <div id="importBatchActions" class="import-batch-actions"><select id="importBatchGroup" aria-label="批量处理的同类项目"></select><select id="importBatchDecision" aria-label="批量处理方式"></select><button id="importBatchApply" class="button secondary" type="button">应用到同类项</button></div>
      <div id="importItemList" class="import-item-list" aria-live="polite"></div>
      <div class="import-actions"><button class="button danger-button" id="importReplaceRestore" type="button"><i data-lucide="rotate-ccw"></i><span>全量恢复</span></button><span class="action-spacer"></span><button class="button ghost" id="importCenterCancel" type="button">取消</button><button class="button primary" id="importApplyMerge" type="button"><i data-lucide="upload"></i><span>应用合并</span></button></div>
    </div>
  </dialog>

  <dialog id="importProgressDialog" class="modal">
    <div class="modal-card stack import-progress-card"><div class="modal-head"><div><p class="modal-eyebrow">导入进度</p><h2>正在处理备份</h2></div></div><ol id="importProgressStages" class="import-progress-stages" aria-live="polite"></ol><p id="importProgressText" class="field-note"></p><div class="modal-actions"><button id="importProgressCancel" class="button ghost" type="button">取消导入</button></div></div>
  </dialog>

  <dialog id="importResultDialog" class="modal">
    <div class="modal-card stack import-result-card"><div class="modal-head"><h2>导入结果</h2><button class="icon-button" id="importResultClose" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div><p id="importResultText" class="confirm-text"></p><div class="choice-actions"><button class="button secondary" id="importLocateChanges" type="button"><i data-lucide="locate-fixed"></i><span>查看变更任务</span></button><button class="button secondary" id="importDownloadReport" type="button"><i data-lucide="download"></i><span>下载报告</span></button><button class="button danger-button" id="importRollback" type="button"><i data-lucide="undo-2"></i><span>回滚本次导入</span></button><button class="button primary" id="importResultDone" type="button">完成</button></div></div>
  </dialog>

  <dialog id="moveDialog" class="modal"><form id="moveDialogForm" class="modal-card stack"><div class="modal-head"><h2>更多任务操作</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭"><i data-lucide="x"></i></button></div><p id="moveRestriction" class="field-note" hidden>逾期任务改期后可调整文件夹、优先级和顺序。</p><label class="field"><span>目标文件夹</span><select id="moveFolder"></select></label><label class="field"><span>优先级</span><select id="movePriority"><option value="high">高</option><option value="low">低</option></select></label><div class="move-step-actions"><button class="button secondary" id="movePrevious" type="button">移到上一项</button><button class="button secondary" id="moveNext" type="button">移到下一项</button></div><button class="button danger-button" id="moveDelete" type="button"><i data-lucide="trash-2"></i><span>删除任务</span></button><div class="modal-actions"><button class="button ghost" type="button" data-close-dialog>取消</button><button class="button primary" id="moveSubmit" type="submit">移动到末尾</button></div></form></dialog>

  <dialog id="rescheduleDialog" class="modal"><form id="rescheduleForm" class="modal-card stack"><div class="modal-head"><h2>重新安排截止日期</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭"><i data-lucide="x"></i></button></div><div class="preset-grid" role="group" aria-label="日期快捷选项"><button class="button secondary" type="button" data-reschedule-days="1">明天</button><button class="button secondary" type="button" data-reschedule-days="3">3 天后</button><button class="button secondary" type="button" data-reschedule-days="7">7 天后</button></div><label class="field"><span>新日期</span><input id="rescheduleDate" type="date" required /></label><label class="field"><span>原因</span><input id="rescheduleReason" type="text" maxlength="120" placeholder="可选" /></label><div class="modal-actions"><button class="button ghost" type="button" data-close-dialog>取消</button><button class="button primary" type="submit">确认改期</button></div></form></dialog>

  <dialog id="attachmentRenameDialog" class="modal"><form id="attachmentRenameForm" class="modal-card stack"><div class="modal-head"><h2>重命名附件</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭"><i data-lucide="x"></i></button></div><label class="field"><span>文件名</span><input id="attachmentRenameName" type="text" maxlength="160" required /></label><div class="modal-actions"><button class="button ghost" type="button" data-close-dialog>取消</button><button class="button primary" type="submit">保存</button></div></form></dialog>

  <dialog id="worklogDateDialog" class="modal"><form id="worklogDateForm" class="modal-card stack"><div class="modal-head"><h2>修改记录日期</h2><button class="icon-button" type="button" data-close-dialog aria-label="关闭"><i data-lucide="x"></i></button></div><p id="worklogDatePrompt" class="confirm-text"></p><label class="field"><span>新日期</span><input id="worklogNewDate" type="date" required /></label><div class="modal-actions"><button class="button ghost" type="button" data-close-dialog>取消</button><button class="button primary" type="submit">确认移动</button></div></form></dialog>
</template>

<style scoped>
.modal-card {
  contain: layout paint;
}

.import-center-dialog {
  width: min(1040px, calc(100vw - 32px));
  max-width: none;
}

.import-center-card {
  display: grid;
  grid-template-rows: auto auto auto auto auto minmax(220px, 1fr) auto;
  width: 100%;
  max-height: min(820px, calc(100vh - 40px));
  overflow: hidden;
  gap: 14px;
}
.import-center-card > * { min-width: 0; }

.modal-eyebrow { margin: 0 0 3px; color: var(--muted); font-size: 12px; }
.import-source { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: baseline; }
.import-source strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.import-source .field-note { grid-column: 1 / -1; margin: 0; }
.import-summary { display: grid; grid-template-columns: repeat(6, minmax(86px, 1fr)); gap: 8px; }
.import-summary :deep(.import-stat) { border-left: 3px solid var(--line-strong); padding: 6px 9px; background: var(--surface-muted); }
.import-summary :deep(.import-stat strong) { display: block; font-size: 18px; }
.import-summary :deep(.import-stat span) { color: var(--muted); font-size: 12px; }
.import-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.import-filters { width: 100%; max-width: 100%; overflow-x: auto; }
.import-batch-actions { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(150px, 220px) auto; gap: 8px; align-items: center; }
.import-item-list { min-width: 0; min-height: 0; overflow: auto; border-block: 1px solid var(--line); }
.import-item-list :deep(.import-item) { display: grid; grid-template-columns: 116px minmax(180px, 1fr) minmax(220px, 1.4fr) 150px; gap: 12px; align-items: center; min-height: 64px; padding: 9px 4px; border-bottom: 1px solid var(--line); }
.import-item-list :deep(.import-item:last-child) { border-bottom: 0; }
.import-item-list :deep(.import-item-label) { min-width: 0; }
.import-item-list :deep(.import-item-label strong), .import-item-list :deep(.import-item-label span) { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.import-item-list :deep(.import-item-label span), .import-item-list :deep(.import-reason) { color: var(--muted); font-size: 12px; }
.import-item-list :deep(.import-reason) { display: grid; gap: 5px; }
.import-item-list :deep(.import-diff) { color: var(--text); }
.import-item-list :deep(.import-diff summary) { cursor: pointer; font-weight: 600; }
.import-item-list :deep(.import-diff p) { overflow-wrap: anywhere; margin: 5px 0 0; }
.import-item-list :deep(.merge-status) { font-size: 12px; font-weight: 700; }
.import-item-list :deep(.merge-status.conflict), .import-item-list :deep(.merge-status.deletion) { color: var(--danger); }
.import-item-list :deep(.merge-status.new), .import-item-list :deep(.merge-status.safe-update) { color: var(--teal); }
.import-item-list :deep(.merge-status.suspected-duplicate) { color: var(--pending); }
.import-item-list :deep(.import-decision) { width: 100%; }
.import-item-list :deep(.import-empty) { padding: 38px 12px; text-align: center; color: var(--muted); }
.import-actions { display: flex; align-items: center; gap: 8px; }
.action-spacer { flex: 1; }
.import-progress-card { width: min(520px, calc(100vw - 32px)); }
.import-progress-stages { display: grid; gap: 7px; margin: 0; padding-left: 24px; }
.import-progress-stages :deep(li) { color: var(--muted); }
.import-progress-stages :deep(li.active) { color: var(--text); font-weight: 700; }
.import-progress-stages :deep(li.done) { color: var(--completed); }

@media (max-width: 720px) {
  .import-center-dialog { width: 100vw; height: 100dvh; max-height: none; margin: 0; }
  .import-center-card { height: 100dvh; min-height: 0; max-height: none; grid-template-rows: auto auto auto auto auto minmax(120px, 1fr) auto; border-radius: 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
  /* TEST-V08-010：手机端来源文件名独占一行并允许安全换行，避免被元信息列压缩到不可见。 */
  .import-source { grid-template-columns: minmax(0, 1fr); }
  .import-source strong { white-space: normal; overflow-wrap: anywhere; text-overflow: clip; }
  .import-summary { grid-template-columns: repeat(3, 1fr); }
  .import-toolbar { align-items: stretch; flex-direction: column; }
  .import-batch-actions { grid-template-columns: 1fr 1fr; }
  #importBatchApply { grid-column: 1 / -1; }
  .import-item-list :deep(.import-item) { grid-template-columns: 92px minmax(0, 1fr); gap: 6px 10px; }
  .import-item-list :deep(.import-reason), .import-item-list :deep(.import-decision) { grid-column: 2; }
  .import-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .action-spacer { display: none; }
  #importReplaceRestore { grid-column: 1 / -1; }
  .import-actions .button { width: 100%; }
}
</style>

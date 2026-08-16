import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, main, app, sidebar, board, taskWorkspace, dialogs, styleIndex, tokensCss, baseCss, layoutCss, statesCss, motionCss, responsiveCss, renderer, events, dragDrop, types, workspace, workspaceBackend, workspaceDb, localDirectoryBackend, backup, markdownEditor, markdownRender, lightbox] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/App.vue", import.meta.url), "utf8"),
  readFile(new URL("../src/components/AppSidebar.vue", import.meta.url), "utf8"),
  readFile(new URL("../src/components/TaskBoard.vue", import.meta.url), "utf8"),
  readFile(new URL("../src/components/TaskWorkspace.vue", import.meta.url), "utf8"),
  readFile(new URL("../src/components/AppDialogs.vue", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/index.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/base.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/layout.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/states.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/motion.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/responsive.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/events.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/drag-drop.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/workspace.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/workspace-backend.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/workspace-db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/local-directory-backend.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/backup.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/markdown-editor.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/markdown-render.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/lightbox.ts", import.meta.url), "utf8"),
]);
const uiMarkup = [app, sidebar, board, taskWorkspace, dialogs].join("\n");
const css = [tokensCss, baseCss, layoutCss, statesCss, motionCss, responsiveCss].join("\n");
const merge = await readFile(new URL("../src/merge.ts", import.meta.url), "utf8");

test("v0.6 styles are Vite-managed modules with component-local scoped rules", () => {
  for (const file of ["tokens", "base", "layout", "states", "motion", "responsive"]) {
    assert.match(styleIndex, new RegExp(`@import "\\./${file}\\.css"`));
  }
  assert.match(main, /import "\.\/styles\/index\.css"/);
  assert.doesNotMatch(html, /href="\/styles\.css"/);
  for (const component of [app, sidebar, board, taskWorkspace, dialogs]) assert.match(component, /<style scoped>/);
});

test("hidden elements cannot be revealed by component display rules", () => {
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("task header and rows share a stable four-column layout contract", () => {
  assert.match(css, /--task-columns:/);
  assert.match(css, /\.list-head,\s*\.task-item\s*\{[^}]*grid-template-columns:\s*var\(--task-columns\)/s);
  assert.match(css, /\.task-title-line strong\s*\{[^}]*overflow-wrap:\s*break-word[^}]*word-break:\s*normal/s);
  assert.match(uiMarkup, /<div class="list-head"[^>]*><span>任务<\/span><span>优先级<\/span><span>截止日期<\/span><span>操作<\/span>/);
});

test("schema v5 exposes only high and low priority with four exclusive views", () => {
  assert.match(types, /export type Priority = "high" \| "low";/);
  assert.doesNotMatch(uiMarkup, /value="medium"/);
  assert.doesNotMatch(uiMarkup, /id="sortMode"/);
  for (const mode of ["tree_manual", "global_priority", "global_due_date", "priority_then_due_date"]) assert.match(uiMarkup, new RegExp(`data-view="${mode}"`));
});

test("tree inline creation uses distinct folder and task icon actions", () => {
  assert.match(renderer, /start-inline-task/);
  assert.match(renderer, /start-inline-folder/);
  assert.match(renderer, /"ListPlus"/);
  assert.match(renderer, /"FolderPlus"/);
  assert.match(events, /Escape/);
  assert.match(events, /form\.inline-create/);
  assert.match(renderer, /save\.type = "submit"/);
  assert.match(renderer, /root-create-actions/);
  assert.match(css, /\.create-task-action/);
  assert.match(css, /\.create-folder-action/);
  assert.match(uiMarkup, /id="globalNewTask"/);
  assert.doesNotMatch(uiMarkup, /id="taskForm"/);
});

test("drag and drop uses Pragmatic DnD, explicit handles, auto-scroll, and gated activation", () => {
  assert.match(dragDrop, /pragmatic-drag-and-drop\/element\/adapter/);
  assert.match(dragDrop, /pragmatic-drag-and-drop-auto-scroll\/element/);
  assert.match(dragDrop, /dragHandle:\s*handle/);
  assert.match(dragDrop, /querySelector<HTMLElement>\("\.task-main"\)/);
  assert.match(dragDrop, /consumeSuppressedTaskClick/);
  assert.match(dragDrop, /autoScrollForElements/);
  assert.match(dragDrop, /setTimeout\([^]*600/s);
  assert.match(dragDrop, /viewMode === "tree_manual"/);
  assert.match(dragDrop, /\["completed", "discarded"\]/);
});

test("drag preview uses a transient placeholder, FLIP motion, and reduced-motion fallback", () => {
  assert.match(dragDrop, /task-drop-placeholder/);
  assert.match(dragDrop, /onDropTargetChange/);
  assert.match(dragDrop, /captureTaskPositions/);
  assert.match(dragDrop, /element\.animate/);
  assert.match(dragDrop, /prefers-reduced-motion:\s*reduce/);
  assert.match(dragDrop, /finishTaskPreview\(\)/);
  assert.match(dragDrop, /store\.dispatch\(\{ type: "move-task"/);
});

test("priority-aware selection and whole-row click targeting are explicit", () => {
  assert.match(css, /--priority-high-selected:/);
  assert.match(css, /--priority-low-selected:/);
  assert.match(css, /\[data-priority="high"\]\.selected/);
  assert.match(css, /\[data-priority="low"\]\.selected/);
  assert.match(events, /button, input, select, textarea, summary, a/);
  assert.match(events, /if \(!interactive\) \{ await selectTask\(task\.id\); return; \}/);
});

test("compact priority bands, overdue region, pending resolution, and handled container render explicitly", () => {
  assert.match(renderer, /priority-divider/);
  assert.match(renderer, /move-priority-divider|dividerFolderId/);
  assert.match(renderer, /priority-band-/);
  assert.doesNotMatch(renderer, /createSubheading\("高优先级"/);
  assert.doesNotMatch(renderer, /createSubheading\("低优先级"/);
  assert.match(css, /\.task-item\.priority-band-high/);
  assert.match(css, /\.task-item\.priority-band-low/);
  assert.doesNotMatch(css, /\.priority-divider::before/);
  assert.match(renderer, /overdueDays/);
  assert.match(renderer, /8_000/);
  assert.match(renderer, /toggle-handled/);
  assert.match(css, /\.task-item\.pending/);
  assert.match(css, /--pending-progress/);
  assert.match(css, /\.task-item\.overdue/);
  assert.match(renderer, /priority-threshold-high/);
  assert.match(renderer, /"GripHorizontal"/);
  assert.doesNotMatch(renderer, /text: "高 \/ 低"/);
  assert.match(css, /\.tree-group-heading\s*\{[^}]*border-bottom:\s*0/s);
});

test("reschedule workflow and detail timeline are present", () => {
  assert.match(uiMarkup, /id="rescheduleDialog"/);
  assert.match(uiMarkup, /data-reschedule-days="1"/);
  assert.match(uiMarkup, /data-reschedule-days="3"/);
  assert.match(uiMarkup, /data-reschedule-days="7"/);
  assert.match(uiMarkup, /id="rescheduleTimeline"/);
  assert.match(events, /source:\s*"quick"/);
  assert.match(renderer, /rescheduleHistory/);
  assert.match(uiMarkup, /id="timelineSection"[^>]*hidden/);
  assert.match(renderer, /setHidden\(els\.timelineSection/);
});

test("global tasks offer folder-path location and location clears blocking state", () => {
  assert.match(renderer, /getFolderPath/);
  assert.match(renderer, /dataset\.action = "locate-task"/);
  assert.match(events, /set-view-mode", viewMode: "tree_manual"/);
  assert.match(events, /set-status-filter", filter: "all"/);
  assert.match(events, /getFolderAncestorIds/);
  assert.match(events, /scrollIntoView/);
});

test("Lucide icons, tooltips, aria labels, live announcements, and touch targets are wired", () => {
  assert.match(uiMarkup, /data-lucide="folder-plus"/);
  assert.match(renderer, /setAttribute\("aria-label", label\)/);
  assert.match(uiMarkup, /id="liveRegion"[^>]*aria-live="assertive"/);
  assert.match(tokensCss, /--hit-target:\s*40px/);
  assert.match(baseCss, /\.icon-button, \.folder-action, \.group-action, \.drag-handle, \.folder-toggle[^}]*min-height:\s*var\(--hit-target\)/s);
  assert.match(responsiveCss, /@media \(max-width:\s*560px\)[^]*--hit-target:\s*44px/s);
});

test("task workspace has tabs, resizable desktop width, and full-screen mobile layout", () => {
  for (const id of ["overviewTab", "worklogTab", "attachmentsTab", "detailResizer"]) assert.match(uiMarkup, new RegExp(`id="${id}"`));
  assert.match(types, /export type WorkspaceTab = "overview" \| "worklog" \| "attachments"/);
  assert.match(css, /--workspace-width/);
  assert.match(css, /width:\s*100vw/);
  assert.match(events, /set-workspace-width/);
  assert.doesNotMatch(renderer, /style\.gridTemplateColumns/);
  assert.match(renderer, /Math\.min\(680, Math\.max\(480, preferredWorkspaceWidth\)/);
  assert.match(css, /@media \(min-width:\s*1340px\)[^]*\.app-shell\.workspace-open/s);
  assert.match(css, /@media \(min-width:\s*881px\) and \(max-width:\s*1179px\)[^]*\.workspace\s*\{\s*display:\s*none/s);
  // TEST-V08-017：1180-1339 同样提供三轨布局与可拖拽的工作区分界。
  assert.match(css, /@media \(min-width:\s*1180px\) and \(max-width:\s*1339px\)[^]*minmax\(420px,\s*1fr\)[^]*clamp\(560px,\s*var\(--workspace-width, 620px\),\s*680px\)/s);
});

test("folder headings toggle on the whole row while inner actions stay independent", () => {
  assert.match(renderer, /heading\.dataset\.toggleFolderId = folder\.id/);
  assert.match(events, /\.tree-group-heading\[data-toggle-folder-id\]/);
  assert.match(events, /target\.closest\("button, summary, input, select, a"\)/);
  assert.match(events, /type:\s*"toggle-folder",\s*id:\s*heading\.dataset\.toggleFolderId/);
  assert.match(css, /\.tree-group-heading\[data-toggle-folder-id\]\s*\{\s*cursor:\s*pointer/s);
});

test("workspace-open keeps a mirrored header and animates the wide layout in", () => {
  assert.match(css, /\.app-shell\s*\{\s*grid-template-columns:\s*var\(--sidebar-width\) minmax\(0,\s*1fr\) 0px;\s*transition:\s*grid-template-columns/s);
  assert.match(css, /\.app-shell\.workspace-open\s*\{\s*grid-template-columns:\s*var\(--sidebar-width\) minmax\(500px,\s*1fr\) clamp\(480px,\s*var\(--workspace-width, 620px\),\s*680px\)/s);
  assert.match(css, /\.app-shell\.workspace-open \.list-head\s*\{[^}]*display:\s*grid[^}]*grid-template-areas:\s*"title actions actions" "meta priority date"/s);
  assert.match(css, /\.app-shell\.workspace-open \.detail-panel\s*\{[^}]*animation:\s*workspace-panel-in/s);
  assert.doesNotMatch(css, /\.app-shell\.workspace-open \.list-head\s*\{\s*display:\s*none/);
});

test("work logs edit Markdown source with rendered history, attachment insertion, and ZIP backup", () => {
  assert.match(workspaceDb, /indexedDB\.open/);
  for (const store of ["workLogs", "attachments", "attachmentBlobs"]) assert.match(workspaceDb, new RegExp(`"${store}"`));
  assert.match(workspace, /setTimeout\(\(\) => \{ void saveDescription\(\); \}, 700\)/);
  assert.match(workspace, /workDate/);
  // 源码 + 预览编辑器取代 Crepe：textarea 源码、渲染预览、拖放/粘贴入库回调与工具栏。
  assert.match(markdownEditor, /markdown-source/);
  assert.match(markdownEditor, /textarea/);
  assert.match(markdownEditor, /uploadFiles/);
  assert.match(markdownEditor, /markdown-fallback/);
  assert.match(markdownEditor, /renderPlainMarkdown/);
  assert.doesNotMatch(markdownEditor, /@milkdown|prosemirror|Crepe/);
  // TEST-V08-017：输入法合成保护、保存守卫、预览手动开关与默认纯源码。
  assert.match(markdownEditor, /compositionstart/);
  assert.match(markdownEditor, /compositionend/);
  assert.match(markdownEditor, /isComposing/);
  assert.match(markdownEditor, /preview-mode/);
  assert.match(workspace, /isComposing\(\)/);
  assert.match(main, /installImageLightbox/);
  assert.match(lightbox, /markdown-lightbox/);
  assert.match(lightbox, /Escape/);
  assert.match(layoutCss, /cursor: zoom-in/);
  // TEST-V08-017：1180px 起即可拖拽调节工作区宽度。
  assert.match(responsiveCss, /min-width: 1180px/);
  assert.match(events, /window\.innerWidth < 1180/);
  // TEST-V08-018：概览字段保留用户空白，重绘不覆盖聚焦字段。
  assert.match(events, /normalizeMultilineKeep/);
  assert.match(renderer, /writeIfNotEditing/);
  // attachment: 引用解析层：消毒渲染、占位改写、对象 URL 解析与失效占位。
  assert.match(markdownRender, /DOMPurify\.sanitize/);
  assert.match(markdownRender, /marked\.parse/);
  assert.match(markdownRender, /prepareAttachmentReferences/);
  assert.match(markdownRender, /attachment-missing/);
  assert.match(markdownRender, /createObjectURL|resolveAttachment/);
  // 编辑器内入库、历史渲染与内嵌图片迁移。
  assert.match(workspace, /uploadEditorFiles/);
  assert.match(workspace, /putAttachment/);
  assert.match(workspace, /attachmentImageMarkdown/);
  assert.match(workspace, /createMarkdownRenderer/);
  assert.match(workspace, /rendered-markdown/);
  assert.match(workspace, /migrateEmbeddedImages/);
  assert.match(taskWorkspace, /id="migrateEmbeddedImages"/);
  assert.match(workspaceDb, /deleteWorkLog/);
  assert.match(workspaceDb, /restoreWorkLog/);
  assert.match(uiMarkup, /id="newWorklog"/);
  assert.match(uiMarkup, /id="undoWorklogDelete"/);
  assert.match(backup, /manifest\.json/);
  assert.match(backup, /JSZip/);
});

test("v0.7 storage callers depend on WorkspaceBackend instead of IndexedDB details", () => {
  for (const operation of ["loadWorkspace", "saveWorkspaceIndex", "saveTask", "deleteTask", "restoreTask", "saveDescription", "listWorkLogs", "saveWorkLog", "deleteWorkLog", "listAttachments", "putAttachment", "readAttachment", "saveAttachment", "renameAttachment", "deleteAttachment", "exportSnapshot", "importSnapshot"]) {
    assert.match(workspaceBackend, new RegExp(`${operation}\\(`));
  }
  assert.match(workspaceDb, /class LegacyBrowserImportReader implements WorkspaceBackend/);
  assert.match(main, /new UnavailableWorkspaceBackend\(\)/);
  assert.match(main, /chooseWorkspaceSetup/);
  assert.doesNotMatch(main, /browserBackend/);
  assert.match(workspace, /type WorkspaceBackend/);
  assert.match(events, /type \{ WorkspaceBackend \}/);
  assert.match(backup, /type \{ WorkspaceBackend, WorkspaceSnapshot \}/);
  assert.doesNotMatch([workspace, events, backup].join("\n"), /indexedDB|FileSystemDirectoryHandle|WorkspaceRepository/);
});

test("LocalDirectoryBackend follows the stable task directory layout", () => {
  assert.match(localDirectoryBackend, /class LocalDirectoryBackend implements WorkspaceBackend/);
  for (const entry of ["workspace.json", "tasks", "trash", "task.json", "description.md", "worklogs", "attachments"]) {
    assert.match(localDirectoryBackend, new RegExp(`"${entry.replace(".", "\\.")}"`));
  }
  assert.match(localDirectoryBackend, /showDirectoryPicker/);
  assert.match(localDirectoryBackend, /queryPermission/);
  assert.match(localDirectoryBackend, /requestPermission/);
  assert.match(localDirectoryBackend, /tmp-\$\{crypto\.randomUUID\(\)\}/);
});

test("v0.7 recovery separates permission renewal from directory replacement and protects missing indexes", () => {
  assert.match(uiMarkup, /id="reauthorizeWorkspaceDirectory"/);
  assert.match(uiMarkup, /重新授权原目录/);
  assert.match(main, /改选本地目录/);
  assert.match(main, /clearWorkspaceDirectoryHandle\(\)/);
  assert.match(localDirectoryBackend, /directoryHasEntries\(this\.root\)/);
  assert.match(localDirectoryBackend, /缺少 workspace\.json，已阻止写入/);
  assert.match(localDirectoryBackend, /assertSafeFileName\(name\)/);
});

test("v0.8 imports use a previewed merge plan with explicit recovery and rollback", () => {
  assert.match(backup, /interface BackupManifestV6/);
  for (const field of ["workspaceId", "snapshotId", "parentSnapshotId", "contentSummary", "entityRevisions", "tombstones"]) assert.match(backup + workspaceBackend, new RegExp(field));
  for (const id of ["importCenterDialog", "importSummary", "importItemList", "importApplyMerge", "importReplaceRestore", "importResultDialog", "importDownloadReport", "importRollback"]) assert.match(dialogs, new RegExp(`id="${id}"`));
  assert.match(board, /导入或合并备份/);
  assert.match(events, /analyzeMerge/);
  assert.match(events, /applyMergePlan/);
  assert.match(events, /task-workbench-before-import/);
  assert.match(events, /verifyImportedWorkspace/);
  assert.match(merge, /incoming\.parentRevisionId === current\.revisionId/);
  assert.match(merge, /preferences: plan\.current\.state\.preferences/);
  assert.match(main, /dataset\.workspaceWritable/);
  assert.match(renderer, /disableWithoutWorkspace/);
  assert.match(app, /workspace-open ~ \.toast/);
});

test("sticky-note folder layers and discoverable folder management are wired", () => {
  for (const depth of [0, 1, 2, 3, 4]) assert.match(css, new RegExp(`\\.tree-container\\.tree-depth-${depth}`));
  assert.match(renderer, /createFolderMenu/);
  for (const action of ["rename-folder", "move-folder", "delete-folder"]) assert.match(renderer, new RegExp(`"${action}"`));
  assert.match(uiMarkup, /id="folderMoveDialog"/);
  assert.match(events, /type:\s*"move-folder"/);
  assert.match(types, /type: "move-folder"/);
});

test("attachments accept drag-and-drop upload and can reveal the task folder (TEST-V08-019/020)", () => {
  assert.match(taskWorkspace, /id="openTaskFolder"/);
  assert.match(taskWorkspace, /id="attachmentDropHint"/);
  assert.match(taskWorkspace, /folder-open/);
  assert.match(workspace, /wireAttachmentDropZone/);
  assert.match(workspace, /dragover/);
  assert.match(workspace, /dragenter/);
  assert.match(workspace, /dragleave/);
  assert.match(workspace, /"drop"/);
  assert.match(workspace, /dataTransfer\?\.files/);
  assert.match(workspace, /dropEffect = "copy"/);
  assert.match(workspace, /drag-over/);
  assert.match(workspace, /uploadAttachments/);
  assert.match(workspace, /MAX_ATTACHMENT_BYTES/);
  assert.match(workspace, /putAttachment\(activeTaskId, file\)/);
  assert.match(workspace, /revealTaskDirectory/);
  assert.match(workspace, /backend\.revealTaskDirectory/);
  assert.match(workspaceBackend, /revealTaskDirectory\?\(taskId: string\): Promise<boolean>/);
  assert.match(localDirectoryBackend, /async revealTaskDirectory\(taskId: string\): Promise<boolean>/);
  assert.match(localDirectoryBackend, /showOpenFilePicker/);
  assert.match(localDirectoryBackend, /startIn: handle/);
  assert.match(localDirectoryBackend, /getTaskDirectory\(taskId\)/);
});

test("workspace layout retains internal scrolling and a persistent overview action area", () => {
  assert.match(uiMarkup, /class="detail-fields"/);
  assert.match(css, /\.detail-panel\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.detail-fields\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.detail-actions\s*\{[^}]*flex:\s*0 0 auto/s);
});

test("Vite uses the TypeScript source entry without manual asset versions", () => {
  assert.match(html, /src="\/src\/main\.ts"/);
  assert.doesNotMatch(html, /href="\/styles\.css"/);
  assert.match(main, /styles\/index\.css/);
  assert.doesNotMatch(html, /(?:styles\.css|main\.ts)\?v=/);
  assert.doesNotMatch(html, /src="dist\//);
});

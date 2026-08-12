import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, main, app, sidebar, board, taskWorkspace, dialogs, styleIndex, tokensCss, baseCss, layoutCss, statesCss, motionCss, responsiveCss, renderer, events, dragDrop, types, workspace, workspaceDb, backup, markdownEditor] = await Promise.all([
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
  readFile(new URL("../src/workspace-db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/backup.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/markdown-editor.ts", import.meta.url), "utf8"),
]);
const uiMarkup = [app, sidebar, board, taskWorkspace, dialogs].join("\n");
const css = [tokensCss, baseCss, layoutCss, statesCss, motionCss, responsiveCss].join("\n");

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
  assert.match(renderer, /232px minmax\(500px, 1fr\)/);
  assert.match(renderer, /Math\.min\(680, Math\.max\(480, preferredWorkspaceWidth\)/);
  assert.match(css, /@media \(min-width:\s*1340px\)[^]*\.app-shell\.workspace-open/s);
  assert.match(css, /@media \(min-width:\s*881px\) and \(max-width:\s*1339px\)[^]*\.workspace\s*\{\s*display:\s*none/s);
});

test("work logs and attachments use IndexedDB, autosave, Crepe, fallback preview, and ZIP backup", () => {
  assert.match(workspaceDb, /indexedDB\.open/);
  for (const store of ["workLogs", "attachments", "attachmentBlobs"]) assert.match(workspaceDb, new RegExp(`"${store}"`));
  assert.match(workspace, /setTimeout\(\(\) => \{ void saveDescription\(\); \}, 700\)/);
  assert.match(workspace, /workDate/);
  assert.match(markdownEditor, /import\("@milkdown\/crepe\/builder"\)/);
  assert.match(markdownEditor, /import\("@milkdown\/crepe\/feature\/toolbar"\)/);
  assert.doesNotMatch(markdownEditor, /feature\/latex|feature\/code-mirror|common\/latex\.css|common\/code-mirror\.css/);
  assert.match(markdownEditor, /markdown-fallback/);
  assert.match(workspaceDb, /deleteWorkLog/);
  assert.match(workspaceDb, /restoreWorkLog/);
  assert.match(uiMarkup, /id="newWorklog"/);
  assert.match(uiMarkup, /id="undoWorklogDelete"/);
  assert.match(backup, /manifest\.json/);
  assert.match(backup, /JSZip/);
});

test("sticky-note folder layers and discoverable folder management are wired", () => {
  for (const depth of [0, 1, 2, 3, 4]) assert.match(css, new RegExp(`\\.tree-container\\.tree-depth-${depth}`));
  assert.match(renderer, /createFolderMenu/);
  for (const action of ["rename-folder", "move-folder", "delete-folder"]) assert.match(renderer, new RegExp(`"${action}"`));
  assert.match(uiMarkup, /id="folderMoveDialog"/);
  assert.match(events, /type:\s*"move-folder"/);
  assert.match(types, /type: "move-folder"/);
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

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, renderer, events, dragDrop, types] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/events.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/drag-drop.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/types.ts", import.meta.url), "utf8"),
]);

test("hidden elements cannot be revealed by component display rules", () => {
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("task header and rows share a stable four-column layout contract", () => {
  assert.match(css, /--task-columns:/);
  assert.match(css, /\.list-head,\s*\.task-item\s*\{[^}]*grid-template-columns:\s*var\(--task-columns\)/s);
  assert.match(css, /\.task-title-line strong\s*\{[^}]*overflow-wrap:\s*break-word[^}]*word-break:\s*normal/s);
  assert.match(html, /<div class="list-head"[^>]*><span>任务<\/span><span>优先级<\/span><span>截止日期<\/span><span>操作<\/span>/);
});

test("schema v4 exposes only high and low priority with four exclusive views", () => {
  assert.match(types, /export type Priority = "high" \| "low";/);
  assert.doesNotMatch(html, /value="medium"/);
  assert.doesNotMatch(html, /id="sortMode"/);
  for (const mode of ["tree_manual", "global_priority", "global_due_date", "priority_then_due_date"]) assert.match(html, new RegExp(`data-view="${mode}"`));
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
  assert.match(html, /id="globalNewTask"/);
  assert.doesNotMatch(html, /id="taskForm"/);
});

test("drag and drop uses Pragmatic DnD, explicit handles, auto-scroll, and gated activation", () => {
  assert.match(dragDrop, /pragmatic-drag-and-drop\/element\/adapter/);
  assert.match(dragDrop, /pragmatic-drag-and-drop-auto-scroll\/element/);
  assert.match(dragDrop, /dragHandle:\s*handle/);
  assert.match(dragDrop, /autoScrollForElements/);
  assert.match(dragDrop, /setTimeout\([^]*600/s);
  assert.match(dragDrop, /viewMode === "tree_manual"/);
  assert.match(dragDrop, /\["completed", "discarded"\]/);
});

test("priority divider, overdue region, pending resolution, and handled container render explicitly", () => {
  assert.match(renderer, /priority-divider/);
  assert.match(renderer, /move-priority-divider|dividerFolderId/);
  assert.match(renderer, /overdueDays/);
  assert.match(renderer, /8_000/);
  assert.match(renderer, /toggle-handled/);
  assert.match(css, /\.task-item\.pending/);
  assert.match(css, /--pending-progress/);
  assert.match(css, /\.task-item\.overdue/);
});

test("reschedule workflow and detail timeline are present", () => {
  assert.match(html, /id="rescheduleDialog"/);
  assert.match(html, /data-reschedule-days="1"/);
  assert.match(html, /data-reschedule-days="3"/);
  assert.match(html, /data-reschedule-days="7"/);
  assert.match(html, /id="rescheduleTimeline"/);
  assert.match(events, /source:\s*"quick"/);
  assert.match(renderer, /rescheduleHistory/);
  assert.match(html, /id="timelineSection"[^>]*hidden/);
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
  assert.match(html, /data-lucide="folder-plus"/);
  assert.match(renderer, /setAttribute\("aria-label", label\)/);
  assert.match(html, /id="liveRegion"[^>]*aria-live="assertive"/);
  assert.match(css, /\.icon-button, \.folder-action, \.group-action, \.drag-handle, \.folder-toggle[^}]*min-height:\s*40px/s);
  assert.match(css, /@media \(max-width:\s*560px\)[^]*\.icon-button, \.folder-action, \.group-action, \.drag-handle, \.folder-toggle[^}]*min-height:\s*44px/s);
});

test("detail layout retains internal scrolling and a persistent action area", () => {
  assert.match(html, /class="detail-fields"/);
  assert.match(css, /\.detail-panel\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.detail-fields\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.detail-actions\s*\{[^}]*flex:\s*0 0 auto/s);
});

test("Vite uses the TypeScript source entry without manual asset versions", () => {
  assert.match(html, /src="\/src\/main\.ts"/);
  assert.match(html, /href="\/styles\.css"/);
  assert.doesNotMatch(html, /(?:styles\.css|main\.ts)\?v=/);
  assert.doesNotMatch(html, /src="dist\//);
});

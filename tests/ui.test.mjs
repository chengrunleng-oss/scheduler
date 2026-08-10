import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, renderer, events] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/renderer.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/events.ts", import.meta.url), "utf8"),
]);

test("hidden elements cannot be revealed by component display rules", () => {
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("task header and rows share one four-column layout contract", () => {
  assert.match(css, /--task-columns:/);
  assert.match(css, /\.list-head,\s*\.task-item\s*\{[^}]*grid-template-columns:\s*var\(--task-columns\)/s);
  assert.match(html, /<div class="list-head"[^>]*>\s*<span>任务<\/span>\s*<span>优先级<\/span>\s*<span>截止日期<\/span>\s*<span>操作<\/span>/s);
});

test("development workflow UI and legacy edit dialog are removed", () => {
  for (const removedText of ["改进记录", "下一轮改进项", "产品反馈", "开发历史", "归档本轮", "taskDialog"]) {
    assert.equal(html.includes(removedText), false, `${removedText} should not remain in the UI`);
  }
  assert.equal(events.includes("apply-feedback"), false);
  assert.equal(renderer.includes("renderChecklist"), false);
});

test("task selection exposes listbox semantics and a persistent detail form", () => {
  assert.match(html, /id="taskList"[^>]*role="listbox"/);
  assert.match(html, /id="detailForm"/);
  assert.match(renderer, /aria-selected/);
  assert.match(events, /ArrowDown/);
  assert.match(events, /放弃未保存更改/);
});

test("search results receive a visual marker while expanded tree rendering stays available", () => {
  assert.match(renderer, /search-match/);
  assert.match(renderer, /folder\.collapsed && !view\.query/);
  assert.match(css, /\.task-item\.search-match:not\(\.selected\)/);
});

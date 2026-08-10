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

test("visible copy describes the current behavior without duplicate or misleading labels", () => {
  assert.match(html, /<h2>新建任务<\/h2>/);
  assert.match(html, /title="重置为示例数据"/);
  assert.match(html, /<small>今日\/逾期<\/small>/);
  assert.match(html, /<option value="manual">添加顺序<\/option>/);
  assert.match(html, /选择任务以查看详情/);
  for (const removedText of ["快速新增", "恢复初始数据", "当前范围", "手动顺序", "到期/逾期"]) {
    assert.equal(html.includes(removedText), false, `${removedText} should not remain in the UI`);
  }
  assert.match(events, /重置为示例数据/);
  assert.match(renderer, /无截止日期/);
  assert.match(renderer, /今天截止/);
  assert.match(renderer, /逾期 ·/);
});

test("desktop detail layout has an internal scroll region and persistent action area", () => {
  assert.match(html, /class="detail-fields"/);
  assert.match(css, /\.detail-panel\s*\{[^}]*height:\s*100dvh/s);
  assert.match(css, /\.detail-fields\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.detail-actions\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /@media \(max-width:\s*1600px\)/);
});

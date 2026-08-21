// TEST-V08-027：Markdown 文档导出 PDF（方案 A：浏览器原生打印）。
// 在隐藏 iframe 中用 srcdoc 排版（同源，可直接加载渲染层产出的 blob: 图片），
// 等待图片全部加载后调用 window.print()，用户在打印对话框选择“另存为 PDF”。
// 文档标题会作为 Chrome/Edge 保存对话框的默认文件名。

export interface PdfExportOptions {
  /** 文档标题，同时作为打印对话框的默认文件名建议。 */
  title: string;
  /** 可选副标题（日期、进度等元信息）。 */
  subtitle?: string;
  /** 已渲染的正文 HTML（可包含 blob: 图片）。 */
  bodyHtml: string;
  /** 仅测试注入用；默认调用 iframe 的 window.print()。 */
  printImpl?: (frame: HTMLIFrameElement) => void;
}

export function exportHtmlAsPdf(options: PdfExportOptions): void {
  const frame = document.createElement("iframe");
  frame.className = "pdf-export-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;visibility:hidden;";
  frame.srcdoc = buildPrintDocument(options);
  document.body.append(frame);
  frame.addEventListener("load", () => { void printWhenReady(frame, options); }, { once: true });
}

async function printWhenReady(frame: HTMLIFrameElement, options: PdfExportOptions): Promise<void> {
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return; }
  await waitForImages(doc);
  const print = options.printImpl ?? ((target) => target.contentWindow?.print());
  print(frame);
  // 打印对话框关闭后清理；个别环境不触发 afterprint 时用兜底定时器。
  frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true });
  window.setTimeout(() => { if (frame.isConnected) frame.remove(); }, 60_000);
}

function buildPrintDocument(options: PdfExportOptions): string {
  const subtitle = options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title)}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; color: #1a1f24; font-size: 13px; line-height: 1.7; }
.print-header { border-bottom: 2px solid #126575; padding-bottom: 10px; margin-bottom: 18px; }
.print-header h1 { margin: 0 0 4px; font-size: 20px; color: #126575; }
.print-header p { margin: 0; color: #5b6770; font-size: 12px; }
.rendered-markdown img { max-width: 100%; height: auto; }
.rendered-markdown table { border-collapse: collapse; width: 100%; margin: 10px 0; }
.rendered-markdown th, .rendered-markdown td { border: 1px solid #b9c2c9; padding: 5px 8px; font-size: 12px; text-align: left; }
.rendered-markdown th { background: #eef2f5; }
.rendered-markdown pre { background: #f2f5f7; border: 1px solid #dbe2e7; border-radius: 4px; padding: 10px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
.rendered-markdown code { font-family: "Cascadia Mono", Consolas, monospace; background: #f2f5f7; padding: 1px 4px; border-radius: 3px; }
.rendered-markdown pre code { background: none; padding: 0; }
.rendered-markdown blockquote { border-left: 3px solid #126575; margin: 8px 0; padding: 2px 12px; color: #4b565e; background: #f4f7f9; }
.rendered-markdown a { color: #126575; }
.rendered-markdown ul, .rendered-markdown ol { padding-left: 1.6em; }
.rendered-markdown h1, .rendered-markdown h2, .rendered-markdown h3, .rendered-markdown h4 { break-after: avoid; margin-top: 1.2em; }
.rendered-markdown img, .rendered-markdown table, .rendered-markdown pre, .rendered-markdown blockquote { break-inside: avoid; }
@media print { body { font-size: 12.5px; } }
</style>
</head>
<body>
<header class="print-header"><h1>${escapeHtml(options.title)}</h1>${subtitle}</header>
<article class="rendered-markdown">${options.bodyHtml}</article>
</body>
</html>`;
}

async function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images).filter((image) => !image.complete);
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

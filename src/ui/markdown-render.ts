import DOMPurify from "dompurify";
import { marked } from "marked";
import type { AttachmentMeta } from "../types.js";
import type { WorkspaceBackend } from "../workspace-backend.js";

// Markdown 渲染层：marked 解析 + DOMPurify 消毒 + attachment: 引用解析。
// attachment: 引用在进入 marked 之前先改写为带 data-* 标记的占位 HTML（原样
// scheme 会被 DOMPurify 当作非法 URI 剔除），渲染后再按附件 ID 解析为对象 URL。

export function renderPlainMarkdown(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(prepareAttachmentReferences(prepareLegacyReferences(markdown)), { async: false }) as string);
}

export interface MarkdownRenderer {
  render(markdown: string): Promise<string>;
  release(): void;
}

export function createMarkdownRenderer(backend: WorkspaceBackend, taskId: string | null): MarkdownRenderer {
  const urls = new Map<string, string>();
  // TEST-V08-032：附件类型缓存，视频附件渲染为内嵌播放器。
  let metaCache: AttachmentMeta[] | null = null;

  async function listMetas(): Promise<AttachmentMeta[]> {
    if (!metaCache) metaCache = taskId ? await backend.listAttachments(taskId) : [];
    return metaCache;
  }

  async function resolveAttachment(id: string): Promise<string | null> {
    const cached = urls.get(id);
    if (cached) return cached;
    const blob = await backend.readAttachment(id);
    if (!blob) { urls.delete(id); return null; }
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  }

  async function resolveKind(id: string): Promise<AttachmentMeta["kind"] | null> {
    return (await listMetas()).find((meta) => meta.id === id)?.kind ?? null;
  }

  function placeholder(text: string): HTMLElement {
    return Object.assign(document.createElement("span"), { className: "attachment-missing", textContent: text });
  }

  return {
    async render(markdown: string): Promise<string> {
      const html = renderPlainMarkdown(markdown);
      if (!/data-attachment-(image|link)/.test(html)) return html;
      const template = document.createElement("template");
      template.innerHTML = html;

      const images = template.content.querySelectorAll<HTMLElement>("[data-attachment-image]");
      for (const image of images) {
        const id = image.dataset.attachmentImage ?? "";
        const alt = image.getAttribute("alt") ?? "";
        const url = await resolveAttachment(id);
        if (!url) { image.replaceWith(placeholder(`图片“${alt || id}”已失效（附件可能已删除）`)); continue; }
        if (await resolveKind(id) === "video") {
          // 视频附件用图片语法引用时渲染为内嵌播放器。
          const video = document.createElement("video");
          video.src = url;
          video.controls = true;
          video.title = alt || id;
          video.className = "attachment-video";
          image.replaceWith(video);
          continue;
        }
        const element = image as HTMLImageElement;
        element.src = url;
        element.removeAttribute("data-attachment-image");
      }
      const links = template.content.querySelectorAll<HTMLElement>("[data-attachment-link]");
      for (const link of links) {
        const id = link.dataset.attachmentLink ?? "";
        const text = link.textContent ?? id;
        const url = await resolveAttachment(id);
        if (!url) { link.replaceWith(placeholder(`附件“${text}”已失效（附件可能已删除）`)); continue; }
        if (await resolveKind(id) === "video") {
          const video = document.createElement("video");
          video.src = url;
          video.controls = true;
          video.title = text;
          video.className = "attachment-video";
          link.replaceWith(video);
          continue;
        }
        const anchor = link as HTMLAnchorElement;
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        anchor.removeAttribute("data-attachment-link");
      }
      return template.innerHTML;
    },
    release() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}

// 历史记录中由旧 Crepe 编辑器产生的 blob: 会话链接无法再解析，
// 在源码层替换为可读的失效说明，避免渲染出坏图或坏链接。
function prepareLegacyReferences(markdown: string): string {
  return transformOutsideCodeFences(markdown, (text) => text
    .replace(/!\[([^\]]*)\]\(blob:[^)\s]+\)/g, (_match, alt: string) => `> ${alt ? `图片“${alt}”` : "图片"}已失效（会话链接，请重新插入）`)
    .replace(/\[([^\]]*)\]\(blob:[^)\s]+\)/g, (_match, text: string) => text));
}

// 将 attachment: 引用改写为可安全通过 DOMPurify 的占位 HTML（带 data-* 标记），
// 供 createMarkdownRenderer 在渲染后解析为对象 URL。围栏代码块内的文本保持原样。
export function prepareAttachmentReferences(markdown: string): string {
  return transformOutsideCodeFences(markdown, (text) => text
    .replace(/!\[([^\]]*)\]\(attachment:([^)\s]+)\)/g, (_match, alt: string, id: string) => {
      return `<img alt="${escapeAttribute(alt)}" data-attachment-image="${escapeAttribute(id)}" />`;
    })
    .replace(/\[([^\]]*)\]\(attachment:([^)\s]+)\)/g, (_match, text: string, id: string) => {
      return `<a data-attachment-link="${escapeAttribute(id)}">${escapeHtml(text)}</a>`;
    }));
}

function transformOutsideCodeFences(markdown: string, transform: (text: string) => string): string {
  const segments = markdown.split(/^```/gm);
  return segments.map((segment, index) => (index % 2 === 1 ? segment : transform(segment))).join("```");
}

export function attachmentImageMarkdown(name: string, id: string): string {
  return `![${name}](attachment:${id})`;
}

export function attachmentLinkMarkdown(name: string, id: string): string {
  return `[${name}](attachment:${id})`;
}

export function extractAttachmentReferences(markdown: string): string[] {
  const ids = new Set<string>();
  const pattern = /\]\((attachment:[^)\s]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const id = match[1]?.slice("attachment:".length);
    if (!id) continue;
    try { ids.add(decodeURIComponent(id)); } catch { ids.add(id); }
  }
  return [...ids];
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

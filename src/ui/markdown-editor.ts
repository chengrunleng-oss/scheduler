import { renderPlainMarkdown } from "./markdown-render.js";
import { icon, type IconName } from "./icons.js";

export interface MarkdownEditorOptions {
  host: HTMLElement;
  value: string;
  placeholder: string;
  readonly: boolean;
  onChange(value: string): void;
  onSave(): void;
  // 渲染回调：调用方可传入带 attachment: 解析的渲染器；缺省退回纯 marked 渲染。
  render?: ((markdown: string) => Promise<string>) | undefined;
  // 拖入/粘贴文件入库回调：返回要插入到光标处的 Markdown 片段；返回 null 表示无内容插入。
  uploadFiles?: ((files: File[]) => Promise<string | null>) | undefined;
  // TEST-V08-033：追加到工具栏末尾（“源码/预览”切换键右侧）的按钮，如区块放大按钮。
  toolbarExtras?: HTMLElement[] | undefined;
}

export interface MarkdownEditorHandle {
  getMarkdown(): string;
  focus(): void;
  setReadonly(value: boolean): void;
  // 输入法合成中（拼音未提交为汉字）时为 true；保存方应跳过并稍后重试。
  isComposing(): boolean;
  destroy(): Promise<void>;
}

interface ToolbarAction {
  icon: IconName;
  label: string;
  apply(): void;
}

// 源码编辑 + 实时渲染预览：宽屏左右分栏，窄屏默认源码并提供“预览/源码”切换。
// 拖入或粘贴文件时交给 uploadFiles 回调入库并插入 attachment: 引用。
export async function createMarkdownEditor(options: MarkdownEditorOptions): Promise<MarkdownEditorHandle> {
  options.host.replaceChildren();
  options.host.dataset.editorState = "loading";
  try {
    return buildEditor(options);
  } finally {
    options.host.dataset.editorState = "ready";
  }
}

function buildEditor(options: MarkdownEditorOptions): MarkdownEditorHandle {
  let readonly = options.readonly;
  let destroyed = false;
  let previewVersion = 0;
  let previewTimer = 0;
  let composing = false;

  const shell = document.createElement("div");
  shell.className = "markdown-shell";

  const toolbar = document.createElement("div");
  toolbar.className = "markdown-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Markdown 工具");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "markdown-preview-toggle";
  toggle.dataset.previewToggle = "true";
  toggle.append(icon("Eye", 15));
  toggle.append(document.createTextNode("预览"));

  const split = document.createElement("div");
  split.className = "markdown-fallback";
  const textarea = document.createElement("textarea");
  textarea.className = "markdown-source";
  textarea.value = options.value;
  textarea.placeholder = options.placeholder;
  textarea.readOnly = readonly;
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", options.host.getAttribute("aria-label") ?? "Markdown 源码编辑器");
  const preview = document.createElement("div");
  preview.className = "markdown-preview rendered-markdown";
  split.append(textarea, preview);
  shell.append(toolbar, split);
  options.host.append(shell);

  // ---- 渲染预览 ----
  async function renderPreview(): Promise<void> {
    const version = ++previewVersion;
    const markdown = textarea.value;
    const html = options.render ? await options.render(markdown) : renderPlainMarkdown(markdown);
    if (destroyed || version !== previewVersion) return;
    preview.innerHTML = html;
  }

  function schedulePreview(): void {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => { void renderPreview(); }, 120);
  }

  // ---- 源码变更 ----
  function emitChange(): void {
    schedulePreview();
    options.onChange(textarea.value);
  }

  // ---- 光标处插入 ----
  function wrapSelection(before: string, after: string, placeholder: string): void {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end) || placeholder;
    textarea.setRangeText(before + selected + after, start, end, "end");
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    emitChange();
    textarea.focus();
  }

  function insertLine(prefix: string, placeholder: string): void {
    const start = textarea.selectionStart ?? textarea.value.length;
    const atLineStart = start === 0 || textarea.value[start - 1] === "\n";
    textarea.setRangeText((atLineStart ? "" : "\n") + prefix + placeholder, start, start, "end");
    textarea.setSelectionRange(start + (atLineStart ? 0 : 1) + prefix.length, start + (atLineStart ? 0 : 1) + prefix.length + placeholder.length);
    emitChange();
    textarea.focus();
  }

  // ---- 文件入库 ----
  async function ingestFiles(files: File[]): Promise<void> {
    if (!files.length || !options.uploadFiles || readonly) return;
    try {
      const snippet = await options.uploadFiles(files);
      if (!snippet) return;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? start;
      const needsBreak = textarea.value && !textarea.value.endsWith("\n") && !snippet.startsWith("\n");
      textarea.setRangeText((needsBreak ? "\n\n" : "\n") + snippet, start, end, "end");
      emitChange();
      textarea.focus();
    } catch (error) {
      // 入库回调自行提示错误；这里仅确保不打断编辑。
      void error;
    }
  }

  function pickFiles(accept: string): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      if (input.files?.length) void ingestFiles([...input.files]);
      input.remove();
    });
    input.click();
  }

  const actions: ToolbarAction[] = [
    { icon: "Bold", label: "加粗", apply: () => wrapSelection("**", "**", "加粗文字") },
    { icon: "Italic", label: "斜体", apply: () => wrapSelection("*", "*", "斜体文字") },
    { icon: "Heading1", label: "标题", apply: () => insertLine("## ", "标题") },
    { icon: "Quote", label: "引用", apply: () => insertLine("> ", "引用内容") },
    { icon: "List", label: "无序列表", apply: () => insertLine("- ", "列表项") },
    { icon: "ListOrdered", label: "有序列表", apply: () => insertLine("1. ", "列表项") },
    { icon: "ListChecks", label: "待办列表", apply: () => insertLine("- [ ] ", "待办事项") },
    { icon: "Code", label: "行内代码", apply: () => wrapSelection("`", "`", "代码") },
    { icon: "Table", label: "表格", apply: () => insertLine("| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |", "表格") },
    { icon: "Link", label: "链接", apply: () => wrapSelection("[", "](https://)", "链接文字") },
    { icon: "ImagePlus", label: "插入图片附件", apply: () => pickFiles("image/*") },
    { icon: "Paperclip", label: "插入文件附件", apply: () => pickFiles("*") },
  ];
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "markdown-tool";
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.append(icon(action.icon, 15));
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => action.apply());
    toolbar.append(button);
  }
  toolbar.append(toggle);
  // TEST-V08-033：外部按钮（如区块放大）放在“源码/预览”切换键右侧。
  for (const extra of options.toolbarExtras ?? []) toolbar.append(extra);

  toggle.addEventListener("click", () => {
    split.classList.toggle("preview-mode");
    const showingPreview = split.classList.contains("preview-mode");
    toggle.replaceChildren(icon(showingPreview ? "FilePenLine" : "Eye", 15), document.createTextNode(showingPreview ? "源码" : "预览"));
    if (showingPreview) void renderPreview();
    else textarea.focus();
  });

  // ---- 事件 ----
  const onInput = () => {
    // TEST-V08-017：输入法合成中不触发保存/预览，避免拼音中间态被持久化，
    // 也不打断候选词选择；compositionend 时统一提交最终值。
    if (composing) return;
    emitChange();
  };
  const onCompositionStart = () => { composing = true; };
  const onCompositionEnd = () => {
    composing = false;
    emitChange();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      options.onSave();
    }
  };
  // 拖放/粘贴文件入库：监听绑定在编辑器宿主上，覆盖工具栏、源码与预览整块区域，
  // 而不是只覆盖 textarea；dragover 必须 preventDefault，浏览器才会把从资源管理器
  // 拖入的文件交给页面处理。
  const acceptsFiles = (transfer: DataTransfer | null | undefined): boolean => {
    if (!options.uploadFiles || readonly || !transfer) return false;
    return [...transfer.items].some((item) => item.kind === "file");
  };
  let dragDepth = 0;
  const onDragEnter = (event: DragEvent) => {
    if (!acceptsFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth += 1;
    shell.classList.add("drag-active");
  };
  const onDragOver = (event: DragEvent) => {
    if (!acceptsFiles(event.dataTransfer)) return;
    event.preventDefault();
  };
  const onDragLeave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) shell.classList.remove("drag-active");
  };
  const onDrop = (event: DragEvent) => {
    dragDepth = 0;
    shell.classList.remove("drag-active");
    if (!acceptsFiles(event.dataTransfer)) return;
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) void ingestFiles(files);
  };
  const onPaste = (event: ClipboardEvent) => {
    if (!options.uploadFiles || readonly) return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    void ingestFiles(files);
  };
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("compositionstart", onCompositionStart);
  textarea.addEventListener("compositionend", onCompositionEnd);
  textarea.addEventListener("keydown", onKeyDown);
  options.host.addEventListener("dragenter", onDragEnter);
  options.host.addEventListener("dragover", onDragOver);
  options.host.addEventListener("dragleave", onDragLeave);
  options.host.addEventListener("drop", onDrop);
  options.host.addEventListener("paste", onPaste);

  void renderPreview();

  return {
    getMarkdown: () => textarea.value,
    focus: () => textarea.focus(),
    isComposing: () => composing,
    setReadonly(value: boolean) {
      readonly = value;
      textarea.readOnly = value;
      toolbar.hidden = value;
    },
    async destroy() {
      destroyed = true;
      window.clearTimeout(previewTimer);
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("compositionstart", onCompositionStart);
      textarea.removeEventListener("compositionend", onCompositionEnd);
      textarea.removeEventListener("keydown", onKeyDown);
      options.host.removeEventListener("dragenter", onDragEnter);
      options.host.removeEventListener("dragover", onDragOver);
      options.host.removeEventListener("dragleave", onDragLeave);
      options.host.removeEventListener("drop", onDrop);
      options.host.removeEventListener("paste", onPaste);
      options.host.replaceChildren();
    },
  };
}

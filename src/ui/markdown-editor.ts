import DOMPurify from "dompurify";
import { marked } from "marked";

export interface MarkdownEditorOptions {
  host: HTMLElement;
  value: string;
  placeholder: string;
  readonly: boolean;
  onChange(value: string): void;
  onSave(): void;
}

export interface MarkdownEditorHandle {
  getMarkdown(): string;
  focus(): void;
  setReadonly(value: boolean): void;
  destroy(): Promise<void>;
  readonly fallback: boolean;
}

export async function createMarkdownEditor(options: MarkdownEditorOptions): Promise<MarkdownEditorHandle> {
  options.host.replaceChildren();
  options.host.dataset.editorState = "loading";
  try {
    const [
      { CrepeBuilder },
      { blockEdit },
      { cursor },
      { imageBlock },
      { linkTooltip },
      { listItem },
      { placeholder },
      { table },
      { toolbar },
    ] = await Promise.all([
      import("@milkdown/crepe/builder"),
      import("@milkdown/crepe/feature/block-edit"),
      import("@milkdown/crepe/feature/cursor"),
      import("@milkdown/crepe/feature/image-block"),
      import("@milkdown/crepe/feature/link-tooltip"),
      import("@milkdown/crepe/feature/list-item"),
      import("@milkdown/crepe/feature/placeholder"),
      import("@milkdown/crepe/feature/table"),
      import("@milkdown/crepe/feature/toolbar"),
      import("@milkdown/crepe/theme/common/prosemirror.css"),
      import("@milkdown/crepe/theme/common/reset.css"),
      import("@milkdown/crepe/theme/common/block-edit.css"),
      import("@milkdown/crepe/theme/common/cursor.css"),
      import("@milkdown/crepe/theme/common/image-block.css"),
      import("@milkdown/crepe/theme/common/link-tooltip.css"),
      import("@milkdown/crepe/theme/common/list-item.css"),
      import("@milkdown/crepe/theme/common/placeholder.css"),
      import("@milkdown/crepe/theme/common/table.css"),
      import("@milkdown/crepe/theme/common/toolbar.css"),
      import("@milkdown/crepe/theme/classic.css"),
    ]);
    let composing = false;
    let queuedMarkdown: string | null = null;
    const crepe = new CrepeBuilder({
      root: options.host,
      defaultValue: options.value,
    })
      .addFeature(cursor)
      .addFeature(listItem)
      .addFeature(linkTooltip)
      .addFeature(imageBlock)
      .addFeature(blockEdit)
      .addFeature(placeholder, { text: options.placeholder })
      .addFeature(toolbar)
      .addFeature(table);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previous) => {
        if (markdown === previous) return;
        if (composing) queuedMarkdown = markdown;
        else options.onChange(markdown);
      });
    });
    await crepe.create();
    crepe.setReadonly(options.readonly);
    options.host.dataset.editorState = "ready";
    const onCompositionStart = () => { composing = true; };
    const onCompositionEnd = () => {
      composing = false;
      if (queuedMarkdown !== null) options.onChange(queuedMarkdown);
      queuedMarkdown = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        options.onSave();
      }
    };
    options.host.addEventListener("compositionstart", onCompositionStart, true);
    options.host.addEventListener("compositionend", onCompositionEnd, true);
    options.host.addEventListener("keydown", onKeyDown, true);
    return {
      fallback: false,
      getMarkdown: () => crepe.getMarkdown(),
      focus: () => options.host.querySelector<HTMLElement>("[contenteditable='true']")?.focus(),
      setReadonly: (value) => { crepe.setReadonly(value); },
      async destroy() {
        options.host.removeEventListener("compositionstart", onCompositionStart, true);
        options.host.removeEventListener("compositionend", onCompositionEnd, true);
        options.host.removeEventListener("keydown", onKeyDown, true);
        await crepe.destroy();
        options.host.replaceChildren();
      },
    };
  } catch {
    return createFallbackEditor(options);
  }
}

function createFallbackEditor(options: MarkdownEditorOptions): MarkdownEditorHandle {
  options.host.replaceChildren();
  options.host.dataset.editorState = "fallback";
  const shell = document.createElement("div");
  shell.className = "markdown-fallback";
  const textarea = document.createElement("textarea");
  textarea.className = "markdown-source";
  textarea.value = options.value;
  textarea.placeholder = options.placeholder;
  textarea.readOnly = options.readonly;
  const preview = document.createElement("div");
  preview.className = "markdown-preview";
  const renderPreview = () => {
    const html = marked.parse(textarea.value, { async: false }) as string;
    preview.innerHTML = DOMPurify.sanitize(html);
  };
  const onInput = () => { renderPreview(); options.onChange(textarea.value); };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      options.onSave();
    }
  };
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("keydown", onKeyDown);
  shell.append(textarea, preview);
  options.host.append(shell);
  renderPreview();
  return {
    fallback: true,
    getMarkdown: () => textarea.value,
    focus: () => textarea.focus(),
    setReadonly: (value) => { textarea.readOnly = value; },
    async destroy() {
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("keydown", onKeyDown);
      options.host.replaceChildren();
    },
  };
}

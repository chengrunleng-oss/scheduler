// 图片放大查看：点击渲染区（历史记录、编辑器预览）中的图片打开全屏遮罩预览。
// 布局：顶部操作栏（放大/缩小切换 + 关闭按钮），中间图片舞台，底部说明文字。
// 交互：点击图片或“放大”按钮切换“适应窗口 ↔ 原始尺寸”，点舞台空白处、关闭按钮
// 或按 Esc 关闭。对象 URL（blob:）图片同样适用。

import { icon } from "./icons.js";

// TEST-V08-029：供 Esc 分层退出协调使用——图片放大遮罩打开时，工作区放大层不响应 Esc。
let lightboxOpen = false;

export function isLightboxOpen(): boolean {
  return lightboxOpen;
}

export function installImageLightbox(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest) return;
    if (target.closest(".markdown-lightbox")) return;
    const image = target.closest<HTMLImageElement>(".rendered-markdown img");
    if (!image || !image.src) return;
    openLightbox(image.src, image.alt);
  });
}

function openLightbox(src: string, alt: string): void {
  const overlay = document.createElement("div");
  overlay.className = "markdown-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", alt ? `放大查看图片：${alt}` : "放大查看图片");

  const bar = document.createElement("div");
  bar.className = "markdown-lightbox-bar";
  const zoomToggle = document.createElement("button");
  zoomToggle.type = "button";
  zoomToggle.className = "markdown-lightbox-zoom";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "markdown-lightbox-close";
  closeButton.setAttribute("aria-label", "关闭放大视图");
  closeButton.append(icon("X", 18), document.createTextNode("关闭"));
  bar.append(zoomToggle, closeButton);

  const stage = document.createElement("div");
  stage.className = "markdown-lightbox-stage";
  const image = document.createElement("img");
  image.className = "markdown-lightbox-image";
  image.src = src;
  image.alt = alt;
  image.loading = "eager";
  stage.append(image);

  const caption = document.createElement("p");
  caption.className = "markdown-lightbox-caption";
  caption.textContent = alt;

  overlay.append(bar, stage, caption);

  const setZoomed = (zoomed: boolean) => {
    stage.classList.toggle("zoomed", zoomed);
    zoomToggle.replaceChildren(icon(zoomed ? "ZoomOut" : "ZoomIn", 16), document.createTextNode(zoomed ? "缩小" : "放大"));
    zoomToggle.setAttribute("aria-label", zoomed ? "缩小到适应窗口" : "放大到原始尺寸");
  };
  const toggleZoom = () => setZoomed(!stage.classList.contains("zoomed"));

  const close = () => {
    document.removeEventListener("keydown", onKey);
    lightboxOpen = false;
    overlay.remove();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  };
  zoomToggle.addEventListener("click", toggleZoom);
  closeButton.addEventListener("click", close);
  image.addEventListener("click", toggleZoom);
  stage.addEventListener("click", (event) => {
    if (event.target === stage) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  lightboxOpen = true;
  setZoomed(false);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

// 图片放大查看：点击渲染区（历史记录、编辑器预览）中的图片打开全屏遮罩预览，
// 点击遮罩或按 Esc 关闭。对象 URL（blob:）图片同样适用。

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
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.loading = "eager";
  overlay.append(image);
  if (alt) {
    const caption = document.createElement("p");
    caption.className = "markdown-lightbox-caption";
    caption.textContent = alt;
    overlay.append(caption);
  }
  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  };
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

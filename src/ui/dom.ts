export function requiredElement<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    title?: string;
  } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.title) element.title = options.title;
  return element;
}

export function setChildren(parent: Element, children: Array<Node | string>): void {
  parent.replaceChildren(
    ...children.map((child) => {
      if (typeof child !== "string") return child;
      return document.createTextNode(child);
    }),
  );
}

export function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden;
}

export function requiredElement(selector, root = document) {
    const element = root.querySelector(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    return element;
}
export function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className)
        element.className = options.className;
    if (options.text !== undefined)
        element.textContent = options.text;
    if (options.title)
        element.title = options.title;
    return element;
}
export function setChildren(parent, children) {
    parent.replaceChildren(...children.map((child) => {
        if (typeof child !== "string")
            return child;
        return document.createTextNode(child);
    }));
}
export function setHidden(element, hidden) {
    element.hidden = hidden;
}

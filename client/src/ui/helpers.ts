// ─── UI Helpers ──────────────────────────────────────────────────────────────

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') element.className = v;
      else if (k === 'innerHTML') element.innerHTML = v;
      else element.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else element.appendChild(child);
  }
  return element;
}

export function tooltip(text: string): string {
  return `<span class="tooltip-icon" data-tooltip="${text}" aria-label="${text}" tabindex="0">i</span>`;
}

export function genClientId(): string {
  return 'c_' + Math.random().toString(36).slice(2, 10);
}

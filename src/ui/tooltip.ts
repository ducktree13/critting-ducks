// Shared hover/focus tooltip. One DOM node reused for every attachment so
// the app doesn't grow a tooltip element per hoverable thing.

let tooltipEl: HTMLElement | null = null;

function ensureEl(): HTMLElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "hover-tooltip";
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function positionNear(target: Element): void {
  const tt = ensureEl();
  const rect = target.getBoundingClientRect();
  tt.style.left = `${rect.left + rect.width / 2}px`;
  tt.style.top = `${rect.top}px`;

  // Clamp inside the viewport after layout so edge elements don't clip.
  const ttRect = tt.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (ttRect.left < 4) dx = 4 - ttRect.left;
  if (ttRect.right > window.innerWidth - 4) dx = window.innerWidth - 4 - ttRect.right;
  if (ttRect.top < 4) dy = 4 - ttRect.top;
  if (dx !== 0 || dy !== 0) {
    tt.style.transform = `translate(calc(-50% + ${dx}px), calc(-100% - 10px + ${dy}px))`;
  } else {
    tt.style.transform = "";
  }
}

function show(target: Element, html: string): void {
  const tt = ensureEl();
  tt.innerHTML = html;
  tt.classList.add("show");
  positionNear(target);
}

function hide(): void {
  tooltipEl?.classList.remove("show");
}

// Attaches a hover/focus tooltip to el. content() is called fresh on every
// show, so it can reflect current game state.
export function attachTooltip(el: Element, content: () => string): void {
  el.addEventListener("mouseenter", () => show(el, content()));
  el.addEventListener("mouseleave", hide);
  el.addEventListener("focus", () => show(el, content()));
  el.addEventListener("blur", hide);
}

import type { GameState } from "../game/types";

export type PanelId = "mine" | "tree" | "arena";
const ORDER: PanelId[] = ["mine", "tree", "arena"];
const WIDTHS: Record<PanelId, string> = { mine: "1fr", tree: "1.1fr", arena: "1fr" };
const MIN_WIDTH = "64px";

// Minimize/expand: each panel header gets a toggle; the CSS grid re-flows so
// remaining panels widen. State persists in settings.panelsMinimized.
export function initLayout(
  panelsEl: HTMLElement,
  state: GameState,
  panelEls: Record<PanelId, HTMLElement>,
): void {
  for (const id of ORDER) {
    const header = panelEls[id].querySelector("h2");
    if (!header) continue;
    const btn = document.createElement("button");
    btn.className = "panel-toggle";
    btn.setAttribute("aria-label", `Minimize ${id} panel`);
    header.appendChild(btn);
    btn.addEventListener("click", () => {
      state.settings.panelsMinimized[id] = !state.settings.panelsMinimized[id];
      apply(panelsEl, state, panelEls);
    });
  }
  apply(panelsEl, state, panelEls);
}

function apply(
  panelsEl: HTMLElement,
  state: GameState,
  panelEls: Record<PanelId, HTMLElement>,
): void {
  panelsEl.style.gridTemplateColumns = ORDER.map((id) =>
    state.settings.panelsMinimized[id] ? MIN_WIDTH : WIDTHS[id],
  ).join(" ");
  for (const id of ORDER) {
    const minimized = state.settings.panelsMinimized[id];
    panelEls[id].classList.toggle("minimized", minimized);
    const btn = panelEls[id].querySelector<HTMLButtonElement>(".panel-toggle")!;
    btn.textContent = minimized ? "+" : "−";
  }
}

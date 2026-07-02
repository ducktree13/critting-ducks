import { on } from "../game/events";
import { fmt } from "./format";

const MAX_FLOATERS = 40;

const live: HTMLElement[] = [];

// Spawns floating "+N" numbers over the depositing/attacking duck (PLAN2.md
// §12), falling back to a jittered position over the panel if its slot
// isn't found (e.g. mid-reroster).
export function initFloaters(anchors: { mine: HTMLElement; arena: HTMLElement }): void {
  on("hit", (e) => {
    const anchor = anchors[e.panel];
    if (!anchor) return;

    const el = document.createElement("div");
    el.className = e.isCrit ? "floater crit" : "floater";
    const amount = e.panel === "arena" ? e.dmg : e.gold;
    el.textContent = `+${fmt(amount)}${e.isCrit ? "!" : ""}`;

    const duckEl = anchor.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl) {
      // getBoundingClientRect (not offsetLeft/Top) so this doesn't care which
      // ancestor establishes the positioning context for `anchor`.
      const duckRect = duckEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      el.style.top = "auto";
      el.style.left = `${duckRect.left - anchorRect.left + duckRect.width / 2}px`;
      el.style.bottom = `${anchorRect.bottom - duckRect.top}px`;
    } else {
      const jitter = (Math.random() - 0.5) * 80;
      el.style.left = `calc(50% + ${jitter}px)`;
    }
    anchor.appendChild(el);

    live.push(el);
    if (live.length > MAX_FLOATERS) live.shift()!.remove();
    setTimeout(() => {
      el.remove();
      const i = live.indexOf(el);
      if (i !== -1) live.splice(i, 1);
    }, 800);
  });
}

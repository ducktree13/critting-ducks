import { on } from "../game/events";
import { fmt } from "./format";

const MAX_FLOATERS = 40;

const live: HTMLElement[] = [];

// Spawns floating "+N" numbers over the panel a hit came from.
export function initFloaters(anchors: { mine: HTMLElement; arena: HTMLElement }): void {
  on("hit", (e) => {
    const anchor = anchors[e.panel];
    if (!anchor) return;

    const el = document.createElement("div");
    el.className = e.isCrit ? "floater crit" : "floater";
    const amount = e.panel === "arena" ? e.dmg : e.gold;
    el.textContent = `+${fmt(amount)}${e.isCrit ? "!" : ""}`;
    const jitter = (Math.random() - 0.5) * 80;
    el.style.left = `calc(50% + ${jitter}px)`;
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

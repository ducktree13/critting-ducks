import type { GameState } from "../game/types";

const SUN = `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="6.5" y2="6.5"/><line x1="17.5" y1="17.5" x2="19" y2="19"/><line x1="5" y1="19" x2="6.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="19" y2="5"/></g></svg>`;
const MOON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 14.5 A9 9 0 1 1 9.5 4 A7 7 0 0 0 20 14.5 z" fill="currentColor"/></svg>`;

function apply(dark: boolean, btn: HTMLElement): void {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  btn.innerHTML = dark ? SUN : MOON;
  btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
}

export function initTheme(state: GameState, btn: HTMLElement): void {
  apply(state.settings.darkMode, btn);
  btn.addEventListener("click", () => {
    state.settings.darkMode = !state.settings.darkMode;
    apply(state.settings.darkMode, btn);
  });
}

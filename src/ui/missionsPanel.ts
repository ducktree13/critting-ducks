import { missionProgress, missionRewardPreview, missionTemplate, pinMission } from "../game/missions";
import type { GameState, MissionSection } from "../game/types";
import { fmt } from "./format";

// Cache the last-rebuilt-with key and the fill-bar element per container, so
// a per-frame call can skip the innerHTML rebuild entirely when nothing the
// tracker displays has changed, and can cheaply update just the progress-bar
// width (a style write, not a rebuild) when only progress moved.
const lastKeyByEl = new WeakMap<HTMLElement, string>();
const fillElByEl = new WeakMap<HTMLElement, HTMLElement>();

// Tracks which section (if any) currently has its picker menu open, so we
// can close it when a different tracker rebuilds or the user clicks away.
let openMenuSection: MissionSection | null = null;
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function closeMenu(): void {
  openMenuSection = null;
  if (outsideClickHandler) {
    document.removeEventListener("click", outsideClickHandler, true);
    outsideClickHandler = null;
  }
  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

// Renders a compact pinned-mission tracker into containerEl for the given
// section: name, progress bar, and a "Choose…" control that opens a small
// anchored menu listing every active mission in that section. Call once to
// mount, then again each render tick to refresh.
export function renderMissionTracker(
  section: MissionSection,
  containerEl: HTMLElement,
  state: GameState,
): void {
  const active = state.missions[section];
  if (active.length === 0) {
    if (lastKeyByEl.get(containerEl) !== "") {
      containerEl.innerHTML = "";
      lastKeyByEl.set(containerEl, "");
      fillElByEl.delete(containerEl);
    }
    if (openMenuSection === section) closeMenu();
    return;
  }

  const pinnedId = state.pinnedMission[section] ?? active[0].id;
  const instance = active.find((m) => m.id === pinnedId) ?? active[0];
  const template = missionTemplate(instance);
  const { current, target } = missionProgress(state, instance);
  const pct = Math.min((current / target) * 100, 100);

  // Key covers everything that changes the *structure* (name, desc, choose
  // button presence) — progress % is applied separately via a style write so
  // a moving progress bar doesn't force a full innerHTML rebuild every frame.
  const key = `${instance.id}|${template.name}|${active.length > 1}`;
  if (lastKeyByEl.get(containerEl) !== key) {
    containerEl.innerHTML = `
      <div class="mission-tracker">
        <div class="mission-head">
          <b>${template.name}</b>
          ${active.length > 1 ? `<button class="mission-cycle" id="mission-choose-${section}" title="Pick which mission to track">Choose…</button>` : ""}
        </div>
        <div class="mission-desc">${template.desc(instance.target - instance.startValue)}</div>
        <div class="mission-bar"><span class="mission-fill" style="width:${pct}%"></span></div>
      </div>
    `;
    lastKeyByEl.set(containerEl, key);
    fillElByEl.set(containerEl, containerEl.querySelector<HTMLElement>(".mission-fill")!);

    if (openMenuSection === section) closeMenu();

    containerEl.querySelector(`#mission-choose-${section}`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (openMenuSection === section) {
        closeMenu();
        return;
      }
      openMissionMenu(section, containerEl, state, pinnedId);
    });
  } else {
    const fillEl = fillElByEl.get(containerEl);
    if (fillEl) fillEl.style.width = `${pct}%`;
  }
}

function openMissionMenu(
  section: MissionSection,
  containerEl: HTMLElement,
  state: GameState,
  pinnedId: string,
): void {
  closeMenu();
  openMenuSection = section;

  const trackerEl = containerEl.querySelector(".mission-tracker");
  if (!trackerEl) return;

  const menu = document.createElement("div");
  menu.className = "mission-menu";
  menu.innerHTML = state.missions[section]
    .map((instance) => {
      const template = missionTemplate(instance);
      const { current, target } = missionProgress(state, instance);
      const isPinned = instance.id === pinnedId;
      const reward = missionRewardPreview(instance);
      return `
        <button class="mission-menu-row${isPinned ? " pinned" : ""}" data-id="${instance.id}">
          <span class="mission-menu-name">${isPinned ? "✓ " : ""}${template.name}</span>
          <span class="mission-menu-progress">${fmt(current)}/${fmt(target)}</span>
          <span class="mission-menu-reward">${reward}</span>
        </button>
      `;
    })
    .join("");

  menu.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".mission-menu-row");
    if (!row) return;
    e.stopPropagation();
    pinMission(state, section, row.dataset.id!);
    closeMenu();
  });

  trackerEl.appendChild(menu);

  outsideClickHandler = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) closeMenu();
  };
  escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeMenu();
  };
  // Defer attaching so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    if (outsideClickHandler) document.addEventListener("click", outsideClickHandler, true);
    if (escHandler) document.addEventListener("keydown", escHandler);
  }, 0);
}

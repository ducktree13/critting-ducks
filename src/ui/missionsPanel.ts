import { missionProgress, missionTemplate, pinMission } from "../game/missions";
import type { GameState, MissionInstance, MissionSection } from "../game/types";

// Cache the last-rebuilt-with key and the fill-bar element per container, so
// a per-frame call can skip the innerHTML rebuild entirely when nothing the
// tracker displays has changed, and can cheaply update just the progress-bar
// width (a style write, not a rebuild) when only progress moved.
const lastKeyByEl = new WeakMap<HTMLElement, string>();
const fillElByEl = new WeakMap<HTMLElement, HTMLElement>();

// Renders a compact pinned-mission tracker into containerEl for the given
// section: name, progress bar, and a control to cycle which active mission
// is pinned. Call once to mount, then again each render tick to refresh.
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
    return;
  }

  const pinnedId = state.pinnedMission[section] ?? active[0].id;
  const instance = active.find((m) => m.id === pinnedId) ?? active[0];
  const template = missionTemplate(instance);
  const { current, target } = missionProgress(state, instance);
  const pct = Math.min((current / target) * 100, 100);

  // Key covers everything that changes the *structure* (name, desc, cycle
  // button presence) — progress % is applied separately via a style write so
  // a moving progress bar doesn't force a full innerHTML rebuild every frame.
  const key = `${instance.id}|${template.name}|${active.length > 1}`;
  if (lastKeyByEl.get(containerEl) !== key) {
    containerEl.innerHTML = `
      <div class="mission-tracker">
        <div class="mission-head">
          <b>${template.name}</b>
          ${active.length > 1 ? `<button class="mission-cycle" id="mission-cycle-${section}" title="Track a different mission">⇄</button>` : ""}
        </div>
        <div class="mission-desc">${template.desc(instance.target - instance.startValue)}</div>
        <div class="mission-bar"><span class="mission-fill" style="width:${pct}%"></span></div>
      </div>
    `;
    lastKeyByEl.set(containerEl, key);
    fillElByEl.set(containerEl, containerEl.querySelector<HTMLElement>(".mission-fill")!);

    containerEl.querySelector(`#mission-cycle-${section}`)?.addEventListener("click", () => {
      const others = active.filter((m: MissionInstance) => m.id !== instance.id);
      if (others.length > 0) pinMission(state, section, others[0].id);
    });
  } else {
    const fillEl = fillElByEl.get(containerEl);
    if (fillEl) fillEl.style.width = `${pct}%`;
  }
}

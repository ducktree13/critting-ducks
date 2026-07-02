import { missionProgress, missionTemplate, pinMission } from "../game/missions";
import type { GameState, MissionInstance, MissionSection } from "../game/types";

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
    containerEl.innerHTML = "";
    return;
  }

  const pinnedId = state.pinnedMission[section] ?? active[0].id;
  const instance = active.find((m) => m.id === pinnedId) ?? active[0];
  const template = missionTemplate(instance);
  const { current, target } = missionProgress(state, instance);
  const pct = Math.min((current / target) * 100, 100);

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

  containerEl.querySelector(`#mission-cycle-${section}`)?.addEventListener("click", () => {
    const others = active.filter((m: MissionInstance) => m.id !== instance.id);
    if (others.length > 0) pinMission(state, section, others[0].id);
  });
}

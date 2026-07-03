import { getDuckDef } from "../game/ducks";
import { assignToRoster, isRoleEligible } from "../game/state";
import type { GameState, Panel } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { attachTooltip } from "./tooltip";

// Overlay listing owned ducks; clicking one assigns it to the slot. Ducks
// whose role isn't eligible for this panel (PLAN2.md §4 Phase B) render
// greyed out in a separate "Wrong role" section at the bottom, same
// .picker-disabled treatment as expedition-away ducks, so players can see
// exactly why a duck can't go there instead of it just being missing.
export function openRosterPicker(state: GameState, panel: Panel, slotIndex: number): void {
  document.querySelector(".picker-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "picker-overlay";

  const current = state.rosters[panel][slotIndex];

  function rowHtml(duck: GameState["ducks"][number], wrongRole: boolean): string {
    const def = getDuckDef(duck.defId);
    const onExpedition = state.expeditions.some((e) => e.ducks.includes(duck.defId));
    const disabled = onExpedition || wrongRole;
    const where =
      onExpedition
        ? "on expedition"
        : state.rosters.mine.includes(duck.defId)
          ? "in mine"
          : state.rosters.arena.includes(duck.defId)
            ? "in arena"
            : state.rosters.pond.includes(duck.defId)
              ? "in pond"
              : "";
    const meta = [`Lv ${duck.level}`, def.role, wrongRole ? "wrong role" : where].filter(Boolean).join(" · ");
    return `
      <button class="picker-row${disabled ? " picker-disabled" : ""}" data-duck="${duck.defId}"${disabled ? " disabled" : ""}>
        <span class="picker-art">${duckSvg(duck.defId, 44, duck.ascension ?? 0)}</span>
        <span class="picker-info">
          <b>${def.name}</b>
          <small>${meta}</small>
        </span>
      </button>`;
  }

  const eligible: GameState["ducks"][number][] = [];
  const wrongRole: GameState["ducks"][number][] = [];
  for (const duck of state.ducks) {
    if (isRoleEligible(panel, getDuckDef(duck.defId).role)) eligible.push(duck);
    else wrongRole.push(duck);
  }

  const eligibleRows = eligible.map((duck) => rowHtml(duck, false)).join("");
  const wrongRoleRows = wrongRole.map((duck) => rowHtml(duck, true)).join("");

  overlay.innerHTML = `
    <div class="picker-box">
      <h3>Assign to ${panel} slot ${slotIndex + 1}</h3>
      <div class="picker-list">
        ${eligibleRows}
        ${current ? `<button class="picker-row picker-clear" data-clear="1">Clear slot</button>` : ""}
        ${wrongRoleRows ? `<div class="picker-section-label">Wrong role</div>${wrongRoleRows}` : ""}
      </div>
    </div>
  `;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll<HTMLButtonElement>(".picker-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      assignToRoster(state, panel, slotIndex, btn.dataset.clear ? null : btn.dataset.duck!);
      overlay.remove();
    });
    const defId = btn.dataset.duck;
    if (defId) {
      const duck = state.ducks.find((d) => d.defId === defId);
      if (duck) attachTooltip(btn, () => duckTooltipHtml(state, duck));
    }
  });

  document.body.appendChild(overlay);
}

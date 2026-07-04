import { getDuckDef } from "../game/ducks";
import { assignToRoster, isRoleEligible } from "../game/state";
import type { GameState, Panel } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { duckComparator, type SortKey } from "./duckSort";
import { attachTooltip } from "./tooltip";

// Remembered module-level for the session (PLAN2.md Phase R1): the roster
// picker's eligible-list sort choice persists across openings while the
// game stays loaded, but isn't saved.
let pickerSortKey: SortKey = "rarity";

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
  eligible.sort(duckComparator(pickerSortKey));
  wrongRole.sort(duckComparator(pickerSortKey));

  function render(): void {
    const eligibleRows = eligible.map((duck) => rowHtml(duck, false)).join("");
    const wrongRoleRows = wrongRole.map((duck) => rowHtml(duck, true)).join("");

    overlay.innerHTML = `
      <div class="picker-box">
        <h3>Assign to ${panel} slot ${slotIndex + 1}</h3>
        <select id="picker-sort" aria-label="Sort ducks">
          <option value="rarity"${pickerSortKey === "rarity" ? " selected" : ""}>Rarity</option>
          <option value="role"${pickerSortKey === "role" ? " selected" : ""}>Class</option>
          <option value="level"${pickerSortKey === "level" ? " selected" : ""}>Level</option>
        </select>
        <div class="picker-list">
          ${eligibleRows}
          ${current ? `<button class="picker-row picker-clear" data-clear="1">Clear slot</button>` : ""}
          ${wrongRoleRows ? `<div class="picker-section-label">Wrong role</div>${wrongRoleRows}` : ""}
        </div>
      </div>
    `;

    overlay.querySelector<HTMLSelectElement>("#picker-sort")!.addEventListener("change", (e) => {
      pickerSortKey = (e.target as HTMLSelectElement).value as SortKey;
      eligible.sort(duckComparator(pickerSortKey));
      wrongRole.sort(duckComparator(pickerSortKey));
      render();
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
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  render();
  document.body.appendChild(overlay);
}

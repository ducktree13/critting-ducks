import { getDuckDef } from "../game/ducks";
import { assignToRoster } from "../game/state";
import type { GameState, Panel } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { attachTooltip } from "./tooltip";

// Overlay listing owned ducks; clicking one assigns it to the slot.
export function openRosterPicker(state: GameState, panel: Panel, slotIndex: number): void {
  document.querySelector(".picker-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "picker-overlay";

  const current = state.rosters[panel][slotIndex];
  const rows = state.ducks
    .map((duck) => {
      const def = getDuckDef(duck.defId);
      const where =
        state.rosters.mine.includes(duck.defId)
          ? "in mine"
          : state.rosters.arena.includes(duck.defId)
            ? "in arena"
            : "";
      return `
        <button class="picker-row" data-duck="${duck.defId}">
          <span class="picker-art">${duckSvg(duck.defId, 44)}</span>
          <span class="picker-info">
            <b>${def.name}</b>
            <small>Lv ${duck.level} · ${def.role}${where ? ` · ${where}` : ""}</small>
          </span>
        </button>`;
    })
    .join("");

  overlay.innerHTML = `
    <div class="picker-box">
      <h3>Assign to ${panel} slot ${slotIndex + 1}</h3>
      <div class="picker-list">
        ${rows}
        ${current ? `<button class="picker-row picker-clear" data-clear="1">Clear slot</button>` : ""}
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
      if (duck) attachTooltip(btn, () => duckTooltipHtml(duck));
    }
  });

  document.body.appendChild(overlay);
}

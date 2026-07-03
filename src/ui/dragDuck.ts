import { getDuckDef } from "../game/ducks";
import { assignToRoster, isRoleEligible } from "../game/state";
import type { GameState, Panel } from "../game/types";
import { showToast } from "./achievementsPanel";

// HTML5 drag-and-drop wiring shared by the mine/arena/pond roster slots and
// the inventory grid (PLAN2.md Phase B2). dataTransfer payloads aren't
// readable during dragover/dragenter (only on drop), so we track the
// currently-dragged duck's defId in this module-level variable, set on
// dragstart and cleared on dragend, so drop targets can preview eligibility.
let draggedDefId: string | null = null;

const REJECT_MESSAGE: Record<Panel, string> = {
  mine: "Miners only",
  arena: "Fighters only",
  pond: "Pond ducks only",
};

// Marks an element as a drag source carrying `defId`. Used for both
// inventory tiles and occupied roster slots (so ducks can be dragged
// directly between panels).
export function makeDuckDraggable(el: HTMLElement, defId: string, _state: GameState): void {
  el.draggable = true;
  el.addEventListener("dragstart", (e) => {
    draggedDefId = defId;
    el.classList.add("dragging");
    document.body.classList.add("duck-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/duck", defId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setDragImage(el, el.clientWidth / 2, el.clientHeight / 2);
    }
  });
  el.addEventListener("dragend", () => {
    draggedDefId = null;
    el.classList.remove("dragging");
    document.body.classList.remove("duck-dragging");
  });
}

// Wires `el` (a roster slot, occupied or empty) as a drop target for panel's
// slotIndex. Toggles .drop-ok/.drop-bad while dragging over based on role
// eligibility, flashes .drop-rejected + toasts a reason on an invalid drop.
export function makeDuckDropTarget(el: HTMLElement, panel: Panel, slotIndex: number, state: GameState): void {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const eligible = draggedDefId !== null && isRoleEligible(panel, getDuckDef(draggedDefId).role);
    e.dataTransfer.dropEffect = eligible ? "move" : "none";
    el.classList.toggle("drop-ok", eligible);
    el.classList.toggle("drop-bad", !eligible);
  });

  el.addEventListener("dragleave", () => {
    el.classList.remove("drop-ok", "drop-bad");
  });

  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("drop-ok", "drop-bad");
    const defId = e.dataTransfer?.getData("text/duck") || draggedDefId;
    if (!defId) return;
    if (!assignToRoster(state, panel, slotIndex, defId)) {
      el.classList.remove("drop-rejected");
      void el.offsetWidth;
      el.classList.add("drop-rejected");
      setTimeout(() => el.classList.remove("drop-rejected"), 400);
      showToast(REJECT_MESSAGE[panel]);
    }
  });
}

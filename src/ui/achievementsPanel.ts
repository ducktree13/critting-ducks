import { ACHIEVEMENTS } from "../game/achievements";
import { MATERIAL_NAMES } from "../game/balance";
import { on } from "../game/events";
import type { GameState } from "../game/types";
import { fmt } from "./format";

let overlay: HTMLElement;
let gameState: GameState;
let toastEl: HTMLElement;

export function initAchievementsPanel(state: GameState): void {
  gameState = state;
  overlay = document.createElement("div");
  overlay.className = "shop-overlay achievements-overlay";
  overlay.innerHTML = `
    <div class="shop-box">
      <div class="shop-head">
        <h3>Achievements</h3>
        <button class="shop-close" id="ach-close">✕</button>
      </div>
      <div class="achievements-list" id="ach-list"></div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeAchievements();
  });
  overlay.querySelector("#ach-close")!.addEventListener("click", closeAchievements);
  document.body.appendChild(overlay);

  toastEl = document.createElement("div");
  toastEl.className = "toast-stack";
  document.body.appendChild(toastEl);

  on("achievement", (e) => showToast(`🏆 Achievement: ${e.name}`));
  on("missionComplete", (e) => showToast(`✔ Mission complete: ${e.name}`));
  on("equipmentDrop", (e) => showToast(`⚔ Gear found: ${e.item.name}`));
  on("materialDrop", (e) => showToast(`🧪 Material: ${MATERIAL_NAMES[e.material]}`));
  on("chapterAdvance", () => showToast(`🌳 Act 2 begins! New trees are sprouting.`));
  on("bubblePopped", (e) => {
    if (e.kind === "duck") showToast(`🫧✨ A bubble revealed... Duck Tree!`);
    else showToast(`🫧 Bubble: +${fmt(e.amount)} ${e.kind}${e.isCrit ? " (crit!)" : ""}`);
  });
  on("expeditionReady", () => showToast(`🗺 An expedition is ready to claim!`));
  on("firstDefeat", (e) => showToast(`⚔ First defeat: ${e.name}! +${fmt(e.xp)} XP`));
}

export function openAchievements(): void {
  const list = overlay.querySelector("#ach-list")!;
  list.innerHTML = ACHIEVEMENTS.map((def) => {
    const done = gameState.achievementsCompleted.includes(def.id);
    if (def.hidden && !done) {
      return `
      <div class="ach-row ach-hidden">
        <div class="ach-info">
          <b>???</b>
          <small>Hidden achievement</small>
        </div>
      </div>`;
    }
    const current = Math.min(def.metric(gameState), def.target);
    const pct = Math.min((current / def.target) * 100, 100);
    return `
      <div class="ach-row${done ? " done" : ""}">
        <div class="ach-info">
          <b>${done ? "✓ " : ""}${def.name}</b>
          <small>${def.desc}</small>
        </div>
        <div class="ach-bar"><span class="ach-fill" style="width:${pct}%"></span></div>
        <small class="ach-progress">${fmt(current)} / ${fmt(def.target)}</small>
      </div>`;
  }).join("");
  overlay.classList.add("open");
}

function closeAchievements(): void {
  overlay.classList.remove("open");
}

export function showToast(text: string): void {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastEl.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

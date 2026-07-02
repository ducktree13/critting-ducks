import { MATERIAL_NAMES } from "../game/balance";
import { canCraft, craftItem, RECIPES } from "../game/crafting";
import type { GameState, OreId, Rng } from "../game/types";
import { fmt } from "./format";

const ORE_NAMES: Record<OreId, string> = {
  copper: "Copper", silver: "Silver", crystal: "Crystal",
  starmetal: "Starmetal", voidstone: "Voidstone", aurorium: "Aurorium",
};

let overlay: HTMLElement;
let gameState: GameState;
let gameRng: Rng;

export function initCraftingMenu(state: GameState, rng: Rng): void {
  gameState = state;
  gameRng = rng;

  overlay = document.createElement("div");
  overlay.className = "shop-overlay";
  overlay.innerHTML = `
    <div class="shop-box">
      <div class="shop-head">
        <h3>Crafting</h3>
        <button class="shop-close" id="craft-close">✕</button>
      </div>
      <div class="crafting-list" id="craft-list"></div>
      <div class="crafting-result" id="craft-result"></div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCrafting();
  });
  overlay.querySelector("#craft-close")!.addEventListener("click", closeCrafting);
  document.body.appendChild(overlay);
}

export function openCrafting(): void {
  renderRecipes();
  overlay.querySelector("#craft-result")!.innerHTML = "";
  overlay.classList.add("open");
}

function closeCrafting(): void {
  overlay.classList.remove("open");
}

function costLine(costs: Partial<Record<string, number>>, names: Record<string, string>): string {
  return Object.entries(costs)
    .map(([id, amount]) => `${names[id] ?? id} ${fmt(amount ?? 0)}`)
    .join(", ");
}

function renderRecipes(): void {
  const list = overlay.querySelector("#craft-list")!;
  list.innerHTML = RECIPES.map((recipe) => {
    const locked = gameState.level < recipe.minLevel;
    const affordable = canCraft(gameState, recipe.id);
    return `
      <div class="recipe-row${locked ? " locked" : ""}">
        <div class="recipe-info">
          <b>${recipe.name}</b>
          ${locked ? `<small>🔒 Unlocks at level ${recipe.minLevel}</small>` : `<small>${costLine(recipe.oreCost, ORE_NAMES)}${Object.keys(recipe.materialCost).length ? " · " + costLine(recipe.materialCost, MATERIAL_NAMES) : ""}</small>`}
        </div>
        <button class="settings-btn" data-recipe="${recipe.id}" ${locked || !affordable ? "disabled" : ""}>Craft</button>
      </div>`;
  }).join("");

  list.querySelectorAll<HTMLButtonElement>("[data-recipe]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = craftItem(gameState, gameRng, btn.dataset.recipe!);
      const result = overlay.querySelector("#craft-result")!;
      result.innerHTML = item
        ? `<div class="reveal-card rarity-${item.rarity}"><b>${item.name}</b><small>${item.slot}</small></div>`
        : `<span class="shop-error">Missing materials.</span>`;
      renderRecipes();
    });
  });
}

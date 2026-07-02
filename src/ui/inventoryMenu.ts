import { attackDamageOf, getDuckDef, hpOf, miningPowerOf } from "../game/ducks";
import { upgradeCost } from "../game/packs";
import { toggleFavorite } from "../game/state";
import type { GameState, Rarity } from "../game/types";
import { duckSvg } from "./duckArt";

type SortKey = "favorite" | "rarity" | "role" | "level";

const RARITY_RANK: Record<Rarity, number> = {
  divine: 0,
  mythic: 1,
  legendary: 2,
  epic: 3,
  rare: 4,
  uncommon: 5,
  common: 6,
};

let overlay: HTMLElement;
let gameState: GameState;
let sortKey: SortKey = "favorite";
let selectedDefId: string | null = null;

export function initInventoryMenu(state: GameState): void {
  gameState = state;
  overlay = document.createElement("div");
  overlay.className = "inventory-overlay";
  overlay.innerHTML = `
    <div class="inventory-box">
      <div class="inventory-head">
        <h3>Ducks</h3>
        <select id="inv-sort" aria-label="Sort ducks">
          <option value="favorite">Favorites first</option>
          <option value="rarity">Rarity</option>
          <option value="role">Profession</option>
          <option value="level">Level</option>
        </select>
        <button class="shop-close" id="inv-close">✕</button>
      </div>
      <div class="inventory-body">
        <div class="inventory-grid" id="inv-grid"></div>
        <div class="inventory-card" id="inv-card"></div>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeInventory();
  });
  overlay.querySelector("#inv-close")!.addEventListener("click", closeInventory);
  overlay.querySelector<HTMLSelectElement>("#inv-sort")!.addEventListener("change", (e) => {
    sortKey = (e.target as HTMLSelectElement).value as SortKey;
    renderGrid();
  });
  document.body.appendChild(overlay);
}

export function openInventory(): void {
  renderGrid();
  renderCard();
  overlay.classList.add("open");
}

function closeInventory(): void {
  overlay.classList.remove("open");
}

function sortedDucks() {
  const ducks = [...gameState.ducks];
  ducks.sort((a, b) => {
    const rarityDiff = RARITY_RANK[getDuckDef(a.defId).rarity] - RARITY_RANK[getDuckDef(b.defId).rarity];
    switch (sortKey) {
      case "favorite": {
        const diff = (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
        return diff !== 0 ? diff : rarityDiff;
      }
      case "rarity":
        return rarityDiff;
      case "role":
        return getDuckDef(a.defId).role.localeCompare(getDuckDef(b.defId).role);
      case "level":
        return b.level - a.level;
    }
  });
  return ducks;
}

function renderGrid(): void {
  const grid = overlay.querySelector("#inv-grid")!;
  grid.innerHTML = sortedDucks()
    .map((duck) => {
      const def = getDuckDef(duck.defId);
      return `
        <button class="inv-tile rarity-${def.rarity}${duck.defId === selectedDefId ? " selected" : ""}" data-duck="${duck.defId}">
          ${duckSvg(duck.defId, 48)}
          ${duck.favorite ? `<span class="inv-fav">♥</span>` : ""}
          <small>${def.name}</small>
        </button>`;
    })
    .join("");

  grid.querySelectorAll<HTMLButtonElement>(".inv-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDefId = btn.dataset.duck!;
      renderGrid();
      renderCard();
    });
  });
}

function renderCard(): void {
  const card = overlay.querySelector("#inv-card")!;
  const duck = selectedDefId ? gameState.ducks.find((d) => d.defId === selectedDefId) : null;
  if (!duck) {
    card.innerHTML = `<p class="inv-hint">Select a duck to see its card.</p>`;
    return;
  }
  const def = getDuckDef(duck.defId);
  const cost = upgradeCost(duck);
  const mine = gameState.rosters.mine.includes(duck.defId);
  const arena = gameState.rosters.arena.includes(duck.defId);
  const rosterLabel = mine ? "Rostered in Mine" : arena ? "Rostered in Arena" : "Not rostered";

  const statLine: string[] = [];
  if (def.role !== "fighter") statLine.push(`Mining ${miningPowerOf(duck).toFixed(2)}`);
  if (def.role !== "miner") {
    statLine.push(`Attack ${attackDamageOf(duck).toFixed(2)}`);
    statLine.push(`HP ${hpOf(duck).toFixed(0)}`);
    statLine.push(`Defense ${def.defense}`);
  }
  if (def.critChanceBonus) statLine.push(`Crit +${Math.round(def.critChanceBonus * 100)}%`);

  card.innerHTML = `
    <div class="inv-card-art">${duckSvg(duck.defId, 96)}</div>
    <div class="inv-card-body">
      <div class="inv-card-title">
        <b>${def.name}</b>
        <button class="fav-btn" id="inv-fav-btn">${duck.favorite ? "♥" : "♡"}</button>
      </div>
      <div class="inv-card-sub">${def.rarity} · ${def.role} · Lv ${duck.level}</div>
      <div class="inv-card-stats">${statLine.join(" · ")}</div>
      <div class="inv-card-shards">${duck.shards} shard${duck.shards === 1 ? "" : "s"}${duck.level < 10 ? ` (upgrade costs ${cost})` : " (max level)"}</div>
      <div class="inv-card-roster">${rosterLabel}</div>
    </div>
  `;
  card.querySelector("#inv-fav-btn")!.addEventListener("click", () => {
    toggleFavorite(gameState, duck.defId);
    renderCard();
    renderGrid();
  });
}

import { ASCENSION, GEAR, MATERIAL_NAMES } from "../game/balance";
import { attackDamageOf, defenseOf, getDuckDef, hpOf, miningPowerOf } from "../game/ducks";
import { equipItem, equippedItemsFor, sellEquipment, unequipItem } from "../game/gear";
import { ascendDuck, ascensionCost, canAscend, canUpgrade, upgradeAll, upgradeCost } from "../game/packs";
import { toggleFavorite } from "../game/state";
import { TRAITS } from "../game/traits";
import type { EquipSlot, EquipmentItem, GameState, Rarity } from "../game/types";
import { showToast } from "./achievementsPanel";
import { duckSvg, rarityCrestBadge } from "./duckArt";
import { makeDuckDraggable } from "./dragDuck";
import { attachTooltip } from "./tooltip";

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: "Weapon", armor: "Armor", charm: "Charm" };

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
        <button class="settings-btn" id="inv-upgrade-all">Upgrade All</button>
        <button class="shop-close" id="inv-close">✕</button>
      </div>
      <div class="inventory-body">
        <div class="inventory-grid" id="inv-grid"></div>
        <div class="inventory-card" id="inv-card"></div>
      </div>
      <div class="inventory-materials" id="inv-materials"></div>
      <div class="inventory-gear" id="inv-gear"></div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeInventory();
  });
  // The inventory is a full-screen modal, so dragging a tile out to a
  // roster slot behind it would otherwise be impossible. Docking the box
  // to one side at a reduced scale while a drag is in flight keeps the
  // world panels visible (and thus droppable) without closing the menu.
  overlay.addEventListener("dragstart", (e) => {
    if ((e.target as HTMLElement)?.closest(".inv-tile")) overlay.classList.add("dragging-out");
  });
  overlay.addEventListener("dragend", () => overlay.classList.remove("dragging-out"));
  overlay.querySelector("#inv-close")!.addEventListener("click", closeInventory);
  overlay.querySelector<HTMLSelectElement>("#inv-sort")!.addEventListener("change", (e) => {
    sortKey = (e.target as HTMLSelectElement).value as SortKey;
    renderGrid();
  });
  overlay.querySelector("#inv-upgrade-all")!.addEventListener("click", () => {
    const result = upgradeAll(gameState);
    if (result.ducks > 0) {
      showToast(`Upgraded ${result.ducks} duck${result.ducks === 1 ? "" : "s"} (+${result.levels} level${result.levels === 1 ? "" : "s"})`);
      renderGrid();
      renderCard();
    }
    renderUpgradeAllButton();
  });
  document.body.appendChild(overlay);
}

function renderUpgradeAllButton(): void {
  const btn = overlay.querySelector<HTMLButtonElement>("#inv-upgrade-all")!;
  btn.disabled = !gameState.ducks.some((d) => canUpgrade(gameState, d.defId));
}

export function openInventory(): void {
  renderGrid();
  renderCard();
  renderMaterials();
  renderUnequippedGear();
  renderUpgradeAllButton();
  overlay.classList.add("open");
}

function renderMaterials(): void {
  const el = overlay.querySelector("#inv-materials")!;
  el.innerHTML = (Object.keys(MATERIAL_NAMES) as (keyof typeof MATERIAL_NAMES)[])
    .map((id) => `<span>${MATERIAL_NAMES[id]}: ${gameState.materials[id]}</span>`)
    .join("");
}

function renderUnequippedGear(): void {
  const el = overlay.querySelector("#inv-gear")!;
  const unequipped = gameState.equipment.filter((e) => e.equippedBy === null);
  if (unequipped.length === 0) {
    el.innerHTML = `<p class="inv-hint">No unequipped gear. Battle or craft to find some.</p>`;
    return;
  }
  el.innerHTML = unequipped
    .map(
      (item) => `
      <div class="gear-row rarity-${item.rarity}">
        <span>${item.name} <small>(${item.slot})</small></span>
        <button class="settings-btn" data-sell="${item.id}">Sell for ${GEAR.sellPrice[item.rarity]}g</button>
      </div>`,
    )
    .join("");
  el.querySelectorAll<HTMLButtonElement>("[data-sell]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (sellEquipment(gameState, btn.dataset.sell!)) renderUnequippedGear();
    });
  });
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
          ${duckSvg(duck.defId, 48, duck.ascension ?? 0)}
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
    // Dragging out of the inventory doubles as a drop source for roster
    // slots behind the modal (see the dock-aside toggle below); the drag
    // itself is wired through the shared dragDuck helper.
    makeDuckDraggable(btn, btn.dataset.duck!, gameState);
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
  const ascension = duck.ascension ?? 0;
  const maxedOut = duck.level >= 10 && ascension >= ASCENSION.maxAscensions;
  const mine = gameState.rosters.mine.includes(duck.defId);
  const arena = gameState.rosters.arena.includes(duck.defId);
  const rosterLabel = mine ? "Rostered in Mine" : arena ? "Rostered in Arena" : "Not rostered";

  const statLine: string[] = [];
  if (def.role !== "fighter") statLine.push(`Mining ${miningPowerOf(duck).toFixed(2)}`);
  if (def.role !== "miner") {
    statLine.push(`Attack ${attackDamageOf(gameState, duck).toFixed(2)}`);
    statLine.push(`HP ${hpOf(gameState, duck).toFixed(0)}`);
    statLine.push(`Defense ${defenseOf(gameState, duck).toFixed(1)}`);
  }
  if (def.critChanceBonus) statLine.push(`Crit +${Math.round(def.critChanceBonus * 100)}%`);

  const equipped = equippedItemsFor(gameState, duck.defId);
  const slotsHtml = (["weapon", "armor", "charm"] as EquipSlot[])
    .map((slot) => {
      const item = equipped[slot];
      return `<button class="equip-slot rarity-${item?.rarity ?? "none"}" data-slot="${slot}">
        <small>${SLOT_LABEL[slot]}</small>
        <span>${item ? item.name : "— empty —"}</span>
      </button>`;
    })
    .join("");

  card.innerHTML = `
    <div class="inv-card-art">${rarityCrestBadge(def.rarity)}${duckSvg(duck.defId, 96, duck.ascension ?? 0)}</div>
    <div class="inv-card-body">
      <div class="inv-card-title">
        <b>${def.name}</b>
        <button class="fav-btn" id="inv-fav-btn">${duck.favorite ? "♥" : "♡"}</button>
      </div>
      <div class="inv-card-sub">${def.rarity} · ${def.role} · Lv ${duck.level}${ascension ? ` · ${"★".repeat(ascension)}` : ""} · ${TRAITS[def.trait].name}</div>
      <div class="inv-card-trait">${TRAITS[def.trait].desc}</div>
      <div class="inv-card-stats">${statLine.join(" · ")}</div>
      <div class="inv-card-shards">
        ${duck.shards} shard${duck.shards === 1 ? "" : "s"}${duck.level < 10 ? ` (upgrade costs ${cost})` : ""}
        ${
          maxedOut
            ? " (fully ascended)"
            : duck.level >= 10
              ? `<button class="settings-btn" id="inv-ascend-btn" ${canAscend(gameState, duck.defId) ? "" : "disabled"}>Ascend (${ascensionCost(duck.defId)} shards)</button>`
              : ""
        }
      </div>
      <div class="inv-card-roster">${rosterLabel}</div>
      <div class="inv-card-equip">${slotsHtml}</div>
    </div>
  `;
  card.querySelector("#inv-fav-btn")!.addEventListener("click", () => {
    toggleFavorite(gameState, duck.defId);
    renderCard();
    renderGrid();
  });
  card.querySelector("#inv-ascend-btn")?.addEventListener("click", () => {
    if (ascendDuck(gameState, duck.defId)) {
      renderCard();
      renderGrid();
      renderUpgradeAllButton();
    }
  });
  card.querySelectorAll<HTMLButtonElement>(".equip-slot").forEach((btn) => {
    const slot = btn.dataset.slot as EquipSlot;
    const item = equipped[slot];
    if (item) {
      attachTooltip(btn, () => equipmentTooltipHtml(item));
    }
    btn.addEventListener("click", () => openEquipPicker(duck.defId, slot));
  });
}

function equipmentTooltipHtml(item: EquipmentItem): string {
  const parts = Object.entries(item.stats)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  return `<b>${item.name}</b> <span class="tt-rarity rarity-${item.rarity}">${item.rarity}</span><div class="tt-stats">${parts.join(" · ")}</div>`;
}

// Overlay listing unequipped items for the given slot, plus the currently
// equipped item (if any) with an unequip option.
function openEquipPicker(defId: string, slot: EquipSlot): void {
  document.querySelector(".picker-overlay")?.remove();
  const equipped = equippedItemsFor(gameState, defId)[slot];
  const candidates = gameState.equipment.filter((e) => e.slot === slot && e.equippedBy === null);

  const rows = candidates
    .map((item) => {
      const statLine = Object.entries(item.stats)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ");
      return `<button class="picker-row" data-item="${item.id}">
        <span class="picker-info"><b>${item.name}</b><small>${item.rarity} · ${statLine}</small></span>
      </button>`;
    })
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "picker-overlay";
  overlay.innerHTML = `
    <div class="picker-box">
      <h3>${SLOT_LABEL[slot]}</h3>
      <div class="picker-list">
        ${rows || `<p class="inv-hint">No unequipped ${SLOT_LABEL[slot].toLowerCase()}s. Find or craft some!</p>`}
        ${equipped ? `<button class="picker-row picker-clear" data-clear="1">Unequip ${equipped.name}</button>` : ""}
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll<HTMLButtonElement>(".picker-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.clear && equipped) unequipItem(gameState, equipped.id);
      else if (btn.dataset.item) equipItem(gameState, defId, btn.dataset.item);
      overlay.remove();
      renderCard();
      renderUnequippedGear();
    });
  });
  document.body.appendChild(overlay);
}

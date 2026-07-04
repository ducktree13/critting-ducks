// Items menu (Phase R5a): a modal overlay listing ALL owned equipment
// (equipped + unequipped), materials, and ore stockpiles. Copy-patterned
// from inventoryMenu.ts (same overlay/open/close/render-on-open approach).
// This is now the only place gear is managed outside the duck-card
// equip-slot picker; inventoryMenu.ts's unequipped-gear list and materials
// line were removed to avoid duplicating this menu.

import { GEAR, MATERIAL_NAMES, ORE_VALUES } from "../game/balance";
import { getDuckDef } from "../game/ducks";
import { on } from "../game/events";
import { equipItem, sellEquipment } from "../game/gear";
import type { EquipSlot, EquipmentItem, GameState, MaterialId, OreId, Rarity } from "../game/types";
import { showToast } from "./achievementsPanel";

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: "Weapon", armor: "Armor", charm: "Charm" };
const SLOT_GLYPH: Record<EquipSlot, string> = { weapon: "⚔", armor: "🛡", charm: "🔮" };

const RARITY_RANK: Record<Rarity, number> = {
  divine: 0,
  mythic: 1,
  legendary: 2,
  epic: 3,
  rare: 4,
  uncommon: 5,
  common: 6,
};

const SLOT_RANK: Record<EquipSlot, number> = { weapon: 0, armor: 1, charm: 2 };

const ORE_NAMES: Record<OreId, string> = {
  copper: "Copper",
  silver: "Silver",
  crystal: "Crystal",
  starmetal: "Starmetal",
  voidstone: "Voidstone",
  aurorium: "Aurorium",
};

const MATERIAL_ICON: Record<MaterialId, string> = {
  slimeGoo: "🟢",
  gooseFeather: "🪶",
  golemCrumb: "🧱",
  sharkTooth: "🦈",
  pondlordRelic: "💠",
};

const ORE_ICON: Record<OreId, string> = {
  copper: "🟤",
  silver: "⚪",
  crystal: "🔷",
  starmetal: "⭐",
  voidstone: "🟣",
  aurorium: "🟡",
};

type ItemSortKey = "rarity" | "slot";

let overlay: HTMLElement;
let gameState: GameState;
let sortKey: ItemSortKey = "rarity";
let selectedItemId: string | null = null;

export function initItemsMenu(state: GameState): void {
  gameState = state;
  overlay = document.createElement("div");
  overlay.className = "inventory-overlay items-overlay";
  overlay.innerHTML = `
    <div class="inventory-box">
      <div class="inventory-head">
        <h3>Items</h3>
        <select id="items-sort" aria-label="Sort items">
          <option value="rarity">Rarity</option>
          <option value="slot">Slot</option>
        </select>
        <button class="shop-close" id="items-close">✕</button>
      </div>
      <div class="inventory-body">
        <div class="inventory-grid" id="items-grid"></div>
        <div class="inventory-card" id="items-card"></div>
      </div>
      <div class="items-section">
        <h4>Materials</h4>
        <div class="items-materials" id="items-materials"></div>
      </div>
      <div class="items-section">
        <h4>Ores</h4>
        <div class="items-ores" id="items-ores"></div>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeItemsMenu();
  });
  overlay.querySelector("#items-close")!.addEventListener("click", closeItemsMenu);
  overlay.querySelector<HTMLSelectElement>("#items-sort")!.addEventListener("change", (e) => {
    sortKey = (e.target as HTMLSelectElement).value as ItemSortKey;
    renderGrid();
  });
  document.body.appendChild(overlay);

  // Any gear change (equip/unequip/sell, from this menu or the duck-card
  // equip-slot picker) must refresh this menu's grid/card while it's open.
  on("gear", () => {
    if (overlay.classList.contains("open")) {
      renderGrid();
      renderCard();
    }
  });
}

export function openItemsMenu(): void {
  renderGrid();
  renderCard();
  renderMaterials();
  renderOres();
  overlay.classList.add("open");
}

function closeItemsMenu(): void {
  overlay.classList.remove("open");
}

function wearerName(item: EquipmentItem): string | null {
  if (!item.equippedBy) return null;
  return getDuckDef(item.equippedBy).name;
}

function sortedItems(): EquipmentItem[] {
  const items = [...gameState.equipment];
  items.sort((a, b) => {
    if (sortKey === "rarity") {
      const diff = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
      return diff !== 0 ? diff : SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
    }
    const diff = SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
    return diff !== 0 ? diff : RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
  });
  return items;
}

function renderGrid(): void {
  const grid = overlay.querySelector("#items-grid")!;
  const items = sortedItems();
  if (items.length === 0) {
    grid.innerHTML = `<p class="inv-hint">No gear yet. Battle or craft to find some.</p>`;
    return;
  }
  grid.innerHTML = items
    .map((item) => {
      const worn = wearerName(item);
      return `
        <button class="item-tile rarity-${item.rarity}${item.id === selectedItemId ? " selected" : ""}" data-item="${item.id}">
          <span class="item-glyph">${SLOT_GLYPH[item.slot]}</span>
          <small>${item.name}</small>
          ${worn ? `<span class="item-worn">Worn by ${worn}</span>` : ""}
        </button>`;
    })
    .join("");

  grid.querySelectorAll<HTMLButtonElement>(".item-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedItemId = btn.dataset.item!;
      renderGrid();
      renderCard();
    });
  });
}

function statLine(item: EquipmentItem): string[] {
  const labels: Record<keyof EquipmentItem["stats"], string> = {
    flatAttack: "Attack",
    attackMult: "Attack Mult",
    flatDefense: "Defense",
    hpMult: "HP Mult",
    critChanceBonus: "Crit Chance",
    goldMult: "Gold Mult",
  };
  return (Object.entries(item.stats) as [keyof EquipmentItem["stats"], number | undefined][])
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${labels[k]}: ${v}`);
}

function renderCard(): void {
  const card = overlay.querySelector("#items-card")!;
  const item = selectedItemId ? gameState.equipment.find((e) => e.id === selectedItemId) : null;
  if (!item) {
    card.innerHTML = `<p class="inv-hint">Select an item to see its details.</p>`;
    return;
  }
  const worn = wearerName(item);
  const sellBlockedReason = item.equippedBy ? `Worn by ${worn} — unequip first` : "";

  card.innerHTML = `
    <div class="inv-card-art item-card-art"><span class="item-glyph-lg">${SLOT_GLYPH[item.slot]}</span></div>
    <div class="inv-card-body">
      <div class="inv-card-title"><b>${item.name}</b></div>
      <div class="inv-card-sub">${item.rarity} · ${SLOT_LABEL[item.slot]}</div>
      <div class="inv-card-stats">${statLine(item).join(" · ")}</div>
      <div class="inv-card-roster">${worn ? `Worn by ${worn}` : "Not equipped"}</div>
      <div class="item-card-actions">
        <button class="settings-btn" id="items-equip-btn">Equip</button>
        <button class="settings-btn" id="items-sell-btn" ${item.equippedBy ? "disabled" : ""} title="${sellBlockedReason}">Sell for ${GEAR.sellPrice[item.rarity]}g</button>
      </div>
    </div>
  `;
  card.querySelector("#items-equip-btn")!.addEventListener("click", () => openDuckChooser(item));
  card.querySelector<HTMLButtonElement>("#items-sell-btn")!.addEventListener("click", () => {
    if (sellEquipment(gameState, item.id)) {
      showToast(`Sold ${item.name} for ${GEAR.sellPrice[item.rarity]}g`);
      selectedItemId = null;
      renderGrid();
      renderCard();
    }
  });
}

// Duck chooser: lists every owned duck (gear.ts places no role restriction
// on which duck may wear which slot — weapon/armor/charm bonuses apply to
// mining, defense, and gold/crit stats alike, so miners benefit from armor
// just as fighters do). Ducks already wearing this exact item are disabled.
function openDuckChooser(item: EquipmentItem): void {
  document.querySelector(".picker-overlay")?.remove();

  const rows = gameState.ducks
    .map((d) => {
      const def = getDuckDef(d.defId);
      const alreadyWearing = item.equippedBy === d.defId;
      return `<button class="picker-row" data-duck="${d.defId}" ${alreadyWearing ? "disabled" : ""}>
        <span class="picker-info"><b>${def.name}</b><small>${def.rarity} · ${def.role} · Lv ${d.level}${alreadyWearing ? " · already wearing this" : ""}</small></span>
      </button>`;
    })
    .join("");

  const pickerOverlay = document.createElement("div");
  pickerOverlay.className = "picker-overlay";
  pickerOverlay.innerHTML = `
    <div class="picker-box">
      <h3>Equip ${SLOT_LABEL[item.slot]}</h3>
      <div class="picker-list">
        ${rows || `<p class="inv-hint">No ducks to equip this on yet.</p>`}
      </div>
    </div>
  `;
  pickerOverlay.addEventListener("click", (e) => {
    if (e.target === pickerOverlay) pickerOverlay.remove();
  });
  pickerOverlay.querySelectorAll<HTMLButtonElement>("[data-duck]").forEach((btn) => {
    btn.addEventListener("click", () => {
      equipItem(gameState, btn.dataset.duck!, item.id);
      pickerOverlay.remove();
      renderGrid();
      renderCard();
    });
  });
  document.body.appendChild(pickerOverlay);
}

function renderMaterials(): void {
  const el = overlay.querySelector("#items-materials")!;
  el.innerHTML = (Object.keys(MATERIAL_NAMES) as MaterialId[])
    .map(
      (id) => `
      <div class="items-stock-row">
        <span class="items-stock-icon">${MATERIAL_ICON[id]}</span>
        <span>${MATERIAL_NAMES[id]}</span>
        <b>${gameState.materials[id]}</b>
      </div>`,
    )
    .join("");
}

function renderOres(): void {
  const el = overlay.querySelector("#items-ores")!;
  el.innerHTML = (Object.keys(ORE_VALUES) as OreId[])
    .map(
      (id) => `
      <div class="items-stock-row">
        <span class="items-stock-icon">${ORE_ICON[id]}</span>
        <span>${ORE_NAMES[id]}</span>
        <b>${gameState.ores[id]}</b>
      </div>`,
    )
    .join("");
}

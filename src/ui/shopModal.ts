import { DUCK_MAX_LEVEL } from "../game/balance";
import { DUCK_DEFS, getDuckDef } from "../game/ducks";
import { canUpgrade, openPack, packPrice, upgradeCost, type PackType } from "../game/shop";
import { upgradeDuck } from "../game/shop";
import type { GameState, Rng } from "../game/types";
import { duckSvg } from "./duckArt";
import { fmt } from "./format";

export interface SaveActions {
  onExport(): Promise<boolean>;
  onImport(): void;
  onReset(): void;
}

let overlay: HTMLElement;
let gameState: GameState;
let gameRng: Rng;

export function initShopModal(state: GameState, rng: Rng, actions: SaveActions): void {
  gameState = state;
  gameRng = rng;

  overlay = document.createElement("div");
  overlay.className = "shop-overlay";
  overlay.innerHTML = `
    <div class="shop-box">
      <div class="shop-head">
        <h3>Duck Shop</h3>
        <button class="shop-close" id="shop-close">✕</button>
      </div>
      <div class="shop-packs">
        <button class="pack-btn" id="pack-standard"></button>
        <button class="pack-btn" id="pack-five"></button>
      </div>
      <div class="shop-reveal" id="shop-reveal"></div>
      <div class="shop-collection" id="shop-collection"></div>
      <div class="shop-settings">
        <button class="settings-btn" id="save-export">Export save</button>
        <button class="settings-btn" id="save-import">Import</button>
        <button class="settings-btn danger" id="save-reset">Hard reset</button>
        <span class="settings-note" id="settings-note"></span>
      </div>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeShop();
  });
  overlay.querySelector("#shop-close")!.addEventListener("click", closeShop);
  overlay.querySelector("#pack-standard")!.addEventListener("click", () => buyPack("standard"));
  overlay.querySelector("#pack-five")!.addEventListener("click", () => buyPack("five"));

  const note = overlay.querySelector<HTMLElement>("#settings-note")!;
  overlay.querySelector("#save-export")!.addEventListener("click", () => {
    void actions.onExport().then((ok) => {
      note.textContent = ok ? "Copied to clipboard!" : "Copy failed";
    });
  });
  overlay.querySelector("#save-import")!.addEventListener("click", actions.onImport);
  overlay.querySelector("#save-reset")!.addEventListener("click", actions.onReset);

  document.body.appendChild(overlay);
}

export function openShop(): void {
  renderPackButtons();
  renderCollection();
  overlay.querySelector("#shop-reveal")!.innerHTML = "";
  overlay.classList.add("open");
}

function closeShop(): void {
  overlay.classList.remove("open");
}

function renderPackButtons(): void {
  const now = Date.now();
  const std = packPrice("standard", gameState, now);
  const five = packPrice("five", gameState, now);
  const label = (price: number) =>
    price === 0 ? `<b class="free">FREE</b>` : `${fmt(price)} gold`;
  overlay.querySelector("#pack-standard")!.innerHTML = `Standard Pack<br><small>1 duck · ${label(std)}</small>`;
  overlay.querySelector("#pack-five")!.innerHTML = `Five-Pack<br><small>5 ducks, uncommon+ guaranteed · ${label(five)}</small>`;
}

function buyPack(pack: PackType): void {
  const results = openPack(gameState, gameRng, pack, Date.now());
  const reveal = overlay.querySelector("#shop-reveal")!;
  if (!results) {
    reveal.innerHTML = `<span class="shop-error">Not enough gold.</span>`;
    return;
  }
  reveal.innerHTML = results
    .map(
      (r, i) => `
      <div class="reveal-card rarity-${r.rarity}" style="animation-delay: ${i * 180}ms">
        ${duckSvg(r.defId, 64)}
        <b>${getDuckDef(r.defId).name}</b>
        <small>${r.isNew ? `<span class="new-tag">NEW!</span>` : `+${r.shardsGained} shard${r.shardsGained === 1 ? "" : "s"}`}</small>
      </div>`,
    )
    .join("");
  renderPackButtons();
  renderCollection();
}

function renderCollection(): void {
  const grid = overlay.querySelector("#shop-collection")!;
  grid.innerHTML = DUCK_DEFS.map((def) => {
    const owned = gameState.ducks.find((d) => d.defId === def.id);
    if (!owned) {
      return `
        <div class="duck-card unowned">
          <span class="duck-sil">${duckSvg(def.id, 56)}</span>
          <b>${def.name}</b>
          <small>Not collected</small>
        </div>`;
    }
    const maxed = owned.level >= DUCK_MAX_LEVEL;
    const cost = upgradeCost(owned);
    return `
      <div class="duck-card">
        ${duckSvg(def.id, 56)}
        <b>${def.name}</b>
        <small>Lv ${owned.level}${maxed ? " (max)" : ""} · ${owned.shards} shard${owned.shards === 1 ? "" : "s"}</small>
        ${maxed ? "" : `<button class="upgrade-btn" data-duck="${def.id}" ${canUpgrade(gameState, def.id) ? "" : "disabled"}>Upgrade (${cost})</button>`}
      </div>`;
  }).join("");

  grid.querySelectorAll<HTMLButtonElement>(".upgrade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (upgradeDuck(gameState, btn.dataset.duck!)) renderCollection();
    });
  });
}

import { DUCK_MAX_LEVEL, GACHA } from "../game/balance";
import { DUCK_DEFS, getDuckDef } from "../game/ducks";
import { canUpgrade, openPack, packPrice, packUnlocked, upgradeCost, upgradeDuck } from "../game/packs";
import type { GameState, PackId, Rng } from "../game/types";
import { duckSvg } from "./duckArt";
import { fmt } from "./format";

export interface SaveActions {
  onExport(): Promise<boolean>;
  onImport(): void;
  onReset(): void;
}

const PACK_LABELS: Record<PackId, { name: string; blurb: string }> = {
  standard: { name: "Standard Pack", blurb: "1 duck" },
  five: { name: "Five-Pack", blurb: "5 ducks · uncommon+ guaranteed" },
  pack25: { name: "25-Pack", blurb: "25 ducks · rare+ guaranteed" },
  pack100: { name: "100-Pack", blurb: "100 ducks · epic+ guaranteed" },
};

const PACK_IDS: PackId[] = ["standard", "five", "pack25", "pack100"];

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
        <span class="shop-sp" id="shop-sp"></span>
        <button class="shop-close" id="shop-close">✕</button>
      </div>
      <div class="shop-packs">
        ${PACK_IDS.map((id) => `<button class="pack-btn" id="pack-${id}" data-pack="${id}"></button>`).join("")}
      </div>
      <div class="shop-crit-banner" id="shop-crit-banner"></div>
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
  overlay.querySelectorAll<HTMLButtonElement>(".pack-btn").forEach((btn) => {
    btn.addEventListener("click", () => buyPack(btn.dataset.pack as PackId));
  });

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
  overlay.querySelector("#shop-crit-banner")!.textContent = "";
  overlay.classList.add("open");
}

function closeShop(): void {
  overlay.classList.remove("open");
}

function renderPackButtons(): void {
  const now = Date.now();
  overlay.querySelector("#shop-sp")!.textContent = `Shard Points: ${fmt(gameState.shardPoints)}`;
  for (const id of PACK_IDS) {
    const btn = overlay.querySelector<HTMLButtonElement>(`#pack-${id}`)!;
    const { name, blurb } = PACK_LABELS[id];
    if (!packUnlocked(id, gameState)) {
      btn.disabled = true;
      btn.innerHTML = `${name}<br><small>🔒 Unlocks at level ${GACHA.packs[id].minLevel}</small>`;
      continue;
    }
    btn.disabled = false;
    const credits = gameState.packCredits[id];
    const price = packPrice(id, gameState, now);
    const label =
      credits > 0
        ? `<b class="free">${credits} FREE</b>`
        : price === 0
          ? `<b class="free">FREE</b>`
          : `${fmt(price)} gold`;
    btn.innerHTML = `${name}<br><small>${blurb} · ${label}</small>`;
  }
}

function buyPack(pack: PackId): void {
  const opened = openPack(gameState, gameRng, pack, Date.now());
  const reveal = overlay.querySelector("#shop-reveal")!;
  const banner = overlay.querySelector("#shop-crit-banner")!;
  if (!opened) {
    reveal.innerHTML = `<span class="shop-error">Not enough gold.</span>`;
    banner.textContent = "";
    return;
  }
  banner.textContent =
    opened.bonusPacks > 0
      ? `💥 PACK CRIT! +${opened.bonusPacks} free ${PACK_LABELS[pack].name}${opened.bonusPacks > 1 ? "s" : ""}!`
      : "";
  reveal.innerHTML = opened.results
    .map(
      (r, i) => `
      <div class="reveal-card rarity-${r.rarity}" style="animation-delay: ${Math.min(i * 140, 2000)}ms">
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

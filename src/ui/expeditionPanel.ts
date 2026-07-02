import { EXPEDITIONS } from "../game/balance";
import { expeditionPowerOf, getDuckDef } from "../game/ducks";
import { claimExpedition, expeditionFailChance, isDuckOnExpedition, startExpedition } from "../game/expeditions";
import { getStats } from "../game/state";
import type { ExpeditionDuration, GameState, Rng } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { fmt } from "./format";
import { attachTooltip } from "./tooltip";

const DURATION_ORDER: ExpeditionDuration[] = ["short", "long", "epic"];

let overlay: HTMLElement;
let gameState: GameState;
let gameRng: Rng;
let selectedDuration: ExpeditionDuration = "short";
let selectedDucks: Set<string> = new Set();
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let lastResultHtml: string | null = null;

export function initExpeditionPanel(state: GameState, rng: Rng): void {
  gameState = state;
  gameRng = rng;

  overlay = document.createElement("div");
  overlay.className = "shop-overlay";
  overlay.innerHTML = `
    <div class="shop-box expedition-box">
      <div class="shop-head">
        <h3>Expeditions</h3>
        <button class="shop-close" id="exp-close">✕</button>
      </div>
      <div class="expedition-active" id="exp-active"></div>
      <h4>Launch a journey</h4>
      <div class="expedition-durations" id="exp-durations">
        ${DURATION_ORDER.map(
          (d) => `<button class="settings-btn" data-duration="${d}">${EXPEDITIONS.durations[d].label} (${EXPEDITIONS.durations[d].hours}h)</button>`,
        ).join("")}
      </div>
      <div class="expedition-roster" id="exp-roster"></div>
      <div class="expedition-summary" id="exp-summary"></div>
      <button class="settings-btn" id="exp-launch">Launch</button>
    </div>
  `;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeExpeditions();
  });
  overlay.querySelector("#exp-close")!.addEventListener("click", closeExpeditions);
  overlay.querySelectorAll<HTMLButtonElement>("[data-duration]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDuration = btn.dataset.duration as ExpeditionDuration;
      lastResultHtml = null;
      renderPanel();
    });
  });
  overlay.querySelector("#exp-launch")!.addEventListener("click", () => {
    if (startExpedition(gameState, selectedDuration, [...selectedDucks], Date.now())) {
      selectedDucks = new Set();
      lastResultHtml = null;
      renderPanel();
    }
  });
  document.body.appendChild(overlay);
}

export function openExpeditions(): void {
  selectedDucks = new Set();
  lastResultHtml = null;
  renderPanel();
  overlay.classList.add("open");
  refreshTimer = setInterval(renderPanel, 1000);
}

function closeExpeditions(): void {
  overlay.classList.remove("open");
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ready!";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function renderPanel(): void {
  const now = Date.now();

  const activeEl = overlay.querySelector("#exp-active")!;
  activeEl.innerHTML = gameState.expeditions.length
    ? gameState.expeditions
        .map((exp) => {
          const ready = now >= exp.endsAt;
          const ducksHtml = exp.ducks.map((defId) => duckSvg(defId, 28)).join("");
          return `
            <div class="expedition-row${ready ? " ready" : ""}">
              <span class="expedition-ducks">${ducksHtml}</span>
              <span class="expedition-label">${EXPEDITIONS.durations[exp.duration].label}</span>
              <span class="expedition-countdown">${formatRemaining(exp.endsAt - now)}</span>
              <button class="settings-btn" data-claim="${exp.id}" ${ready ? "" : "disabled"}>Claim</button>
            </div>`;
        })
        .join("")
    : `<p class="expedition-empty">No expeditions underway.</p>`;

  activeEl.querySelectorAll<HTMLButtonElement>("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stats = getStats(gameState);
      const result = claimExpedition(gameState, btn.dataset.claim!, Date.now(), gameRng, stats);
      if (result) {
        lastResultHtml = result.success
          ? `<span class="expedition-result-ok">${result.isCrit ? "💥 Crit! " : ""}+${fmt(result.gold)} gold, +${fmt(result.xp)} xp${result.materials.length ? `, +${result.materials.length} material` : ""}${result.gotPack ? ", +1 pack" : ""}</span>`
          : `<span class="expedition-result-fail">Journey failed — only +${fmt(result.gold)} gold, +${fmt(result.xp)} xp made it back.</span>`;
      }
      renderPanel();
    });
  });

  for (const btn of overlay.querySelectorAll<HTMLButtonElement>("[data-duration]")) {
    btn.classList.toggle("active", btn.dataset.duration === selectedDuration);
  }

  const rosterEl = overlay.querySelector("#exp-roster")!;
  rosterEl.innerHTML = gameState.ducks
    .map((duck) => {
      const busy = isDuckOnExpedition(gameState, duck.defId);
      const selected = selectedDucks.has(duck.defId);
      return `
        <button class="picker-row${busy ? " picker-disabled" : ""}${selected ? " expedition-selected" : ""}" data-duck="${duck.defId}" ${busy ? "disabled" : ""}>
          <span class="picker-art">${duckSvg(duck.defId, 36, duck.ascension ?? 0)}</span>
          <span class="picker-info">
            <b>${selected ? "✓ " : ""}${getDuckDef(duck.defId).name}</b>
            <small>Lv ${duck.level}${busy ? " · away" : ""}</small>
          </span>
        </button>`;
    })
    .join("");

  rosterEl.querySelectorAll<HTMLButtonElement>("[data-duck]").forEach((btn) => {
    const defId = btn.dataset.duck!;
    btn.addEventListener("click", () => {
      if (selectedDucks.has(defId)) {
        selectedDucks.delete(defId);
      } else if (selectedDucks.size < EXPEDITIONS.rosterSize) {
        selectedDucks.add(defId);
      }
      lastResultHtml = null;
      renderPanel();
    });
    const duck = gameState.ducks.find((d) => d.defId === defId);
    if (duck) attachTooltip(btn, () => duckTooltipHtml(gameState, duck));
  });

  const summaryEl = overlay.querySelector("#exp-summary")!;
  if (lastResultHtml) {
    summaryEl.innerHTML = lastResultHtml;
  } else if (selectedDucks.size > 0) {
    const stats = getStats(gameState);
    const ids = [...selectedDucks];
    const power = ids.reduce((sum, id) => {
      const duck = gameState.ducks.find((d) => d.defId === id);
      return sum + (duck ? expeditionPowerOf(gameState, duck) : 0);
    }, 0);
    const hours = EXPEDITIONS.durations[selectedDuration].hours;
    const gold = power * EXPEDITIONS.goldPerPowerPerHour * hours * stats.goldMult;
    const xp = power * EXPEDITIONS.xpPerPowerPerHour * hours * stats.xpMult;
    const failPct = Math.round(expeditionFailChance(gameState, ids) * 100);
    summaryEl.innerHTML = `<small>Est. reward ~${fmt(gold)} gold, ~${fmt(xp)} xp · ${failPct}% fail chance</small>`;
  } else {
    summaryEl.innerHTML = `<small>Pick up to ${EXPEDITIONS.rosterSize} ducks to send.</small>`;
  }

  const launchBtn = overlay.querySelector<HTMLButtonElement>("#exp-launch")!;
  launchBtn.disabled = selectedDucks.size === 0;
}

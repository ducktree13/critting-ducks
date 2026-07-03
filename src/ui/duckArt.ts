import { attackDamageOf, defenseOf, getDuckDef, hpOf, miningPowerOf } from "../game/ducks";
import { TRAITS } from "../game/traits";
import type { GameState, OwnedDuck, Rarity } from "../game/types";

interface DuckLook {
  body: string;
  beak: string;
  accessory?: "scythe" | "helmet" | "sparkle";
}

const LOOKS: Record<string, DuckLook> = {
  bill: { body: "#f5c542", beak: "#f5892e" },
  pebbles: { body: "#b8a88a", beak: "#e0813a" },
  quackers: { body: "#8fce5a", beak: "#e8a13c" },
  waddles: { body: "#7a9e7e", beak: "#d98e32" },
  goldie: { body: "#ffd75e", beak: "#f08c28" },
  drake: { body: "#4e8c5f", beak: "#e8b13c" },
  puddle: { body: "#6fb7d9", beak: "#ef9040" },
  sirquack: { body: "#d9d9e8", beak: "#e8963c", accessory: "helmet" },
  nugget: { body: "#e8b04a", beak: "#d97e2e" },
  drillbert: { body: "#a06adf", beak: "#f0a03c" },
  thunder: { body: "#5a5adf", beak: "#f0c03c" },
  goose: { body: "#ffd700", beak: "#ff9a1f", accessory: "sparkle" },
  deathbill: { body: "#3a3a44", beak: "#c04040", accessory: "scythe" },
};

// Deterministic body/beak palette for the ~147 generated ducks that have no
// hand-authored LOOKS entry, so they don't all render as copies of Bill.
const BODY_PALETTE = [
  "#f5c542", "#8fce5a", "#6fb7d9", "#e8b04a", "#c98fd9", "#7ecfc0",
  "#d97e7e", "#a8b84a", "#5aa8d9", "#e0a03c", "#9a7ad9", "#4ec9a0",
];
const BEAK_PALETTE = ["#f5892e", "#e8a13c", "#ef9040", "#d97e2e", "#f0a03c", "#c04040"];

function hashString(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function proceduralLook(defId: string): DuckLook {
  const h = hashString(defId);
  return {
    body: BODY_PALETTE[h % BODY_PALETTE.length],
    beak: BEAK_PALETTE[(h >> 8) % BEAK_PALETTE.length],
  };
}

const STAR_X = [30, 60, 90];

// ---- Rarity shape signatures (design/STYLE.md §4) ----
// Hue is never the only cue: each tier gets a distinct ring construction
// built programmatically (not 7 duplicated SVG strings). Ring colors come
// from the --rarity-* CSS custom properties, which resolve fine inline on
// SVG `fill`/`stroke` attributes. Glows are CSS `filter: drop-shadow(...)`
// classes (see components.css) applied to the wrapping element, not SVG
// filters, so they stay cheap and reduced-motion-safe.

// One reveal-only pass: adds a stroke-dasharray "draw-on" class name so the
// shop's pack-reveal cards can animate the ring appearing (see components.css
// `.duck-reveal-ring`). Normal renders skip it.
function ringDrawOnAttrs(reveal: boolean): string {
  return reveal ? ` class="duck-reveal-ring"` : "";
}

// Builds the <g> of ring/signature markup for a tier, centered on (60,60)
// with the portrait circle at r=56. Returns { markup, glowClass }.
function raritySignature(rarity: Rarity, reveal: boolean): { markup: string; glowClass: string } {
  const c = `var(--rarity-${rarity})`;
  const drawOn = ringDrawOnAttrs(reveal);
  const popClass = reveal ? " duck-reveal-pop" : "";

  switch (rarity) {
    case "common":
      return {
        markup: `<circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="3"${drawOn}/>`,
        glowClass: "",
      };
    case "uncommon":
      return {
        markup: `
          <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="3"${drawOn}/>
          <path d="M60 2 q9 8 0 16 q-9 -8 0 -16 z" fill="${c}" class="rarity-sig-leaf${popClass}"/>`,
        glowClass: "",
      };
    case "rare":
      return {
        markup: `
          <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="3"${drawOn}/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="${c}" stroke-width="2"${drawOn}/>`,
        glowClass: "",
      };
    case "epic": {
      const studAngles = [0, 90, 180, 270];
      const studs = studAngles
        .map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x = 60 + 56 * Math.sin(rad);
          const y = 60 - 56 * Math.cos(rad);
          return `<rect x="${x - 3.2}" y="${y - 3.2}" width="6.4" height="6.4" fill="${c}" transform="rotate(45 ${x} ${y})" class="rarity-sig-stud${popClass}"/>`;
        })
        .join("");
      return {
        markup: `
          <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="4"${drawOn}/>
          ${studs}`,
        glowClass: "rarity-sig-epic",
      };
    }
    case "legendary":
      return {
        markup: `
          <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="5"${drawOn}/>
          <path d="M46 8 l4 10 l10 -8 l-2 12 h16 l-2 -12 l10 8 l4 -10 l-2 20 h-36 z" fill="${c}" class="rarity-sig-crown${popClass}"/>`,
        glowClass: "rarity-sig-legendary",
      };
    case "mythic": {
      const scallops = Array.from({ length: 10 }, (_, i) => {
        const deg = i * 36;
        const rad = (deg * Math.PI) / 180;
        const x = 60 + 56 * Math.sin(rad);
        const y = 60 - 56 * Math.cos(rad);
        return `<path d="M${x} ${y - 6} q6 4 0 12 q-6 -4 0 -12 z" fill="${c}" transform="rotate(${deg} ${x} ${y})"/>`;
      }).join("");
      return {
        markup: `
          <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="5"${drawOn}/>
          <g class="rarity-sig-flames${popClass}">${scallops}</g>`,
        glowClass: "rarity-sig-mythic",
      };
    }
    case "divine": {
      const rays = Array.from({ length: 8 }, (_, i) => {
        const deg = i * 45;
        return `<polygon points="60,60 57,4 63,4" fill="${c}" opacity="0.55" transform="rotate(${deg} 60 60)"/>`;
      }).join("");
      return {
        markup: `
          <g class="rarity-sig-rays${popClass}">${rays}</g>
          <circle cx="60" cy="60" r="56" fill="none" stroke="${c}" stroke-width="4"${drawOn}/>`,
        glowClass: "rarity-sig-divine",
      };
    }
  }
}

export interface DuckSvgOptions {
  ascension?: number;
  /** Render the rarity ring/signature (inventory, cards, pickers). Scene
   * roster slots (mine/arena/pond) pass ringed: false — ducks standing in
   * scenes carry no ring (design/STYLE.md §4). Defaults to true. */
  ringed?: boolean;
  /** Adds the one-shot pack-reveal draw-on/pop-in animation classes. */
  reveal?: boolean;
}

// One parametric duck: body ellipse, wing arc, head circle, beak triangle,
// eye dot, optional rarity ring + shape signature, optional accessory,
// ascension star pips.
export function duckSvg(defId: string, size: number, ascensionOrOpts: number | DuckSvgOptions = 0): string {
  const opts: DuckSvgOptions = typeof ascensionOrOpts === "number" ? { ascension: ascensionOrOpts } : ascensionOrOpts;
  const ascension = opts.ascension ?? 0;
  const ringed = opts.ringed ?? true;
  const reveal = opts.reveal ?? false;

  const def = getDuckDef(defId);
  const look = LOOKS[defId] ?? proceduralLook(defId);

  const accessory =
    look.accessory === "scythe"
      ? `<line x1="30" y1="18" x2="30" y2="62" stroke="#7a5a3a" stroke-width="3"/>
         <path d="M30 18 q18 2 22 14 q-14 -6 -22 -4 z" fill="#c8ccd4"/>`
      : look.accessory === "helmet"
        ? `<path d="M70 32 a15 12 0 0 1 30 0 l-3 4 h-24 z" fill="#8a8f9a"/>
           <line x1="85" y1="20" x2="85" y2="28" stroke="#c33" stroke-width="3"/>`
        : look.accessory === "sparkle"
          ? `<g fill="#fff8d0"><circle cx="30" cy="28" r="2.4"/><circle cx="98" cy="70" r="2"/><circle cx="44" cy="16" r="1.6"/></g>`
          : "";

  const stars = Array.from({ length: Math.max(0, Math.min(ascension, 3)) }, (_, i) =>
    `<text x="${STAR_X[i]}" y="14" font-size="16" text-anchor="middle" fill="#f5c518" stroke="#a87c00" stroke-width="0.5">★</text>`,
  ).join("");

  const sig = ringed ? raritySignature(def.rarity, reveal) : null;
  const wrapperClass = ["duck-svg-wrap", sig?.glowClass, def.rarity === "divine" && ringed ? "duck-svg-divine-spin" : ""]
    .filter(Boolean)
    .join(" ");

  const svg = `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${def.name}">
    ${sig ? sig.markup : ""}
    <ellipse cx="56" cy="76" rx="30" ry="21" fill="${look.body}"/>
    <path d="M45 73 q13 -5 24 2 q-9 11 -24 5 z" fill="rgba(0,0,0,0.15)"/>
    <circle cx="80" cy="48" r="14" fill="${look.body}"/>
    <polygon points="92,45 106,50 92,55" fill="${look.beak}"/>
    <circle cx="84" cy="44" r="2.4" fill="#1a1a1a"/>
    ${accessory}
    ${stars}
  </svg>`;

  return wrapperClass ? `<span class="${wrapperClass}">${svg}</span>` : svg;
}

// Small crest badge markup for legendary+ card frames (inventory duck card,
// pack reveal card). Reuses the same crown/flame/ray language as the ring
// signature at a much smaller scale. Returns "" below legendary.
export function rarityCrestBadge(rarity: Rarity): string {
  if (rarity !== "legendary" && rarity !== "mythic" && rarity !== "divine") return "";
  const c = `var(--rarity-${rarity})`;
  return `<span class="rarity-crest rarity-crest-${rarity}" aria-hidden="true">
    <svg viewBox="0 0 24 16" width="22" height="15">
      <path d="M3 14 L1 3 L7 8 L12 1 L17 8 L23 3 L21 14 Z" fill="${c}"/>
    </svg>
  </span>`;
}

const ROLE_LABEL: Record<string, string> = {
  miner: "Miner",
  fighter: "Fighter",
  hybrid: "Hybrid",
};

// Shared tooltip body for every place a duck is rendered: name, rarity,
// role, level, and its current effective stats.
export function duckTooltipHtml(state: GameState, duck: OwnedDuck): string {
  const def = getDuckDef(duck.defId);
  const trait = TRAITS[def.trait];
  const parts = [`<b>${def.name}</b> <span class="tt-rarity rarity-${def.rarity}">${def.rarity}</span>`];
  const ascensionTag = duck.ascension ? ` · ${"★".repeat(duck.ascension)}` : "";
  parts.push(`<div class="tt-meta">${ROLE_LABEL[def.role]} · Level ${duck.level} · ${trait.name}${ascensionTag}</div>`);
  const stats: string[] = [];
  if (def.role !== "fighter") stats.push(`Mining ${miningPowerOf(duck).toFixed(2)}`);
  if (def.role !== "miner") {
    stats.push(`Attack ${attackDamageOf(state, duck).toFixed(2)}`);
    stats.push(`HP ${hpOf(state, duck).toFixed(0)}`);
    stats.push(`Defense ${defenseOf(state, duck).toFixed(1)}`);
  }
  if (def.critChanceBonus) stats.push(`Crit +${Math.round(def.critChanceBonus * 100)}%`);
  if (def.critDamageBonus) stats.push(`Crit dmg +${def.critDamageBonus.toFixed(2)}x`);
  parts.push(`<div class="tt-stats">${stats.join(" · ")}</div>`);
  parts.push(`<div class="tt-meta">${trait.desc}</div>`);
  if (def.passive) parts.push(`<div class="tt-passive">Passive: ${def.passive}</div>`);
  return parts.join("");
}

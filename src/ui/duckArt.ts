import { getDuckDef } from "../game/ducks";
import type { Rarity } from "../game/types";

const RARITY_RING: Record<Rarity, string> = {
  common: "#9e9e9e",
  uncommon: "#4caf50",
  rare: "#2196f3",
  epic: "#9c27b0",
  legendary: "#f5c518",
};

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

// One parametric duck: body ellipse, wing arc, head circle, beak triangle,
// eye dot, rarity ring, optional accessory.
export function duckSvg(defId: string, size: number): string {
  const def = getDuckDef(defId);
  const look = LOOKS[defId] ?? LOOKS.bill;
  const ring = RARITY_RING[def.rarity];

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

  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${def.name}">
    <circle cx="60" cy="60" r="56" fill="none" stroke="${ring}" stroke-width="4"/>
    <ellipse cx="56" cy="76" rx="30" ry="21" fill="${look.body}"/>
    <path d="M45 73 q13 -5 24 2 q-9 11 -24 5 z" fill="rgba(0,0,0,0.15)"/>
    <circle cx="80" cy="48" r="14" fill="${look.body}"/>
    <polygon points="92,45 106,50 92,55" fill="${look.beak}"/>
    <circle cx="84" cy="44" r="2.4" fill="#1a1a1a"/>
    ${accessory}
  </svg>`;
}

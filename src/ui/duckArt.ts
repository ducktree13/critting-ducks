import { attackDamageOf, defenseOf, getDuckDef, hpOf, miningPowerOf } from "../game/ducks";
import { mulberry32 } from "../game/rng";
import { TRAITS } from "../game/traits";
import type { GameState, OwnedDuck, Rarity } from "../game/types";

// ============================================================================
// The "Duckling" parametric rig (design/STYLE.md §5).
//
// Every duck is one parametric SVG build in a 100×100 authoring space, facing
// left. Canonical geometry (head circle r14.5 @ 36,24; body+tail single path;
// legs/feet/wing/bill/eye) is lifted verbatim from `Style Guide.dc.html` §08.
// Rig params (body scale, overall scale, head ratio, palette, accessories,
// blush, hair curl) derive DETERMINISTICALLY from the defId via a string-hash
// -seeded mulberry32, so a given duck looks identical across sessions/machines.
// Hand-curated ducks override the derived params to echo their personalities.
//
// The rig is drawn into a <g> that is translated+scaled to sit inside the
// 120×120 portrait space the rarity signature ring expects (circle r56 @
// 60,60). Because the group is scaled by RIG_SCALE, the duck ink — always
// #5b4636 "2px" in screen terms — is authored at 2 / RIG_SCALE in rig space.
// ============================================================================

const DUCK_INK = "#5b4636"; // the one sanctioned raw hex in duck art; never themes

// The 100×100 rig is centered into the 120×120 portrait box and scaled down a
// touch so it sits comfortably inside the r56 ring.
const RIG_SCALE = 0.9;
const RIG_TX = 60 - 50 * RIG_SCALE; // center the 100-wide rig horizontally
const RIG_TY = 60 - 50 * RIG_SCALE; // and vertically
// Ink widths, pre-divided by the group scale so they render as intended px.
const W2 = (2 / RIG_SCALE).toFixed(3); // main outline "2px"
const W16 = (1.6 / RIG_SCALE).toFixed(3); // secondary outline "1.6px"
const W14 = (1.4 / RIG_SCALE).toFixed(3); // fine outline "1.4px"

// ---- Species palettes (watercolor spirit: muted, warm) ----
interface Palette {
  body: string;
  wing: string; // wing teardrop fill (a shade of body)
  bill: string;
  billLower: string;
  head?: string; // mallard-style contrasting head; defaults to body
  neckRing?: boolean; // mallard neck-ring ellipse
}

const PALETTES: Record<string, Palette> = {
  pekin: { body: "#f4ecd9", wing: "#e7dcc2", bill: "#e3a23c", billLower: "#d18a2e" },
  golden: { body: "#eaa63c", wing: "#f0b558", bill: "#e0813c", billLower: "#c9752e" },
  mallard: { body: "#cfc0a4", wing: "#c1b092", bill: "#d9a83c", billLower: "#c2932e", head: "#5f8a52", neckRing: true },
  slate: { body: "#c9c0ae", wing: "#b8ae99", bill: "#b08a5a", billLower: "#9a774a" },
  robin: { body: "#8fb8b0", wing: "#7ca8a0", bill: "#e0904a", billLower: "#cc7c38" },
  rust: { body: "#d69a6a", wing: "#c58854", bill: "#c96f3a", billLower: "#b25c2c" },
  sage: { body: "#a8b892", wing: "#95a67e", bill: "#d0a24a", billLower: "#ba8c38" },
  plum: { body: "#b79ab5", wing: "#a688a4", bill: "#d68a5a", billLower: "#bf7448" },
  sky: { body: "#a2c2d6", wing: "#8fb2c8", bill: "#e0954a", billLower: "#cc8038" },
  wheat: { body: "#e6cf95", wing: "#d8bf82", bill: "#d0913a", billLower: "#ba7d2c" },
  clay: { body: "#c88a6e", wing: "#b77a5e", bill: "#b46840", billLower: "#9e5632" },
  ink: { body: "#6b6470", wing: "#5b545f", bill: "#8a7a5a", billLower: "#746548" },
  dark: { body: "#3a3a44", wing: "#2e2e38", bill: "#c04040", billLower: "#a03232" },
};
const PALETTE_KEYS = Object.keys(PALETTES);

type Accessory = "crown" | "mustache" | "monocle" | "scythe" | "helmet" | "sparkle";

interface RigParams {
  palette: Palette;
  bodyScaleX: number;
  bodyScaleY: number;
  overallScale: number;
  headRatio: number;
  accessories: Accessory[];
  blush: boolean;
  hairCurl: boolean;
  aura: boolean; // dashed aura ellipse (legendary+)
}

// ---- Hand-curated overrides (echo existing personalities/colors) ----
interface CuratedLook {
  palette: keyof typeof PALETTES;
  bodyScaleX?: number;
  bodyScaleY?: number;
  overallScale?: number;
  headRatio?: number;
  accessories?: Accessory[];
  blush?: boolean;
  hairCurl?: boolean;
}

const CURATED: Record<string, CuratedLook> = {
  bill: { palette: "golden", hairCurl: false, blush: true }, // the golden everyduck
  pebbles: { palette: "slate", bodyScaleX: 1.12, bodyScaleY: 0.94 }, // chubby pebble
  quackers: { palette: "sage", overallScale: 1.06, hairCurl: true }, // sprightly green
  waddles: { palette: "wheat", bodyScaleX: 1.15, bodyScaleY: 0.9 }, // wide waddler
  goldie: { palette: "golden", blush: true, hairCurl: true }, // lucky, cheery
  drake: { palette: "mallard" }, // mallard drake
  puddle: { palette: "sky", blush: true }, // watery blue
  sirquack: { palette: "slate", accessories: ["helmet"], overallScale: 1.05 }, // knight
  nugget: { palette: "wheat", bodyScaleX: 1.1, blush: true }, // golden nugget
  drillbert: { palette: "plum", overallScale: 1.04 }, // purple driller
  thunder: { palette: "ink", overallScale: 1.1, hairCurl: true }, // stormy
  goose: { palette: "golden", accessories: ["crown", "sparkle"], overallScale: 1.14, hairCurl: true }, // golden goose royalty
  deathbill: { palette: "dark", accessories: ["scythe", "monocle"], overallScale: 1.12 }, // grim reaper duck
  duckTree: { palette: "sage", accessories: ["crown", "sparkle"], overallScale: 1.16, hairCurl: true, blush: true }, // leafy divine
};

function hashString(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Derive rig params deterministically from defId + rarity, honoring curated
// overrides and the rarity complexity budget.
function rigParamsFor(defId: string, rarity: Rarity): RigParams {
  const rng = mulberry32(hashString(defId));
  const r = () => rng.next();
  const curated = CURATED[defId];

  const paletteKey = curated?.palette ?? PALETTE_KEYS[Math.floor(r() * PALETTE_KEYS.length)];
  const palette = PALETTES[paletteKey];

  const rarityOrder: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "divine"];
  const tier = rarityOrder.indexOf(rarity);

  // Body silhouette variance (chubby↔slim), overall size (tiny↔tall).
  const bodyScaleX = curated?.bodyScaleX ?? 0.9 + r() * 0.3; // 0.90–1.20
  const bodyScaleY = curated?.bodyScaleY ?? 0.92 + r() * 0.22; // 0.92–1.14
  const overallScale = curated?.overallScale ?? 0.9 + r() * 0.22; // 0.90–1.12
  const headRatio = curated?.headRatio ?? 0.92 + r() * 0.18; // 0.92–1.10

  // Complexity budget by rarity.
  const isCommon = tier === 0;
  const blush = curated?.blush ?? (isCommon ? false : r() < 0.55);
  const hairCurl = curated?.hairCurl ?? (isCommon ? r() < 0.3 : r() < 0.6);

  // Accessories: epic+ adds one; legendary+ stacks. Curated wins outright.
  let accessories: Accessory[] = curated?.accessories ? [...curated.accessories] : [];
  if (!curated?.accessories) {
    const pool: Accessory[] = ["crown", "mustache", "monocle"];
    if (tier >= 3) accessories.push(pool[Math.floor(r() * pool.length)]); // epic: one
    if (tier >= 4) {
      // legendary+: stack a second distinct accessory
      const second = pool[Math.floor(r() * pool.length)];
      if (!accessories.includes(second)) accessories.push(second);
      if (tier >= 5) accessories.push("sparkle"); // mythic+ sparkle
    }
  }

  const aura = tier >= 4; // legendary, mythic, divine get the dashed aura ellipse

  return { palette, bodyScaleX, bodyScaleY, overallScale, headRatio, accessories, blush, hairCurl, aura };
}

// ---- Rig layer builders (100×100 authoring space, facing left) ----

// Legs + webbed feet (dropped on common ducks). Sit behind the body.
function legsAndFeet(p: Palette): string {
  const c = p.bill; // feet share the bill hue
  return (
    `<rect x="41" y="78" width="5" height="13" rx="2.5" fill="${c}" stroke="${DUCK_INK}" stroke-width="${W16}"/>` +
    `<rect x="53" y="78" width="5" height="13" rx="2.5" fill="${c}" stroke="${DUCK_INK}" stroke-width="${W16}"/>` +
    `<path d="M 33 92.5 Q 39.5 86.5 47.5 90.5 L 47.5 93.5 L 33 93.5 Z" fill="${c}" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/>` +
    `<path d="M 45 92.5 Q 51.5 86.5 59.5 90.5 L 59.5 93.5 L 45 93.5 Z" fill="${c}" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/>`
  );
}

// Body+tail single path (canonical). Wing teardrop, head circle, hair curl,
// bill upper/lower wedges, eye + highlight + blush.
function bodyPath(p: Palette): string {
  return `<path d="M 29 34 C 24 43 20 53 20 62 C 20 76 32 86 48 86 C 59 86 68 82.5 73 76 C 80.5 73 87 64.5 88.5 54.5 C 89 51.8 86.6 50.6 85 52.2 C 82 55.2 78.4 57.4 75.4 57.6 C 78.2 50 76.6 42 70.6 36.8 C 63.6 30.8 52 28.8 44 29.6 Z" fill="${p.body}" stroke="${DUCK_INK}" stroke-width="${W2}" stroke-linejoin="round"/>`;
}

function wing(p: Palette): string {
  return `<path d="M 42 49 C 54 44.5 66.5 48.5 69.5 58 C 64.5 67.5 51 70 42.5 64 C 37 60 37 53 42 49 Z" fill="${p.wing}" stroke="${DUCK_INK}" stroke-width="${W16}"/>`;
}

function head(p: Palette, headRatio: number): string {
  const rHead = (14.5 * headRatio).toFixed(2);
  const headFill = p.head ?? p.body;
  let out = "";
  if (p.neckRing) {
    // mallard neck-ring ellipse between head and body
    out += `<ellipse cx="34" cy="35" rx="11" ry="4" fill="#f4ecd9" stroke="${DUCK_INK}" stroke-width="${W14}"/>`;
  }
  out += `<circle cx="36" cy="24" r="${rHead}" fill="${headFill}" stroke="${DUCK_INK}" stroke-width="${W2}"/>`;
  return out;
}

function hairCurlPath(): string {
  return `<path d="M 33 10.5 Q 35.5 5.5 40 7.5" fill="none" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linecap="round"/>`;
}

function bill(p: Palette): string {
  return (
    `<path d="M 26 20.5 C 16 18.5 7 21.5 6 26 C 10 29.5 19 30.5 26 28.5 Z" fill="${p.bill}" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/>` +
    `<path d="M 23.5 29 C 17 32.5 11 32 9 30 C 12 34 20 35 24.5 31.5 Z" fill="${p.billLower}" stroke="${DUCK_INK}" stroke-width="${W14}" stroke-linejoin="round"/>`
  );
}

function eye(blush: boolean): string {
  let out =
    `<circle cx="40" cy="20.5" r="2.7" fill="${DUCK_INK}"/>` +
    `<circle cx="41" cy="19.6" r="0.9" fill="#faf3e3"/>`;
  if (blush) out += `<circle cx="33" cy="28.5" r="2.8" fill="#e8a98a" opacity="0.7"/>`;
  return out;
}

// ---- Accessory builders (100×100 space) ----
function accessoryMarkup(a: Accessory): string {
  switch (a) {
    case "crown":
      return `<polygon points="27,10.5 28.5,3 33,7 36,1 39,7 43.5,3 45,10.5" fill="#d6a336" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/>`;
    case "mustache":
      return `<path d="M 15 30 Q 22 34 27 30 Q 22 37 15 34 Z M 27 30 Q 21 34 15 34" fill="${DUCK_INK}"/><path d="M 14 30 Q 21 33 26 30 M 14 33 Q 21 36 26 32" fill="none" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linecap="round"/>`;
    case "monocle":
      return `<circle cx="40" cy="21" r="6.5" fill="none" stroke="${DUCK_INK}" stroke-width="${W16}"/><line x1="40" y1="27.5" x2="42" y2="40" stroke="${DUCK_INK}" stroke-width="${W14}"/>`;
    case "scythe":
      return `<line x1="80" y1="20" x2="80" y2="82" stroke="#7a5a3a" stroke-width="${(3 / RIG_SCALE).toFixed(2)}" stroke-linecap="round"/><path d="M 80 20 Q 96 22 100 36 Q 90 28 80 28 Z" fill="#c8ccd4" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/>`;
    case "helmet":
      return `<path d="M 22 15 A 15 13 0 0 1 51 15 L 48 19 H 25 Z" fill="#8a8f9a" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/><line x1="36" y1="4" x2="36" y2="12" stroke="#c33" stroke-width="${(3 / RIG_SCALE).toFixed(2)}"/>`;
    case "sparkle":
      return `<g fill="#fff8d0"><polygon points="70,14 72,19 70,24 68,19"/><polygon points="13,40 14.5,43.5 13,47 11.5,43.5"/><polygon points="88,60 89.5,63.5 88,67 86.5,63.5"/></g>`;
  }
}

// dashed aura ellipse (legendary+), colored by rarity
function auraEllipse(rarity: Rarity): string {
  const c = `var(--rarity-${rarity})`;
  return `<ellipse cx="54" cy="70" rx="17" ry="9" fill="none" stroke="${c}" stroke-width="${W2}" stroke-dasharray="4 5" opacity="0.8"/>`;
}

// Build the full duck rig markup for a 100×100 space.
function buildRig(rarity: Rarity, params: RigParams): string {
  const { palette, bodyScaleX, bodyScaleY, overallScale, headRatio, accessories, blush, hairCurl, aura } = params;
  const isCommon = rarity === "common";

  // Split accessories that sit behind the body (aura) vs in front.
  const layers: string[] = [];

  if (aura) layers.push(auraEllipse(rarity));

  // Legs/feet dropped on commons (design: "common drops layers").
  if (!isCommon) layers.push(legsAndFeet(palette));

  // Body silhouette scaled about its own center (~54,60) for chubby/slim.
  const bodyGroup =
    `<g transform="translate(54 60) scale(${bodyScaleX.toFixed(3)} ${bodyScaleY.toFixed(3)}) translate(-54 -60)">` +
    bodyPath(palette) +
    (isCommon ? "" : wing(palette)) +
    `</g>`;
  layers.push(bodyGroup);

  layers.push(head(palette, headRatio));
  if (hairCurl) layers.push(hairCurlPath());
  layers.push(bill(palette));
  layers.push(eye(blush && !isCommon));

  for (const a of accessories) layers.push(accessoryMarkup(a));

  // Overall scale about the ground point (~50,90) so tall/tiny stay planted.
  return (
    `<g transform="translate(50 90) scale(${overallScale.toFixed(3)}) translate(-50 -90)">` +
    layers.join("") +
    `</g>`
  );
}

const STAR_X = [30, 60, 90];

// ---- Rarity shape signatures (design/STYLE.md §4) ----
// (Unchanged construction — colored via --rarity-* tokens; glows are CSS
// drop-shadow classes on the wrapper. See components.css.)

function ringDrawOnAttrs(reveal: boolean): string {
  return reveal ? ` class="duck-reveal-ring"` : "";
}

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

// One parametric "Duckling" (design/STYLE.md §5): legs, feet, body+tail, wing,
// head, hair curl, bill, eye, accessories — params derived deterministically
// from defId — wrapped in the optional rarity ring + shape signature and
// ascension star pips.
export function duckSvg(defId: string, size: number, ascensionOrOpts: number | DuckSvgOptions = 0): string {
  const opts: DuckSvgOptions = typeof ascensionOrOpts === "number" ? { ascension: ascensionOrOpts } : ascensionOrOpts;
  const ascension = opts.ascension ?? 0;
  const ringed = opts.ringed ?? true;
  const reveal = opts.reveal ?? false;

  const def = getDuckDef(defId);
  const params = rigParamsFor(defId, def.rarity);
  const rig = buildRig(def.rarity, params);

  const stars = Array.from({ length: Math.max(0, Math.min(ascension, 3)) }, (_, i) =>
    `<text x="${STAR_X[i]}" y="14" font-size="16" text-anchor="middle" fill="#f5c518" stroke="#a87c00" stroke-width="0.5">★</text>`,
  ).join("");

  const sig = ringed ? raritySignature(def.rarity, reveal) : null;
  const wrapperClass = ["duck-svg-wrap", sig?.glowClass, def.rarity === "divine" && ringed ? "duck-svg-divine-spin" : ""]
    .filter(Boolean)
    .join(" ");

  const svg = `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${def.name}">
    ${sig ? sig.markup : ""}
    <g transform="translate(${RIG_TX.toFixed(2)} ${RIG_TY.toFixed(2)}) scale(${RIG_SCALE})">${rig}</g>
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

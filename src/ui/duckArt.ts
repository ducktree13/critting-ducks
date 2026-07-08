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

// R5b body-profile variants — the biggest lever for silhouette variety.
type BodyProfile = "round" | "slim" | "longneck";

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
  // ---- R5b silhouette-variance params (drawn AFTER the above so existing
  // ducks' palette/accessory/blush/hairCurl draws are byte-identical) ----
  bodyProfile: BodyProfile;
  tailScale: number; // 0.85–1.35
  tailAngle: number; // -12..+12 deg
  neckExtend: number; // 0.95–1.4 (head lifts/drops along the neck)
  billScale: number; // 0.85–1.2
  postureLean: number; // -6..+6 deg (whole rig about its feet)
  wingScale: number; // 0.9–1.25
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
  // R5b silhouette overrides (optional; fall through to the derived draw).
  bodyProfile?: BodyProfile;
  tailScale?: number;
  tailAngle?: number;
  neckExtend?: number;
  billScale?: number;
  postureLean?: number;
  wingScale?: number;
}

const CURATED: Record<string, CuratedLook> = {
  bill: { palette: "golden", hairCurl: false, blush: true, bodyProfile: "round" }, // the golden everyduck
  pebbles: { palette: "slate", bodyScaleX: 1.12, bodyScaleY: 0.94, bodyProfile: "round", tailScale: 1.2 }, // chubby pebble
  quackers: { palette: "sage", overallScale: 1.06, hairCurl: true, bodyProfile: "slim" }, // sprightly green
  waddles: { palette: "wheat", bodyScaleX: 1.15, bodyScaleY: 0.9, bodyProfile: "round", tailScale: 1.3 }, // wide waddler
  goldie: { palette: "golden", blush: true, hairCurl: true, bodyProfile: "round" }, // lucky, cheery
  drake: { palette: "mallard", bodyProfile: "longneck", neckExtend: 1.15 }, // mallard drake
  puddle: { palette: "sky", blush: true, bodyProfile: "round" }, // watery blue
  sirquack: { palette: "slate", accessories: ["helmet"], overallScale: 1.05, bodyProfile: "round", postureLean: 3 }, // knight
  nugget: { palette: "wheat", bodyScaleX: 1.1, blush: true, bodyProfile: "round" }, // golden nugget
  drillbert: { palette: "plum", overallScale: 1.04, bodyProfile: "slim", billScale: 1.18 }, // purple driller
  thunder: { palette: "ink", overallScale: 1.1, hairCurl: true, bodyProfile: "longneck", postureLean: -4 }, // stormy
  goose: { palette: "golden", accessories: ["crown", "sparkle"], overallScale: 1.14, hairCurl: true, bodyProfile: "longneck", neckExtend: 1.35, tailScale: 1.15 }, // golden goose royalty
  deathbill: { palette: "dark", accessories: ["scythe", "monocle"], overallScale: 1.12, bodyProfile: "slim", postureLean: -5, tailScale: 0.9 }, // grim reaper duck
  duckTree: { palette: "sage", accessories: ["crown", "sparkle"], overallScale: 1.16, hairCurl: true, blush: true, bodyProfile: "longneck", neckExtend: 1.3 }, // leafy divine
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

  // ---- R5b silhouette variance ----
  // Drawn from the SAME rng stream AFTER every existing draw above, so the
  // already-established palette/scales/accessories/blush/hairCurl for every
  // duck stay byte-identical; only these NEW fields consume fresh randomness.
  const bodyProfile: BodyProfile = curated?.bodyProfile ?? BODY_PROFILES[Math.floor(r() * BODY_PROFILES.length)];
  const tailScale = curated?.tailScale ?? 0.85 + r() * 0.5; // 0.85–1.35
  const tailAngle = curated?.tailAngle ?? -12 + r() * 24; // -12..+12
  const neckExtend = curated?.neckExtend ?? 0.95 + r() * 0.45; // 0.95–1.4
  const billScale = curated?.billScale ?? 0.85 + r() * 0.35; // 0.85–1.2
  const postureLean = curated?.postureLean ?? -6 + r() * 12; // -6..+6
  const wingScale = curated?.wingScale ?? 0.9 + r() * 0.35; // 0.9–1.25

  return {
    palette, bodyScaleX, bodyScaleY, overallScale, headRatio, accessories, blush, hairCurl, aura,
    bodyProfile, tailScale, tailAngle, neckExtend, billScale, postureLean, wingScale,
  };
}

const BODY_PROFILES: BodyProfile[] = ["round", "slim", "longneck"];

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

// Body silhouette. R5b splits the canonical fused body+tail path into a body
// sub-path (no tail flick) plus a SEPARATE tail sub-path/group, so the tail can
// be scaled (tailScale) and rotated (tailAngle) about its own hinge point
// independently. Three named profiles vary the core silhouette — the biggest
// lever for "similarly shaped ducks":
//   round    — the canonical plump body (roughly the pre-R5b shape).
//   slim     — a narrower, taller body reading (leaner belly curve).
//   longneck — a smaller, rounder body sitting lower, pairs with neckExtend.
// Tail hinge is ~ (75.4, 57.6) where the flick meets the body.
const TAIL_HINGE = { x: 75.4, y: 57.6 };

const BODY_SUBPATH: Record<BodyProfile, string> = {
  // canonical body minus the tail flick — closes straight across the hinge
  round:
    "M 29 34 C 24 43 20 53 20 62 C 20 76 32 86 48 86 C 59 86 68 82.5 73 76 " +
    "C 80.5 73 84 66 82 60 C 80.4 55.6 78 56.2 75.4 57.6 " +
    "C 78.2 50 76.6 42 70.6 36.8 C 63.6 30.8 52 28.8 44 29.6 Z",
  // slimmer belly, body pulled in on the underside and slightly taller
  slim:
    "M 30 33 C 26 42 23 52 23 61 C 23 75 33 85 47 85 C 57 85 66 81.5 71 75 " +
    "C 78 72 81 65.5 79 60 C 77.6 56 75.4 56.6 73.2 57.8 " +
    "C 76 50 74.6 42.5 69 37.6 C 62.6 31.8 52 30 44.5 30.6 Z",
  // smaller rounder body sitting a touch lower, ready for a long neck up top
  longneck:
    "M 33 40 C 27 47 24 55 24 63 C 24 76 34 85 48 85 C 58 85 67 81.5 72 75 " +
    "C 79 72 82 65.5 80 60 C 78.4 55.8 76 56.4 73.4 57.8 " +
    "C 76 51 74.6 44 69.4 39.6 C 63.6 34.8 53 33.6 46 34.4 Z",
};

// Tail flick sub-path, per profile — a little wedge hinged at TAIL_HINGE.
const TAIL_SUBPATH: Record<BodyProfile, string> = {
  round: "M 75.4 57.6 C 78.4 57.4 82 55.2 85 52.2 C 86.6 50.6 89 51.8 88.5 54.5 C 87 64.5 80.5 73 73 76 C 76 68 76.4 62 75.4 57.6 Z",
  slim: "M 73.2 57.8 C 76.2 57.6 80 55 83.2 51.6 C 84.8 50 87 51.4 86.4 54 C 84.8 63 79 71 71.6 74.4 C 74.4 67 74.4 62 73.2 57.8 Z",
  longneck: "M 73.4 57.8 C 76 57.6 79 55.8 81.6 53.2 C 83 51.8 85 53 84.6 55.2 C 83.2 62.6 78 69.5 72 72.5 C 74.4 66 74.4 61.6 73.4 57.8 Z",
};

function bodyPath(p: Palette, params: RigParams): string {
  const { bodyProfile, tailScale, tailAngle } = params;
  const body = `<path d="${BODY_SUBPATH[bodyProfile]}" fill="${p.body}" stroke="${DUCK_INK}" stroke-width="${W2}" stroke-linejoin="round"/>`;
  const tailInner = `<path d="${TAIL_SUBPATH[bodyProfile]}" fill="${p.body}" stroke="${DUCK_INK}" stroke-width="${W2}" stroke-linejoin="round"/>`;
  const flat = Math.abs(tailAngle) < 0.2 && Math.abs(tailScale - 1) < 0.02;
  const tail = flat
    ? tailInner
    : `<g transform="rotate(${tailAngle.toFixed(1)} ${TAIL_HINGE.x} ${TAIL_HINGE.y}) translate(${TAIL_HINGE.x} ${TAIL_HINGE.y}) scale(${tailScale.toFixed(2)}) translate(${-TAIL_HINGE.x} ${-TAIL_HINGE.y})">${tailInner}</g>`;
  // Tail behind the body so the hinge seam is hidden under the body fill.
  return tail + body;
}

function wing(p: Palette, wingScale: number): string {
  // Wing scaled about its own center (~55,57) so it grows/shrinks in place.
  const inner = `<path d="M 42 49 C 54 44.5 66.5 48.5 69.5 58 C 64.5 67.5 51 70 42.5 64 C 37 60 37 53 42 49 Z" fill="${p.wing}" stroke="${DUCK_INK}" stroke-width="${W16}"/>`;
  if (Math.abs(wingScale - 1) < 0.02) return inner;
  return `<g transform="translate(55 57) scale(${wingScale.toFixed(2)}) translate(-55 -57)">${inner}</g>`;
}

// The head/bill/eye/hairCurl all sit at fixed authoring coordinates around the
// head circle (36,24). R5b's neckExtend lifts the whole head cluster up along
// the neck: the head anchors at y=24, the body top is ~y=33, so a longer neck
// raises the head (negative dy). We return the vertical offset so callers can
// translate the head + bill + eye + hairCurl + head-borne accessories together.
const HEAD_ANCHOR_Y = 24;
function neckOffsetY(neckExtend: number): number {
  // neckExtend 1.0 => no shift; 1.4 => head raised ~6px; 0.95 => dropped ~0.75px
  return (neckExtend - 1) * -15;
}

// The mallard neck-ring ellipse bridges body→head, so it stays anchored to the
// body (NOT lifted with the head cluster) — returned separately from head().
function neckRing(p: Palette): string {
  if (!p.neckRing) return "";
  return `<ellipse cx="34" cy="35" rx="11" ry="4" fill="#f4ecd9" stroke="${DUCK_INK}" stroke-width="${W14}"/>`;
}

function head(p: Palette, headRatio: number): string {
  const rHead = (14.5 * headRatio).toFixed(2);
  const headFill = p.head ?? p.body;
  return `<circle cx="36" cy="${HEAD_ANCHOR_Y}" r="${rHead}" fill="${headFill}" stroke="${DUCK_INK}" stroke-width="${W2}"/>`;
}

function hairCurlPath(): string {
  return `<path d="M 33 10.5 Q 35.5 5.5 40 7.5" fill="none" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linecap="round"/>`;
}

function bill(p: Palette, billScale: number): string {
  // Bill scaled about its hinge at the face (~26,25) so it extends/retracts
  // from the head rather than drifting off it.
  const inner =
    `<path d="M 26 20.5 C 16 18.5 7 21.5 6 26 C 10 29.5 19 30.5 26 28.5 Z" fill="${p.bill}" stroke="${DUCK_INK}" stroke-width="${W16}" stroke-linejoin="round"/>` +
    `<path d="M 23.5 29 C 17 32.5 11 32 9 30 C 12 34 20 35 24.5 31.5 Z" fill="${p.billLower}" stroke="${DUCK_INK}" stroke-width="${W14}" stroke-linejoin="round"/>`;
  if (Math.abs(billScale - 1) < 0.02) return inner;
  return `<g transform="translate(26 25) scale(${billScale.toFixed(2)}) translate(-26 -25)">${inner}</g>`;
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

// Accessories that ride the head cluster (lift with neckExtend) vs. those
// pinned in world space (scythe leans against the ground; sparkles scatter).
const HEAD_BORNE_ACCESSORY: Record<Accessory, boolean> = {
  crown: true, mustache: true, monocle: true, helmet: true, scythe: false, sparkle: false,
};

// Build the full duck rig markup for a 100×100 space.
function buildRig(rarity: Rarity, params: RigParams): string {
  const {
    palette, bodyScaleX, bodyScaleY, overallScale, headRatio, accessories, blush, hairCurl, aura,
    neckExtend, billScale, postureLean, wingScale,
  } = params;
  const isCommon = rarity === "common";

  // Split accessories that sit behind the body (aura) vs in front.
  const layers: string[] = [];

  if (aura) layers.push(auraEllipse(rarity));

  // Legs/feet dropped on commons (design: "common drops layers").
  if (!isCommon) layers.push(legsAndFeet(palette));

  // Body silhouette scaled about its own center (~54,60) for chubby/slim.
  const bodyGroup =
    `<g transform="translate(54 60) scale(${bodyScaleX.toFixed(3)} ${bodyScaleY.toFixed(3)}) translate(-54 -60)">` +
    bodyPath(palette, params) +
    (isCommon ? "" : wing(palette, wingScale)) +
    `</g>`;
  layers.push(bodyGroup);

  // Neck ring stays anchored to the body (bridges body→head).
  layers.push(neckRing(palette));

  // Head cluster (head, hair curl, bill, eye, head-borne accessories) lifts as
  // one group by the neckExtend offset so a "longneck" reads as a raised head
  // on a longer neck rather than a floating circle.
  const dy = neckOffsetY(neckExtend);
  const headCluster: string[] = [head(palette, headRatio)];
  if (hairCurl) headCluster.push(hairCurlPath());
  headCluster.push(bill(palette, billScale));
  headCluster.push(eye(blush && !isCommon));
  for (const a of accessories) if (HEAD_BORNE_ACCESSORY[a]) headCluster.push(accessoryMarkup(a));
  layers.push(
    Math.abs(dy) < 0.01
      ? headCluster.join("")
      : `<g transform="translate(0 ${dy.toFixed(2)})">${headCluster.join("")}</g>`,
  );

  // World-pinned accessories (scythe, sparkle) render un-lifted.
  for (const a of accessories) if (!HEAD_BORNE_ACCESSORY[a]) layers.push(accessoryMarkup(a));

  // Overall scale + posture lean about the ground point (~50,90) so tall/tiny
  // stay planted and the lean pivots at the feet.
  const leanTx =
    Math.abs(postureLean) < 0.05
      ? `translate(50 90) scale(${overallScale.toFixed(3)}) translate(-50 -90)`
      : `translate(50 90) rotate(${postureLean.toFixed(1)}) scale(${overallScale.toFixed(3)}) translate(-50 -90)`;
  return `<g transform="${leanTx}">${layers.join("")}</g>`;
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

// Portraits are a pure function of (defId, size, ascension, ringed) — the rig
// params are hash-derived from defId, so re-parsing the same combination on
// every roster rebuild / picker open is wasted work. `reveal` drives a
// one-shot pack-reveal animation and is intentionally excluded from both the
// key and the cache (those calls always render fresh, uncached). The
// 300-entry FIFO cap is still comfortable: the working set is a small roster
// × a few sizes, so churn stays well under the cap.
const DUCK_SVG_CACHE_LIMIT = 300;
const duckSvgCache = new Map<string, string>();

function duckSvgUncached(
  defId: string,
  size: number,
  ascension: number,
  ringed: boolean,
  reveal: boolean,
): string {
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

// One parametric "Duckling" (design/STYLE.md §5): legs, feet, body+tail, wing,
// head, hair curl, bill, eye, accessories — params derived deterministically
// from defId — wrapped in the optional rarity ring + shape signature and
// ascension star pips.
export function duckSvg(defId: string, size: number, ascensionOrOpts: number | DuckSvgOptions = 0): string {
  const opts: DuckSvgOptions = typeof ascensionOrOpts === "number" ? { ascension: ascensionOrOpts } : ascensionOrOpts;
  const ascension = opts.ascension ?? 0;
  const ringed = opts.ringed ?? true;
  const reveal = opts.reveal ?? false;

  if (reveal) return duckSvgUncached(defId, size, ascension, ringed, reveal);

  const key = `${defId}|${size}|${ascension}|${ringed}`;
  const cached = duckSvgCache.get(key);
  if (cached !== undefined) return cached;

  const svg = duckSvgUncached(defId, size, ascension, ringed, reveal);
  if (duckSvgCache.size >= DUCK_SVG_CACHE_LIMIT) {
    // Simple FIFO eviction: drop the oldest entry (Map preserves insertion
    // order) rather than any LRU bookkeeping — good enough for a bounded art
    // cache that's dominated by a small, frequently-reused roster.
    const oldestKey = duckSvgCache.keys().next().value;
    if (oldestKey !== undefined) duckSvgCache.delete(oldestKey);
  }
  duckSvgCache.set(key, svg);
  return svg;
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
  pond: "Pond",
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
  if (def.pondAura) {
    const auraLabel = def.pondAura.kind === "combat" ? "Attack & Defense" : "Gold & XP";
    parts.push(`<div class="tt-passive">Pond aura: +${Math.round(def.pondAura.power * 100)}% ${auraLabel} (global, while in pond)</div>`);
  }
  return parts.join("");
}

import { describe, expect, it } from "vitest";
import { DUCK_DEFS } from "../game/ducks";
import type { EquipmentItem } from "../game/types";
import { duckSvg } from "./duckArt";

// duckArt.ts is a pure SVG string builder; rig params (including the R5b
// silhouette-variance params — bodyProfile/tail/neck/bill/posture/wing) are
// hash-derived from defId, so a given duck's markup must be byte-stable across
// calls, while different ducks must produce visibly different silhouettes.

const sample = DUCK_DEFS.slice(0, 12).map((d) => d.id);

describe("duckArt R5b silhouette variance", () => {
  it("is deterministic per defId (same markup across calls)", () => {
    for (const id of sample) {
      expect(duckSvg(id, 64, { ringed: false })).toBe(duckSvg(id, 64, { ringed: false }));
    }
  });

  it("produces distinct silhouettes across the sample", () => {
    const svgs = new Set(sample.map((id) => duckSvg(id, 64, { ringed: false })));
    // With bodyProfile + tail/neck/bill/posture/wing variance, a 12-duck sample
    // must not collapse to a couple of shapes.
    expect(svgs.size).toBeGreaterThanOrEqual(sample.length - 1);
  });

  it("draws one of the three named body profiles for every duck", () => {
    // Body sub-path signatures unique to each profile's first coordinates.
    const PROFILE_SIGS = ["M 29 34", "M 30 33", "M 33 40"];
    for (const def of DUCK_DEFS) {
      const svg = duckSvg(def.id, 64, { ringed: false });
      expect(PROFILE_SIGS.some((sig) => svg.includes(sig))).toBe(true);
    }
  });

  it("keeps every duck's rig markup reasonable in size (ringless)", () => {
    // The bare rig (no rarity-signature ring) is the R5b-relevant budget. The
    // pre-R5b rig already ran up to ~2.6KB ringless (the "<2KB" target was
    // approximate — 38/161 ducks were already over 2KB). R5b splits body+tail
    // into two paths and adds tail/wing/head-cluster groups, pushing the max to
    // ~3.1KB. Cap at a comfortable ceiling so a runaway regression is caught
    // while allowing the intentional split-path growth.
    for (const def of DUCK_DEFS) {
      const svg = duckSvg(def.id, 64, { ringed: false });
      expect(svg.length).toBeLessThan(3300);
    }
  });
});

function makeItem(partial: Partial<EquipmentItem>): EquipmentItem {
  return {
    id: partial.id ?? "eqX",
    kindId: partial.kindId ?? "Cutlass",
    slot: partial.slot ?? "weapon",
    rarity: partial.rarity ?? "rare",
    name: partial.name ?? "Fine Cutlass",
    stats: partial.stats ?? {},
    equippedBy: partial.equippedBy ?? null,
  };
}

describe("duckArt R5b equipped gear", () => {
  const id = DUCK_DEFS[0].id;

  it("renders gear on top and changes the markup vs. bare", () => {
    const bare = duckSvg(id, 64, { ringed: false });
    const armed = duckSvg(id, 64, {
      ringed: false,
      equipment: { weapon: makeItem({ id: "eq1", kindId: "Sword", rarity: "epic" }) },
    });
    expect(armed).not.toBe(bare);
    expect(armed).toContain("var(--rarity-epic)");
  });

  it("cache key folds in equipment (swap → different, remove → back to bare)", () => {
    const bare = duckSvg(id, 64, { ringed: false });
    const withA = duckSvg(id, 64, {
      ringed: false,
      equipment: { weapon: makeItem({ id: "eqA", kindId: "Dagger", rarity: "common" }) },
    });
    const withB = duckSvg(id, 64, {
      ringed: false,
      equipment: { weapon: makeItem({ id: "eqB", kindId: "Spear", rarity: "legendary" }) },
    });
    expect(withA).not.toBe(withB); // different kind/rarity → different portrait
    expect(withA).not.toBe(bare);
    // Removing gear returns byte-identical to the never-equipped portrait (no
    // stale ghost from the cache).
    expect(duckSvg(id, 64, { ringed: false })).toBe(bare);
    expect(duckSvg(id, 64, { ringed: false, equipment: {} })).toBe(bare);
  });

  it("varies weapon silhouette by kind heuristic", () => {
    const sword = duckSvg(id, 64, { ringed: false, equipment: { weapon: makeItem({ id: "s", kindId: "Sword" }) } });
    const spear = duckSvg(id, 64, { ringed: false, equipment: { weapon: makeItem({ id: "p", kindId: "Spear" }) } });
    expect(sword).not.toBe(spear);
  });

  it("renders all three slots together", () => {
    const svg = duckSvg(id, 64, {
      ringed: false,
      equipment: {
        weapon: makeItem({ id: "w", slot: "weapon", kindId: "Hammer", rarity: "rare" }),
        armor: makeItem({ id: "a", slot: "armor", kindId: "Breastplate", rarity: "epic" }),
        charm: makeItem({ id: "c", slot: "charm", kindId: "Amulet", rarity: "mythic" }),
      },
    });
    expect(svg).toContain("var(--rarity-rare)");
    expect(svg).toContain("var(--rarity-epic)");
    expect(svg).toContain("var(--rarity-mythic)");
  });
});

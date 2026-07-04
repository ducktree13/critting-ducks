// Shared duck-list sort comparator (Phase R1): used by the inventory grid,
// the roster picker's eligible-duck list, and the shard shop's slot display,
// so "sort by rarity/class/level" behaves identically everywhere.

import { getDuckDef } from "../game/ducks";
import type { Rarity } from "../game/types";

export type SortKey = "favorite" | "rarity" | "role" | "level";

// Minimal shape the comparator needs — satisfied by OwnedDuck, and by
// shard-shop slots adapted to it (level 0, no favorite).
export interface SortableDuck {
  defId: string;
  level: number;
  favorite?: boolean;
}

const RARITY_RANK: Record<Rarity, number> = {
  divine: 0,
  mythic: 1,
  legendary: 2,
  epic: 3,
  rare: 4,
  uncommon: 5,
  common: 6,
};

// Returns a comparator over duck-shaped values for the given sort key.
// "favorite" also breaks ties by rarity; all other keys are used standalone.
export function duckComparator(sortKey: SortKey): (a: SortableDuck, b: SortableDuck) => number {
  return (a, b) => {
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
  };
}

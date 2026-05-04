// Ranked-SR boot item ids. Verified against CommunityDragon's items.json by
// filtering items that either have a "Boots" category or build from item
// 1001 (the basic Boots).
//
// Used to:
//   - filter lolalytics' itemBootSet1 entries (which include items
//     played alongside boots, not just boots)
//   - label the Boots step in the build sequence
//
// Refresh after any patch that introduces a new boot variant; just append
// the new id to this set.

/** @type {Set<number>} */
export const BOOT_IDS = new Set([
  // Tier-1 / classic boots
  3005, // Ghostcrawlers
  3006, // Berserker's Greaves
  3008, // Gluttonous Greaves
  3009, // Boots of Swiftness
  3020, // Sorcerer's Shoes
  3047, // Plated Steelcaps
  3111, // Mercury's Treads
  3117, // Mobility Boots
  3158, // Ionian Boots of Lucidity
  // S15 upgraded variants
  3010, // Symbiotic Soles
  3013, // Synchronized Souls
  3168, // Immortal Path
  3170, // Swiftmarch
  3171, // Crimson Lucidity
  3173, // Chainlaced Crushers
  3174, // Armored Advance
  3175, // Spellslinger's Shoes
  3176, // Forever Forward
]);

export const isBoot = (id) => BOOT_IDS.has(Number(id));

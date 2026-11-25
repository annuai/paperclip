/** Seasonal outfits: which one he wears on a given local date. Pure; the art lives in outfitArt.ts. */
export type OutfitName = 'none' | 'santa-hat' | 'party-hat' | 'heart' | 'pumpkin' | 'shamrock';
export const OUTFIT_NAMES: readonly OutfitName[] = ['none', 'santa-hat', 'party-hat', 'heart', 'pumpkin', 'shamrock'];

/** 'auto' = dress for the date; 'off' = never. */
export type OutfitSetting = 'auto' | 'off';
export const DEFAULT_OUTFIT_SETTING: OutfitSetting = 'auto';

export function normalizeOutfitSetting(v: unknown): OutfitSetting {
  return v === 'off' ? 'off' : DEFAULT_OUTFIT_SETTING;
}

/** Outfit for a local calendar date (month 0-based like Date.getMonth). */
export function outfitFor(d: Date): OutfitName {
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 11 && day <= 26) return 'santa-hat'; // Dec 1-26
  if ((m === 11 && day === 31) || (m === 0 && day === 1)) return 'party-hat'; // Dec 31 - Jan 1
  if (m === 1 && day === 14) return 'heart';
  if (m === 9 && day >= 25) return 'pumpkin'; // Oct 25-31
  if (m === 2 && day === 17) return 'shamrock';
  return 'none';
}

/** What the wearer sees: the setting decides whether the date counts. `preview` (sandbox) overrides both. */
export function currentOutfit(setting: OutfitSetting, now: Date): OutfitName {
  return setting === 'off' ? 'none' : outfitFor(now);
}

export function normalizeOutfit(v: unknown): OutfitName {
  return OUTFIT_NAMES.find((n) => n === v) ?? 'none';
}

/**
 * The tallest outfit reaches this many viewBox units above the top of the wire (y = 20). The Jump headroom test
 * adds it to the clip's height so a hat never gets clipped by the top of the window.
 */
export const OUTFIT_HEIGHT = 56;

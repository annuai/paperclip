import { describe, expect, it } from 'vitest';
import { currentOutfit, normalizeOutfit, normalizeOutfitSetting, outfitFor } from './outfits';

const at = (m: number, d: number) => new Date(2026, m - 1, d, 12, 0);

describe('outfitFor (local date)', () => {
  it('santa hat Dec 1-26', () => {
    expect(outfitFor(at(11, 30))).toBe('none');
    expect(outfitFor(at(12, 1))).toBe('santa-hat');
    expect(outfitFor(at(12, 25))).toBe('santa-hat');
    expect(outfitFor(at(12, 26))).toBe('santa-hat');
    expect(outfitFor(at(12, 27))).toBe('none');
    expect(outfitFor(at(12, 30))).toBe('none');
  });
  it('party hat Dec 31 and Jan 1', () => {
    expect(outfitFor(at(12, 31))).toBe('party-hat');
    expect(outfitFor(at(1, 1))).toBe('party-hat');
    expect(outfitFor(at(1, 2))).toBe('none');
  });
  it('heart on Feb 14 only', () => {
    expect(outfitFor(at(2, 13))).toBe('none');
    expect(outfitFor(at(2, 14))).toBe('heart');
    expect(outfitFor(at(2, 15))).toBe('none');
  });
  it('pumpkin Oct 25-31', () => {
    expect(outfitFor(at(10, 24))).toBe('none');
    expect(outfitFor(at(10, 25))).toBe('pumpkin');
    expect(outfitFor(at(10, 31))).toBe('pumpkin');
    expect(outfitFor(at(11, 1))).toBe('none');
  });
  it('shamrock on Mar 17 only', () => {
    expect(outfitFor(at(3, 16))).toBe('none');
    expect(outfitFor(at(3, 17))).toBe('shamrock');
    expect(outfitFor(at(3, 18))).toBe('none');
  });
  it('uses the local clock, not UTC: 23:59 on Dec 26 is still a santa hat', () => {
    expect(outfitFor(new Date(2026, 11, 26, 23, 59))).toBe('santa-hat');
    expect(outfitFor(new Date(2026, 11, 27, 0, 0))).toBe('none');
  });
  it('an ordinary day is none', () => {
    expect(outfitFor(at(6, 15))).toBe('none');
  });
});

describe('outfit setting', () => {
  it('defaults to auto and only an explicit off turns it off', () => {
    expect(normalizeOutfitSetting(undefined)).toBe('auto');
    expect(normalizeOutfitSetting('nonsense')).toBe('auto');
    expect(normalizeOutfitSetting('off')).toBe('off');
  });
  it('off wins over the date', () => {
    expect(currentOutfit('off', at(12, 25))).toBe('none');
    expect(currentOutfit('auto', at(12, 25))).toBe('santa-hat');
  });
  it('normalizeOutfit rejects unknown names (sandbox query string)', () => {
    expect(normalizeOutfit('heart')).toBe('heart');
    expect(normalizeOutfit('hat')).toBe('none');
    expect(normalizeOutfit(null)).toBe('none');
  });
});

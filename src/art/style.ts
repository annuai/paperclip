export type Style = 'classic' | 'flat';
export const STYLES: readonly Style[] = ['classic', 'flat'];
export const DEFAULT_STYLE: Style = 'flat';

/** Anything that is not a known style falls back to the default (used when reading persisted settings). */
export function normalizeStyle(v: unknown): Style {
  return v === 'flat' || v === 'classic' ? v : DEFAULT_STYLE;
}

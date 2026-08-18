/**
 * Curated accent swatches — not a free-form color picker on purpose.
 * Per docs/DECISIONS.md (2026-08-15, theme picker feature): letting the
 * baker choose ANY hex risks poor contrast against the fixed
 * neutrals/status colors in src/theme/palettes.ts. A small on-brand set
 * keeps every possible combination readable, at the cost of fewer
 * choices.
 *
 * Shared between the Appearance screen (baker picks their app accent)
 * and the product category color logic (a category's color is hashed
 * from this same set — see src/utils/productCategoryIcon.ts) so both
 * features draw from one on-brand palette instead of two that could
 * drift apart. See docs/DECISIONS.md's 2026-08-18 entry.
 */
export const ACCENT_SWATCHES = [
  { name: 'Terracotta', hex: '#C9683F' }, // current default
  { name: 'Berry', hex: '#A6456B' },
  { name: 'Ocean', hex: '#3B6FA0' },
  { name: 'Sage', hex: '#5C7A54' },
  { name: 'Plum', hex: '#7D5A9E' },
  { name: 'Honey', hex: '#C08A2E' },
] as const;
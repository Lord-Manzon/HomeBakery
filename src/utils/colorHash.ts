import { ACCENT_SWATCHES } from '../theme/accentSwatches';

/**
 * Deterministic color for any string, hashed into one of the app's 6
 * curated accent swatches (src/theme/accentSwatches.ts) -- the same
 * string always resolves to the same color, nothing persisted.
 *
 * Originally lived in src/utils/productCategoryIcon.ts as
 * `getCategoryColor`. Pulled out here so it reads as the general-purpose
 * utility it actually is -- product categories and customer-name
 * avatars both call this same function now.
 */
export function hashStringToColor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  const swatch = ACCENT_SWATCHES[hash % ACCENT_SWATCHES.length];
  return swatch.hex;
}
import { ACCENT_SWATCHES } from '../theme/accentSwatches';
import type { ProductCategory } from '../types/product';

/**
 * Shown when a product's category text has no matching row in
 * product_categories — e.g. a category typed before this feature
 * existed, or whose category row was later deleted. Keeps old
 * free-typed values from rendering as blank/broken.
 */
export const DEFAULT_PRODUCT_CATEGORY_ICON = 'pricetag-outline';

/**
 * Deterministic color for a category name, hashed into one of the
 * app's 6 curated accent swatches (src/theme/accentSwatches.ts) — the
 * same name always resolves to the same color without persisting
 * anything extra on product_categories. See docs/DECISIONS.md's
 * 2026-08-18 entry.
 */
export function getCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const swatch = ACCENT_SWATCHES[hash % ACCENT_SWATCHES.length];
  return swatch.hex;
}

/**
 * Looks up a category's icon + derived color by name (case-insensitive
 * match against product_categories). Falls back to a neutral default
 * icon if no matching row exists, so nothing breaks for pre-existing
 * free-typed category values.
 */
export function getCategoryVisual(
  name: string | null | undefined,
  categories: ProductCategory[]
): { icon: string; color: string } {
  if (!name) {
    return { icon: DEFAULT_PRODUCT_CATEGORY_ICON, color: getCategoryColor('') };
  }
  const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return {
    icon: match?.icon ?? DEFAULT_PRODUCT_CATEGORY_ICON,
    color: getCategoryColor(name),
  };
}
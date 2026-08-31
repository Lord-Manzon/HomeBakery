import type { ProductCategory } from '../types/product';
import { hashStringToColor } from './colorHash';

/**
 * Shown when a product's category text has no matching row in
 * product_categories — e.g. a category typed before this feature
 * existed, or whose category row was later deleted. Keeps old
 * free-typed values from rendering as blank/broken.
 */
export const DEFAULT_PRODUCT_CATEGORY_ICON = 'pricetag-outline';

/**
 * Deterministic color for a category name — see src/utils/colorHash.ts.
 * Thin wrapper kept so existing callers (getCategoryVisual, etc.) don't
 * need to change.
 */
export function getCategoryColor(name: string): string {
  return hashStringToColor(name);
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
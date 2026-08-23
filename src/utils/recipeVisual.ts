import { getCategoryColor } from './productCategoryIcon';

/**
 * Recipes have no category field (docs/DATABASE.md) — a batch of dough
 * isn't a "kind" the way a product or ingredient is, so there's nothing
 * to key an icon off. An earlier version of this hashed a food-themed
 * icon (pizza, wine glass, etc.) per recipe name, but that's worse than
 * no icon: the hash is blind to meaning, so a recipe could land on an
 * icon that flatly doesn't describe it (a "Cinnamon" recipe showing a
 * wine glass). An initials badge — same idea as a contact avatar — gives
 * the same per-card visual variety without claiming to describe what the
 * recipe actually is. The color hash is reused as-is from the
 * product-category color logic (productCategoryIcon.ts, see
 * docs/DECISIONS.md's 2026-08-18 entry) — same name always renders the
 * same look, nothing extra persisted.
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getRecipeVisual(name: string): { initials: string; color: string } {
  return {
    initials: getInitials(name),
    color: getCategoryColor(name),
  };
}
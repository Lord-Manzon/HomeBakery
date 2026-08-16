import type { Ingredient } from '../types/ingredient';
import type { Baker } from '../types/baker';

export type GaugeSensitivity = Baker['gauge_sensitivity'];

/**
 * How many multiples of low_stock_threshold count as "full" on the gauge.
 * Deliberately curated (3 presets), not a free-form number — same
 * reasoning as the accent-color picker in docs/DECISIONS.md: a handful of
 * safe, understood options beats an arbitrary value nobody can reason
 * about. See docs/DECISIONS.md for why ×3 is the default.
 */
export const GAUGE_SENSITIVITY_MULTIPLIERS: Record<GaugeSensitivity, number> = {
  tight: 2,
  balanced: 3,
  relaxed: 4,
};

export type GaugeStatus = 'ok' | 'low' | 'out' | 'none';

/**
 * True "no gauge" state for ingredients with no low_stock_threshold set —
 * there's no meaningful "full" line to compare against, so callers should
 * show a neutral hint ("Set a low-stock alert to track this") instead of
 * fabricating a bar. Never returns a percentage in this case.
 */
export function getStockGaugePercent(
  currentStock: number,
  lowStockThreshold: number | null,
  sensitivity: GaugeSensitivity
): number | null {
  if (lowStockThreshold == null || lowStockThreshold <= 0) return null;
  const ceiling = lowStockThreshold * GAUGE_SENSITIVITY_MULTIPLIERS[sensitivity];
  if (ceiling <= 0) return null;
  const pct = (currentStock / ceiling) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Status drives gauge color + the existing low-stock badge. Kept
 * consistent with the existing isLowStock() in types/ingredient.ts
 * (current_stock <= low_stock_threshold counts as low) rather than
 * introducing a second, slightly different threshold rule.
 */
export function getStockGaugeStatus(
  currentStock: number,
  lowStockThreshold: number | null
): GaugeStatus {
  if (lowStockThreshold == null) return 'none';
  if (currentStock <= 0) return 'out';
  if (currentStock <= lowStockThreshold) return 'low';
  return 'ok';
}

export function getIngredientGauge(ingredient: Ingredient, sensitivity: GaugeSensitivity) {
  return {
    percent: getStockGaugePercent(
      ingredient.current_stock,
      ingredient.low_stock_threshold,
      sensitivity
    ),
    status: getStockGaugeStatus(ingredient.current_stock, ingredient.low_stock_threshold),
  };
}

/**
 * How much to add to bring stock exactly to the gauge's "full" ceiling
 * (low_stock_threshold * sensitivity multiplier). Powers the "Top off"
 * quick-add chip in RestockSheet — reuses the exact same ceiling math as
 * getStockGaugePercent so the chip and the gauge can never disagree.
 * Returns null when there's no threshold set (nothing to top off to).
 */
export function getTopOffAmount(
  currentStock: number,
  lowStockThreshold: number | null,
  sensitivity: GaugeSensitivity
): number | null {
  if (lowStockThreshold == null || lowStockThreshold <= 0) return null;
  const ceiling = lowStockThreshold * GAUGE_SENSITIVITY_MULTIPLIERS[sensitivity];
  return Math.max(0, Math.round((ceiling - currentStock) * 100) / 100);
}

/**
 * Sort key for "low stock first": ingredients with no threshold set (no
 * gauge) sort last, since there's no alert configured to make them
 * urgent — not first, and not mixed in ambiguously with actually-low
 * items.
 */
export function gaugeSortValue(ingredient: Ingredient, sensitivity: GaugeSensitivity): number {
  const pct = getStockGaugePercent(
    ingredient.current_stock,
    ingredient.low_stock_threshold,
    sensitivity
  );
  return pct === null ? 101 : pct;
}

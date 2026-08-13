/**
 * Spacing scale (4px base unit). Use these instead of magic numbers in
 * component styles.
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;

export type SpacingToken = keyof typeof spacing;

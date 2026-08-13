/**
 * Color tokens. Components should import from here instead of using
 * hardcoded hex values (see docs/CODING_STANDARDS.md).
 *
 * Palette is a deliberate starting point, not final visual design — warm,
 * calm, low-saturation, avoids the generic "AI dashboard" purple/blue.
 */
export const colors = {
  // Brand / primary
  primary: '#B5651D', // warm terracotta — bakery, not tech-startup blue
  primaryMuted: '#E8D4C0',

  // Surfaces
  background: '#FDFBF8',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F0EA',

  // Text
  textPrimary: '#2B2420',
  textSecondary: '#6B6058',
  textInverse: '#FFFFFF',

  // Borders
  border: '#E5DDD3',

  // Status / semantic
  success: '#3F7D4F',
  successMuted: '#E1EFE3',
  warning: '#C08A2E',
  warningMuted: '#F6EAD3',
  danger: '#B54235',
  dangerMuted: '#F5DEDA',
  info: '#3B6FA0',
  infoMuted: '#DCE8F2',

  // Order status colors (matches docs/PRODUCT.md status flow)
  statusPending: '#C08A2E',
  statusConfirmed: '#3B6FA0',
  statusPreparing: '#8A5FB0',
  statusReady: '#3F7D4F',
  statusCompleted: '#6B6058',
  statusCancelled: '#B54235',
} as const;

export type ColorToken = keyof typeof colors;

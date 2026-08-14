/**
 * Color tokens. Components should import from here instead of using
 * hardcoded hex values (see docs/CODING_STANDARDS.md).
 *
 * Values match the approved design system in docs/UI_UX.md section F.
 * Replaces the Phase 1 placeholder palette (see docs/DECISIONS.md,
 * 2026-08-15 entry — theme token migration).
 */
export const colors = {
  // Brand / primary
  primary: '#C9683F', // primary buttons, active nav icon, FAB, links
  primaryPressed: '#B85A34', // button pressed state

  // Surfaces
  background: '#FBF7F1', // warm off-white, not pure white
  surface: '#FFFFFF', // cards, sheets
  surfaceMuted: '#F5F0EA',

  // Text
  textPrimary: '#2E2A26', // warm charcoal, not pure black
  textSecondary: '#8A8378', // supporting text, timestamps
  textInverse: '#FFFFFF',

  // Borders
  border: '#E8E0D5', // hairlines, card borders

  // Status / semantic — per docs/UI_UX.md section F
  success: '#5C8A54', // paid, delivered, in stock
  successMuted: '#E3ECE1', // ~12% tint on background, for chip fills
  warning: '#D99A33', // pending, unpaid
  warningMuted: '#F8EDDC',
  danger: '#C6533F', // low stock, overdue, delete
  dangerMuted: '#F7E7E3',

  // Order status colors (matches docs/PRODUCT.md status flow: Pending →
  // Confirmed → Preparing → Ready → Completed, or Cancelled)
  // NOTE: docs/UI_UX.md section F only defines 3 semantic colors
  // (success/warning/danger) plus primary. Confirmed/Preparing don't have
  // an approved color of their own yet — mapped to primary/textSecondary
  // as a reasonable default below, but this is a judgment call, not a
  // spec'd decision. Flag for a real design pass if the 5-state chip set
  // ends up looking muddy in practice.
  statusPending: '#D99A33', // = warning
  statusConfirmed: '#C9683F', // = primary (placeholder mapping, see note above)
  statusPreparing: '#8A5FB0', // no token in spec — carried from Phase 1 placeholder, unreviewed
  statusReady: '#5C8A54', // = success
  statusCompleted: '#8A8378', // = textSecondary
  statusCancelled: '#C6533F', // = danger
} as const;

export type ColorToken = keyof typeof colors;

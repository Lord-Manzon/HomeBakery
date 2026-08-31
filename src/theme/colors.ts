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
  primaryMuted: '#F3E1D6', // tonal accent — chip/button fills where a filled primary would be too heavy (e.g. repeated per-row actions)

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

  // Order status colors (matches docs/PRODUCT.md's status flow: Pending
  // -> Delivered -> Completed, or Cancelled -- see docs/DECISIONS.md's
  // 2026-08-22 entry, which dropped Confirmed/Preparing and renamed Ready
  // to Delivered). Every value below maps directly to one of section F's
  // 4 approved semantic colors -- unlike the old 6-value mapping, nothing
  // here is an unreviewed placeholder.
  statusPending: '#D99A33', // = warning -- matches "Unpaid/Pending = warning" in section F's Components list
  statusDelivered: '#5C8A54', // = success -- matches "Paid/Delivered = success" in section F's Components list
  statusCompleted: '#8A8378', // = textSecondary -- fully done, no longer needs attention, so it fades rather than staying vivid
  statusCancelled: '#C6533F', // = danger
} as const;

export type ColorToken = keyof typeof colors;

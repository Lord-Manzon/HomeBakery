/**
 * Builds a full color-token set (same shape as the original static
 * src/theme/colors.ts) from a single accent color + a light/dark mode.
 *
 * Scope, per the 2026-08-15 decision: the baker can only choose the
 * ACCENT color. Neutrals (background/surface/text/border) and semantic
 * colors (success/warning/danger) stay fixed per mode — this keeps every
 * generated palette readable and on-brand, rather than letting an accent
 * choice accidentally break contrast or status-color meaning.
 */
import type { ColorToken } from './colors';

export type ThemeMode = 'light' | 'dark';

const LIGHT_NEUTRALS = {
  background: '#FBF7F1',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F0EA',
  textPrimary: '#2E2A26',
  textSecondary: '#8A8378',
  textInverse: '#FFFFFF',
  border: '#E8E0D5',
} as const;

const DARK_NEUTRALS = {
  background: '#1C1815',
  surface: '#26211D',
  surfaceMuted: '#2F2925',
  textPrimary: '#F3EDE5',
  textSecondary: '#A69C90',
  textInverse: '#1C1815',
  border: '#3A332C',
} as const;

// Semantic colors are fixed per mode — not affected by accent choice.
const LIGHT_SEMANTIC = {
  success: '#5C8A54',
  successMuted: '#E3ECE1',
  warning: '#D99A33',
  warningMuted: '#F8EDDC',
  danger: '#C6533F',
  dangerMuted: '#F7E7E3',
} as const;

const DARK_SEMANTIC = {
  success: '#7BA672',
  successMuted: '#2A3327',
  warning: '#E3AD52',
  warningMuted: '#332A1A',
  danger: '#D97362',
  dangerMuted: '#332220',
} as const;

/** Darkens a hex color by a rough percentage, for the "pressed" state. */
function darken(hex: string, amount = 0.12): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
  const b = Math.max(0, (num & 0xff) * (1 - amount));
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

export function buildPalette(
  accent: string,
  mode: ThemeMode
): Record<ColorToken, string> {
  const neutrals = mode === 'light' ? LIGHT_NEUTRALS : DARK_NEUTRALS;
  const semantic = mode === 'light' ? LIGHT_SEMANTIC : DARK_SEMANTIC;

  return {
    primary: accent,
    primaryPressed: darken(accent),
    ...neutrals,
    ...semantic,
    // Order status colors — see colors.ts's comment: every value now
    // maps directly to an existing semantic/neutral token, per
    // docs/DECISIONS.md's 2026-08-22 entry (Confirmed/Preparing dropped,
    // Ready renamed to Delivered).
    statusPending: semantic.warning,
    statusDelivered: semantic.success,
    statusCompleted: neutrals.textSecondary,
    statusCancelled: semantic.danger,
  };
}

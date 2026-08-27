import { Platform } from 'react-native';

/**
 * Type scale. Key names are unchanged from Phase 1 on purpose — 11 files
 * already reference displayLg/displaySm/titleLg/titleSm/body/bodySm/caption
 * (auth screens, nav, shared components). Renaming them to match
 * docs/UI_UX.md section F's simpler 5-name scale would be a real breaking
 * change, not a token-values update — that's a separate, deliberate
 * refactor if we ever want it, not something to do silently here.
 *
 * What DID change: font sizes/weights nudged toward the proportions in
 * section F's scale (screen title 20/600, section header 15/600, body
 * 14/400, caption 12/400, metric 22/600) as closely as possible while
 * keeping every existing key valid and preserving the size hierarchy
 * (titleLg > titleSm) that existing components rely on visually.
 */
const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const typography = {
  fontFamily,
  // Full-page headers (auth screens). Kept a step above section F's
  // "screen title" since these read as bigger hero-style headers.
  displayLg: { fontSize: 26, lineHeight: 32, fontWeight: '600' as const },
  // Matches section F "Screen title" (20/600) almost exactly — used by
  // log-in/sign-up/onboarding page titles today.
  displaySm: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  // A notch above titleSm, for section/card headers that need to stand
  // out slightly more (e.g. more.tsx's profile title, error screens).
  titleLg: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  // Matches section F "Section header" (15/600) exactly.
  titleSm: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  // Matches section F "Body" (14/400).
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  // Matches section F "Secondary/caption" (12/400).
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  // Matches section F "Metric numbers" (22/600) -- documented in
  // UI_UX_1.md's design system table but never actually implemented as a
  // token until the 2026-08-26 Orders card price bump needed it.
  metric: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
} as const;

export type TypographyToken = keyof typeof typography;

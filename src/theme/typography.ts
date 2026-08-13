import { Platform } from 'react-native';

/**
 * Type scale. System fonts on purpose for now — no custom font loading
 * dependency until there's a real design reason to add one.
 */
const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const typography = {
  fontFamily,
  displayLg: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  displaySm: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  titleLg: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  titleSm: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

export type TypographyToken = keyof typeof typography;

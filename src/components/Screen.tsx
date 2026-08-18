import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeContext';
import { spacing } from '../theme';

type ScreenProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Root container for every tab-stack screen. Applies the top safe-area
 * inset so content doesn't render under the status bar (headers are
 * disabled app-wide, so nothing does this for us automatically — see
 * docs/DECISIONS.md). Bottom inset is intentionally NOT applied here;
 * the tab bar already reserves that space for screens that sit under it.
 *
 * MERGE NOTE (2026-08-18): main's version of this file kept a static
 * `colors` import and `spacing.md` top padding; this resolution takes
 * product-screen's theme-reactive version (`useThemeColors()`) and
 * `spacing.xl` padding instead, since it's the newer version and matches
 * the project's own theme-migration direction. Flagged for a conscious
 * look on-device once merged — this changes top padding on every screen
 * in the app (12px -> 24px), not just Ingredients/Products.
 */
export function Screen({ children, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.background, paddingTop: insets.top + spacing.xl },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});

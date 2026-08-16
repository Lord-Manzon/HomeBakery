import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

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
 */
export function Screen({ children, style }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.base, { paddingTop: insets.top + spacing.md }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
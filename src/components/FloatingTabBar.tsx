import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography, motionDuration, motionEasing } from '../theme';
import { useScrollNav } from '../contexts/ScrollNavContext';
import type { ColorToken } from '../theme/colors';

type IconName = keyof typeof Ionicons.glyphMap;

// Derived from expo-router's own <Tabs> component rather than importing
// @react-navigation/bottom-tabs directly — per docs/ARCHITECTURE.md:
// "Since SDK 56, Expo Router owns navigation imports directly (no
// importing @react-navigation/* packages directly in app code)."
type TabBarRenderer = ComponentProps<typeof Tabs>['tabBar'];
type FloatingTabBarProps = NonNullable<TabBarRenderer> extends (props: infer P) => unknown
  ? P
  : never;

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home-outline' },
  orders: { label: 'Orders', icon: 'receipt-outline' },
  production: { label: 'Production', icon: 'flame-outline' },
  more: { label: 'More', icon: 'menu-outline' },
};

type QuickAddItem = {
  label: string;
  icon: IconName;
  /** Route to push. Omit (leave undefined) for actions with no built
   * destination yet — see docs/DECISIONS.md 2026-08-19; those render
   * disabled rather than being hidden, so the menu's shape stays
   * consistent across tabs even before every phase is built. */
  pathname?: string;
  params?: Record<string, string>;
};

// Per-tab Quick Add contents — see docs/UI_UX_1.md section G and
// docs/DECISIONS.md's 2026-08-19 entry for the reasoning behind each
// tab's specific list and ordering (top item = most likely action).
const QUICK_ADD: Record<string, QuickAddItem[]> = {
  index: [
    { label: 'Add order', icon: 'receipt-outline' }, // Phase 7, not built yet
    {
      label: 'Add ingredient',
      icon: 'nutrition-outline',
      pathname: '/more/ingredients',
      params: { openAdd: '1' },
    },
    { label: 'Add product', icon: 'cube-outline', pathname: '/more/products/new' },
    { label: 'Add expense', icon: 'wallet-outline' }, // Phase 9, not built yet
  ],
  orders: [{ label: 'Add order', icon: 'receipt-outline' }], // Phase 7, not built yet
  production: [
    { label: 'Add order', icon: 'receipt-outline' }, // Phase 7, not built yet
    { label: 'Restock ingredient', icon: 'refresh-outline', pathname: '/more/ingredients' },
    { label: 'Add expense', icon: 'wallet-outline' }, // Phase 9, not built yet
  ],
  more: [
    { label: 'Add product', icon: 'cube-outline', pathname: '/more/products/new' },
    {
      label: 'Add ingredient',
      icon: 'nutrition-outline',
      pathname: '/more/ingredients',
      params: { openAdd: '1' },
    },
    { label: 'Add recipe', icon: 'book-outline', pathname: '/more/recipes/new' },
    { label: 'Add expense', icon: 'wallet-outline' }, // Phase 9, not built yet
  ],
};

/**
 * Replaces Expo Router <Tabs>'s default fixed bar (via the `tabBar` prop)
 * with a floating pill nav + a separate floating + button, both hiding
 * together on scroll-down and reappearing on scroll-up (see
 * docs/DECISIONS.md's 2026-08-19 entry, docs/UI_UX_1.md section G).
 * Tapping + opens a small popup card, anchored bottom-right above the
 * FAB, listing that tab's contextual Quick Add actions.
 */
export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { navHidden, forceHiddenCount } = useScrollNav();
  const [isCardOpen, setIsCardOpen] = useState(false);

  const activeRouteName = state.routes[state.index]?.name ?? 'index';
  const items = QUICK_ADD[activeRouteName] ?? [];

  const navAnimatedStyle = useAnimatedStyle(() => {
    const hidden = navHidden.value > 0 || forceHiddenCount.value > 0 ? 1 : 0;
    return {
      transform: [{ translateY: withTiming(hidden * 90, { duration: motionDuration.medium, easing: motionEasing.standard }) }],
      opacity: withTiming(hidden ? 0 : 1, { duration: motionDuration.medium, easing: motionEasing.standard }),
    };
  });

  function handleQuickAddPress(item: QuickAddItem) {
    setIsCardOpen(false);
    if (!item.pathname) return; // no-op for actions with no built destination yet
    // `as never`: QUICK_ADD's pathnames are assembled dynamically per tab
    // (not string literals Expo Router's typed-routes codegen can see at
    // this call site), so the cast is a deliberate, narrow escape hatch —
    // not a general `any`. Every pathname above is a real, existing route.
    router.push({ pathname: item.pathname, params: item.params } as never);
  }

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
      {isCardOpen ? (
        <Animated.View
          entering={FadeIn.duration(motionDuration.fast)}
          exiting={FadeOut.duration(motionDuration.fast)}
          style={styles.card}
        >
          <Text style={styles.cardLabel}>Quick add</Text>
          {items.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => handleQuickAddPress(item)}
              style={({ pressed }) => [styles.cardRow, pressed && item.pathname && styles.cardRowPressed]}
              disabled={!item.pathname}
              accessibilityLabel={item.pathname ? item.label : `${item.label}, coming soon`}
            >
              <View style={[styles.cardIcon, !item.pathname && styles.cardIconDisabled]}>
                <Ionicons name={item.icon} size={15} color={item.pathname ? colors.primary : colors.textSecondary} />
              </View>
              <Text
                style={[
                  styles.cardRowLabel,
                  i === 0 && item.pathname && styles.cardRowLabelPrimary,
                  !item.pathname && styles.cardRowLabelDisabled,
                ]}
              >
                {item.label}
              </Text>
              {!item.pathname ? <Text style={styles.cardRowSoon}>Soon</Text> : null}
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.row, navAnimatedStyle]}>
        <View style={styles.pill}>
          {state.routes
            .filter((route) => TAB_META[route.name])
            .map((route) => {
              const routeIndex = state.routes.findIndex((r) => r.key === route.key);
              const isFocused = state.index === routeIndex;
              const meta = TAB_META[route.name];
              return (
                <Pressable
                  key={route.key}
                  onPress={() => {
                    setIsCardOpen(false);
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name);
                    }
                  }}
                  style={styles.tabButton}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isFocused }}
                  accessibilityLabel={meta.label}
                >
                  <Ionicons name={meta.icon} size={20} color={isFocused ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tabLabel, { color: isFocused ? colors.primary : colors.textSecondary }]}>
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
        </View>

        <Pressable
          onPress={() => setIsCardOpen((open) => !open)}
          style={styles.fab}
          accessibilityLabel={isCardOpen ? 'Close quick add' : 'Quick add'}
        >
          <Ionicons name={isCardOpen ? 'close' : 'add'} size={24} color={colors.textInverse} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center', // center the pill+FAB group as a whole, independent of the card's right-anchor below
      gap: spacing.sm,
    },
    pill: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xs,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    tabButton: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm + 2,
      minWidth: 44,
      minHeight: 44,
    },
    tabLabel: {
      ...typography.caption,
      fontSize: 10,
    },
    fab: {
      width: 48,
      height: 48,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
    },
    card: {
      width: 200,
      alignSelf: 'flex-end', // right-anchored above the FAB regardless of the nav row's centering
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.xs,
      marginBottom: spacing.sm,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
    },
    cardLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxs,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      minHeight: 44,
    },
    cardRowPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    cardIcon: {
      width: 26,
      height: 26,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardIconDisabled: {
      backgroundColor: colors.surfaceMuted,
    },
    cardRowLabel: {
      ...typography.bodySm,
      color: colors.textPrimary,
      flex: 1,
    },
    cardRowLabelPrimary: {
      fontWeight: '600',
    },
    cardRowLabelDisabled: {
      color: colors.textSecondary,
    },
    cardRowSoon: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
}
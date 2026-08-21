import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  withTiming,
  runOnJS,
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

type MoreSection = { label: string; pathname: string };

// Sub-destinations shown in the expanded "More" nav strip. Order matters —
// this is also the swipe/tap-cycle order. Recipes lives under More too but
// is reached from the More index screen for now, not this strip — keeps the
// dot count matched to the 3 sections the person is actively iterating on
// (Ingredients, Products, Appearance). Add it here later if it should join
// the cycle.
const MORE_SECTIONS: MoreSection[] = [
  { label: 'Ingredients', pathname: '/more/ingredients' },
  { label: 'Products', pathname: '/more/products' },
  { label: 'Appearance', pathname: '/more/appearance' },
];

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
  const pathname = usePathname();
  const { navHidden, forceHiddenCount } = useScrollNav();
  const [isCardOpen, setIsCardOpen] = useState(false);

  // Expanded state = the sub-nav strip (icon + swipeable section label)
  // replacing the 4 tabs. Starts collapsed; opens only when More is tapped,
  // and re-collapses on tapping the icon or navigating to a non-More tab.
  const [isMoreExpanded, setIsMoreExpanded] = useState(false);

  // Which of MORE_SECTIONS is current, derived from the actual route so the
  // strip shows the right label even if the person deep-links or comes back
  // via Android back rather than the strip itself.
  const activeSectionIndex = useMemo(() => {
    const found = MORE_SECTIONS.findIndex((s) => pathname.startsWith(s.pathname));
    return found === -1 ? 0 : found;
  }, [pathname]);
  const [sectionIndex, setSectionIndex] = useState(activeSectionIndex);

  // Real width of the 4-tab row, captured via onLayout below. Used to size
  // the expanded strip so it's the exact same width as the collapsed
  // state — not a guessed constant, since label width (e.g. "Production")
  // varies with the device's font rendering and isn't safe to hardcode.
  const [tabRowWidth, setTabRowWidth] = useState<number | null>(null);

  const activeRouteName = state.routes[state.index]?.name ?? 'index';
  const items = QUICK_ADD[activeRouteName] ?? [];

  function goToSection(nextIndex: number) {
    const clamped = (nextIndex + MORE_SECTIONS.length) % MORE_SECTIONS.length;
    setSectionIndex(clamped);
    // replace, not push: swiping/tapping between sections is a lateral swap
    // (like switching tabs), not drilling deeper. push() here was the bug —
    // every swipe added a new stack entry instead of swapping the current
    // one, so the back button replayed the whole swipe history and the
    // screens piled up in memory instead of being released.
    router.replace(MORE_SECTIONS[clamped].pathname as never);
  }

  function handleMorePress() {
    setIsCardOpen(false);
    if (!isMoreExpanded) {
      setSectionIndex(activeSectionIndex);
      setIsMoreExpanded(true);
      // push only here: this is the one legitimate "enter a new stack"
      // moment — coming from Home/Orders/Production into More for the
      // first time. Every subsequent section change goes through
      // goToSection's replace() above instead.
      if (activeRouteName !== 'more') {
        router.push(MORE_SECTIONS[activeSectionIndex].pathname as never);
      }
    } else {
      setIsMoreExpanded(false);
    }
  }

  // Tap right half of the strip = forward, left half = back. A real drag
  // (beyond a small threshold) is treated as a swipe instead — see the
  // gesture below — so the two never both fire for the same touch.
  function handleZoneTap(direction: 1 | -1) {
    goToSection(sectionIndex + direction);
  }

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      'worklet';
      if (e.translationX < -40) {
        runOnJS(goToSection)(sectionIndex + 1);
      } else if (e.translationX > 40) {
        runOnJS(goToSection)(sectionIndex - 1);
      }
    });

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
          {isMoreExpanded ? (
            // Expanded state: the More icon (now acting as collapse/back),
            // a tap-zone + swipe strip showing the current section label,
            // and dots marking position — replaces the 4 tabs entirely
            // rather than sitting alongside them, so the pill's width stays
            // the same as the mockup agreed on.
            <Animated.View
              entering={FadeIn.duration(motionDuration.fast)}
              style={[styles.subnavRow, tabRowWidth ? { width: tabRowWidth } : null]}
            >
              <Pressable
                onPress={handleMorePress}
                style={styles.subnavIconButton}
                accessibilityRole="button"
                accessibilityLabel="Collapse More"
              >
                <Ionicons name="menu-outline" size={22} color={colors.primary} />
              </Pressable>

              <GestureDetector gesture={swipeGesture}>
                <View style={styles.subnavTapArea}>
                  <Pressable
                    onPress={() => handleZoneTap(-1)}
                    style={styles.subnavZoneLeft}
                    accessibilityRole="button"
                    accessibilityLabel="Previous section"
                  />
                  <Pressable
                    onPress={() => handleZoneTap(1)}
                    style={styles.subnavZoneRight}
                    accessibilityRole="button"
                    accessibilityLabel="Next section"
                  />
                  <View style={styles.subnavLabelWrap} pointerEvents="none">
                    <Text style={styles.subnavLabel}>{MORE_SECTIONS[sectionIndex].label}</Text>
                  </View>
                </View>
              </GestureDetector>

              <View style={styles.dots}>
                {MORE_SECTIONS.map((s, i) => (
                  <View key={s.label} style={[styles.dot, i === sectionIndex && styles.dotActive]} />
                ))}
              </View>
            </Animated.View>
          ) : (
            <View
              style={styles.tabsRow}
              onLayout={(e) => setTabRowWidth(e.nativeEvent.layout.width)}
            >
              {state.routes
                .filter((route) => TAB_META[route.name])
                .map((route) => {
                  const routeIndex = state.routes.findIndex((r) => r.key === route.key);
                  const isFocused = state.index === routeIndex;
                  const meta = TAB_META[route.name];
                  const isMoreTab = route.name === 'more';
                  return (
                    <Pressable
                      key={route.key}
                      onPress={() => {
                        setIsCardOpen(false);
                        if (isMoreTab) {
                          handleMorePress();
                          return;
                        }
                        setIsMoreExpanded(false);
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
                      <Ionicons name={meta.icon} size={22} color={isFocused ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.tabLabel, { color: isFocused ? colors.primary : colors.textSecondary }]}>
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          )}
        </View>

        <Pressable
          onPress={() => setIsCardOpen((open) => !open)}
          style={styles.fab}
          accessibilityLabel={isCardOpen ? 'Close quick add' : 'Quick add'}
        >
          <Ionicons name={isCardOpen ? 'close' : 'add'} size={28} color={colors.textInverse} />
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
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    tabsRow: {
      flexDirection: 'row',
    },
    tabButton: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm + 4,
      minWidth: 52,
      minHeight: 52,
    },
    tabLabel: {
      ...typography.caption,
      fontSize: 11,
    },
    // --- Expanded "More" sub-nav strip ---
    // Same overall height/shape as the 4-tab row (52 min-height buttons)
    // so the pill doesn't resize when it expands — matches the agreed
    // mockup sizing.
    subnavRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 250, // fallback only — real width comes from tabRowWidth
                  // (measured via onLayout) once available, first render only
    },
    subnavIconButton: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subnavTapArea: {
      flex: 1,
      height: 52,
      flexDirection: 'row',
      position: 'relative',
    },
    subnavZoneLeft: {
      flex: 1,
      height: '100%',
    },
    subnavZoneRight: {
      flex: 1,
      height: '100%',
    },
    subnavLabelWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subnavLabel: {
      ...typography.bodySm,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    dots: {
      flexDirection: 'row',
      gap: 4,
      paddingRight: spacing.sm,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: radii.full,
      backgroundColor: colors.border,
    },
    dotActive: {
      width: 12,
      backgroundColor: colors.primary,
    },
    fab: {
      width: 64,
      height: 64,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 8,
      // Soft colored glow to match the reference screenshot. Fully
      // reliable on iOS (shadowColor tints the blur). Android's elevation
      // shadow is grey-only regardless of shadowColor — if the glow needs
      // to show on Android too, that requires a separate blurred View
      // behind the FAB (e.g. a slightly larger, blurred/opacity'd circle
      // in colors.primary) rather than the shadow props alone.
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
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
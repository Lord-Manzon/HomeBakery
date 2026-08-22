import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, usePathname } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography, motionDuration, motionEasing, motionSpring } from '../theme';
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

// Height of the pill+FAB row (the FAB is the tallest element in it) —
// used to position the Quick Add card correctly now that it renders
// inside its own Modal (for a real full-screen tap-outside-to-close
// backdrop) instead of inline next to the row.
const NAV_ROW_HEIGHT = 48;

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

type MoreMenuItem = {
  label: string;
  icon: IconName;
  /** Omit for destinations not built yet — renders disabled with a
   * "Soon" badge, same convention as QuickAddItem above. Only
   * Ingredients, Products, and Recipes exist as real routes today
   * (confirmed against app/(tabs)/more/*); Expenses, Reports,
   * Storefront, Subscription, and Account don't have screens yet. */
  pathname?: string;
};

// Grouped by what these actually are to a bakery owner, not just the
// order they were listed in — see the conversation in
// docs/DECISIONS.md's More-menu entry for the reasoning:
//   1. What you make  — inventory/menu side
//   2. The numbers     — money in/out
//   3. Outward-facing  — customer/plan-facing
//   4. You              — account & settings
// Each inner array renders as one visual group with a divider between
// groups (see the `more`-menu rendering below) — mirrors the grouped
// popover pattern in the Brave browser screenshot that motivated this.
const MORE_MENU_GROUPS: MoreMenuItem[][] = [
  [
    { label: 'Ingredients', icon: 'nutrition-outline', pathname: '/more/ingredients' },
    { label: 'Products', icon: 'cube-outline', pathname: '/more/products' },
    { label: 'Recipes', icon: 'book-outline', pathname: '/more/recipes' },
  ],
  [
    { label: 'Expenses', icon: 'wallet-outline' }, // not built yet
    { label: 'Reports', icon: 'bar-chart-outline' }, // not built yet
  ],
  [
    { label: 'Storefront', icon: 'storefront-outline' }, // not built yet
    { label: 'Subscription', icon: 'card-outline' }, // not built yet
  ],
  [
    { label: 'Account', icon: 'person-outline' }, // not built yet
    // Interim: only Appearance exists so far under what will become a
    // proper Settings hub (currency, etc. come later per the person's
    // plan). Point Settings straight at it for now rather than leaving
    // it disabled — swap this one pathname once a real settings/index
    // hub screen exists.
    { label: 'Settings', icon: 'settings-outline', pathname: '/more/appearance' },
  ],
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
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  const { navHidden, forceHiddenCount } = useScrollNav();
  const [isCardOpen, setIsCardOpen] = useState(false);

  // The Quick Add card renders inside its own <Modal> (for a real
  // full-screen tap-outside-to-close backdrop), which is a separate
  // native overlay from the nav row's own container — the two don't
  // reliably share the same "distance from screen bottom" coordinate
  // space (confirmed on-device: a hardcoded height guess put the card
  // flush against the pill instead of floating above it with a gap).
  // Measuring the row's real on-screen position with measureInWindow
  // avoids guessing at that offset entirely.
  const rowRef = useRef<View>(null);
  const [cardBottomOffset, setCardBottomOffset] = useState(insets.bottom + spacing.xs + NAV_ROW_HEIGHT + spacing.sm);

  function measureRowPosition() {
    rowRef.current?.measureInWindow((_x, y) => {
      if (y > 0) {
        setCardBottomOffset(windowHeight - y + spacing.sm);
      }
    });
  }

  // Quick Add "pop" animation — scales/rises up from the FAB's corner
  // instead of a plain fade, with a light spring on the way in. Driven
  // manually (rather than Modal's own animationType, or entering/exiting
  // props) so the closing half gets to actually play: `cardMounted` keeps
  // the Modal alive through the close animation, only flipping off once
  // the animation's finished callback fires — otherwise Modal's own
  // `visible` toggling off would cut the animation short.
  const [cardMounted, setCardMounted] = useState(false);
  const cardProgress = useSharedValue(0);

  useEffect(() => {
  if (isCardOpen) {
    cardProgress.value = 0;
    setCardMounted(true);

    requestAnimationFrame(() => {
      cardProgress.value = withTiming(1, {
        duration: 100,
      });
    });
  } else {
    cardProgress.value = withTiming(0, {
      duration: motionDuration.instant,
    }, (finished) => {
      if (finished) runOnJS(setCardMounted)(false);
    });
  }
}, [isCardOpen]);

const cardAnimatedStyle = useAnimatedStyle(() => ({
  opacity: cardProgress.value,
  transform: [
    { scale: 0.88 + cardProgress.value * 0.12 },
    { translateY: (1 - cardProgress.value) * 6 },
  ],
}));

  // --- More menu (Modal-based popover, same mechanism as Quick Add) ---
  // A grouped list, not an inline-expanding strip — see the conversation
  // that led here: with 9 destinations (and growing), a flat/expanding
  // strip either hides most of them behind swipes or gets cramped. This
  // reuses the exact Quick Add popover pattern (Modal, backdrop, mounted
  // state kept alive through the close animation) rather than inventing a
  // second overlay mechanism.
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuMounted, setMoreMenuMounted] = useState(false);
  const moreMenuProgress = useSharedValue(0);

  useEffect(() => {
    if (isMoreMenuOpen) {
      moreMenuProgress.value = 0;
      setMoreMenuMounted(true);
      moreMenuProgress.value = withSpring(1, motionSpring.gentle);
    } else {
      moreMenuProgress.value = withTiming(0, { duration: motionDuration.instant }, (finished) => {
        if (finished) runOnJS(setMoreMenuMounted)(false);
      });
    }
  }, [isMoreMenuOpen]);

  const moreMenuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: moreMenuProgress.value,
    transform: [
      { scale: 0.9 + moreMenuProgress.value * 0.1 },
      { translateY: (1 - moreMenuProgress.value) * 8 },
    ],
  }));

  function handleMoreMenuPress(item: MoreMenuItem) {
    setIsMoreMenuOpen(false);
    if (!item.pathname) return; // no built destination yet — same no-op as Quick Add
    router.push(item.pathname as never);
  }

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
    if (pathname === item.pathname) {
      // Already on the target screen — pushing here was the bug: tapping
      // "Add ingredient" while already in Ingredients pushed a SECOND
      // copy of the same screen onto the stack, so Android back just
      // popped to another identical Ingredients screen instead of
      // actually leaving. Update params in place instead, so the
      // screen's own effect (e.g. ingredients/index.tsx's openAdd
      // handling) reacts without navigating anywhere. Same class of fix
      // as the earlier ingredients/index.tsx openAdd fix.
      if (item.params) {
        router.setParams(item.params as never);
      }
      return;
    }
    // `as never`: QUICK_ADD's pathnames are assembled dynamically per tab
    // (not string literals Expo Router's typed-routes codegen can see at
    // this call site), so the cast is a deliberate, narrow escape hatch —
    // not a general `any`. Every pathname above is a real, existing route.
    router.push({ pathname: item.pathname, params: item.params } as never);
  }

  return (
    <>
      <Modal transparent visible={cardMounted} animationType="none" onRequestClose={() => setIsCardOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsCardOpen(false)} accessibilityLabel="Close quick add" />
        <Animated.View
          style={[
            styles.card,
            styles.cardModalPosition,
            { right: spacing.lg, bottom: cardBottomOffset, transformOrigin: 'bottom right' },
            cardAnimatedStyle,
          ]}
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
      </Modal>

      <Modal transparent visible={moreMenuMounted} animationType="none" onRequestClose={() => setIsMoreMenuOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsMoreMenuOpen(false)} accessibilityLabel="Close more menu" />
        {/* Centered above the whole row (not right-anchored to the FAB like
            Quick Add) — More sits mid-pill, not attached to the FAB, and a
            centered anchor is safer for a wider menu with longer labels
            like "Subscription" than a fixed left/right edge would be. */}
        <View
          style={[styles.moreMenuPositioner, { bottom: cardBottomOffset }]}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.moreMenuCard, moreMenuAnimatedStyle]}>
            {MORE_MENU_GROUPS.map((group, groupIndex) => (
              <View key={groupIndex}>
                {groupIndex > 0 ? <View style={styles.moreMenuDivider} /> : null}
                {group.map((item) => {
                  const isActive = !!item.pathname && pathname.startsWith(item.pathname);
                  return (
                    <Pressable
                      key={item.label}
                      onPress={() => handleMoreMenuPress(item)}
                      style={({ pressed }) => [styles.cardRow, pressed && item.pathname && styles.cardRowPressed]}
                      disabled={!item.pathname}
                      accessibilityLabel={item.pathname ? item.label : `${item.label}, coming soon`}
                    >
                      <View style={[styles.cardIcon, !item.pathname && styles.cardIconDisabled]}>
                        <Ionicons
                          name={item.icon}
                          size={15}
                          color={item.pathname ? (isActive ? colors.primary : colors.textPrimary) : colors.textSecondary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.cardRowLabel,
                          isActive && styles.cardRowLabelPrimary,
                          !item.pathname && styles.cardRowLabelDisabled,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {!item.pathname ? <Text style={styles.cardRowSoon}>Soon</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        </View>
      </Modal>

      <View style={[styles.wrap, { paddingBottom: insets.bottom + spacing.xs }]} pointerEvents="box-none">
      <View ref={rowRef} onLayout={measureRowPosition} collapsable={false}>
      <Animated.View style={[styles.row, navAnimatedStyle]}>
        <View style={styles.pill}>
          {/* Flat 4-tab row — no inline expansion. More opens the grouped
              popover menu above (Modal, same mechanism as Quick Add)
              instead of morphing the bar itself, since a flat/expanding
              strip doesn't scale to 9 destinations without hiding most of
              them behind swipes. */}
          <View style={styles.tabsRow}>
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
                        setIsMoreMenuOpen((open) => !open);
                        return;
                      }
                      setIsMoreMenuOpen(false);
                      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                      if (!isFocused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                      }
                    }}
                    style={styles.tabButton}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isFocused || (isMoreTab && isMoreMenuOpen) }}
                    accessibilityLabel={meta.label}
                  >
                    <Ionicons
                      name={meta.icon}
                      size={22}
                      color={isFocused || (isMoreTab && isMoreMenuOpen) ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: isFocused || (isMoreTab && isMoreMenuOpen) ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </View>

        <Pressable
          onPress={() => {
            setIsMoreMenuOpen(false);
            setIsCardOpen((open) => !open);
          }}
          style={styles.fab}
          accessibilityLabel={isCardOpen ? 'Close quick add' : 'Quick add'}
        >
          <Ionicons name={isCardOpen ? 'close' : 'add'} size={28} color={colors.textInverse} />
        </Pressable>
      </Animated.View>
      </View>
      </View>
    </>
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
  alignItems: 'center',
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radii.full,
  height: 68,
  position: 'relative',
  overflow: 'hidden',
  elevation: 4,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.12,
  shadowRadius: 8,
},
    tabsRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.sm,
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
    // --- More menu (grouped popover) ---
    // Centered above the row rather than right-anchored like Quick Add's
    // card — More sits mid-pill, not attached to the FAB, and centering
    // is safer than a fixed edge for a menu whose widest label
    // ("Subscription") isn't known in advance.
    moreMenuPositioner: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    moreMenuCard: {
      width: 220,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.xs,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
    },
    moreMenuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
      marginHorizontal: spacing.sm,
    },
    fab: {
      width: 64,
      height: 64,
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
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.xs,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
    },
    cardModalPosition: {
      position: 'absolute',
      // `right`/`bottom` set inline at the call site since they depend on
      // insets.bottom, which isn't available in makeStyles.
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
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { MORE_MENU_ITEMS, type MoreMenuItem } from '../constants/moreMenu';
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
  // Note: there's no 'more' entry anymore — Ingredients/Products/Recipes
  // each get their own single direct action via getFabConfig below
  // instead of sharing one multi-item menu.
};

/**
 * What the + button does on the current screen. Determined from the
 * actual `pathname`, not just the tab name — Ingredients/Products/
 * Recipes/Settings all live under the same "more" tab, so the tab name
 * alone can't tell them apart.
 *   - 'menu'   → Home, Production: opens the existing Quick Add popup
 *                (multiple contextual actions).
 *   - 'direct' → Ingredients/Products/Recipes/Orders: + performs that
 *                one obvious action directly, no popup needed.
 *   - 'hidden' → Reports, Settings, Account, the /more hub itself, and
 *                anything unrecognized: no + shown at all. The pill
 *                then centers alone (see `row`'s alignSelf: 'center' —
 *                that's automatic once the FAB isn't rendered, no
 *                extra centering logic needed).
 */
type FabConfig =
  | { mode: 'hidden' }
  | { mode: 'menu'; items: QuickAddItem[] }
  | { mode: 'direct'; icon: IconName; pathname?: string; params?: Record<string, string> };

function getFabConfig(activeRouteName: string, pathname: string): FabConfig {
  if (activeRouteName === 'more') {
    if (pathname.startsWith('/more/ingredients')) {
      return { mode: 'direct', icon: 'nutrition-outline', pathname: '/more/ingredients', params: { openAdd: '1' } };
    }
    if (pathname.startsWith('/more/products')) {
      return { mode: 'direct', icon: 'cube-outline', pathname: '/more/products/new' };
    }
    if (pathname.startsWith('/more/recipes')) {
      return { mode: 'direct', icon: 'book-outline', pathname: '/more/recipes/new' };
    }
    // TODO: add an Expenses branch here once /more/expenses exists —
    // { mode: 'direct', icon: 'wallet-outline', pathname: '/more/expenses/new' }
    //
    // Everything else under More — Settings (appearance), the /more hub
    // screen itself, and any future Account/Reports/etc. screens — has
    // no obvious "add" action, so no +.
    return { mode: 'hidden' };
  }
  if (activeRouteName === 'orders') {
    // Add Order isn't built yet (Phase 7) — still shows a + per spec,
    // it just no-ops until the route exists (same convention as the
    // disabled "Soon" rows elsewhere).
    return { mode: 'direct', icon: 'receipt-outline' };
  }
  if (activeRouteName === 'index') {
    return { mode: 'menu', items: QUICK_ADD.index };
  }
  if (activeRouteName === 'production') {
    return { mode: 'menu', items: QUICK_ADD.production };
  }
  return { mode: 'hidden' };
}

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

  // The Quick Add card renders as a plain full-screen overlay View (not
  // <Modal> — see the render below for why), which is a separate
  // sibling from the nav row's own container — the two don't reliably
  // share the same "distance from screen bottom" coordinate space
  // (confirmed on-device: a hardcoded height guess put the card flush
  // against the pill instead of floating above it with a gap).
  // Measuring the row's real on-screen position with measureInWindow
  // avoids guessing at that offset entirely.
  const rowRef = useRef<View>(null);
  const [cardBottomOffset, setCardBottomOffset] = useState(insets.bottom + spacing.xs + NAV_ROW_HEIGHT + spacing.sm);

  // Guards every navigation triggered from this bar against rapid
  // double-taps. Without this, tapping fast enough fires a second press
  // before `pathname` has updated from the first one, so the "am I
  // already on this screen?" checks below don't catch it — both taps
  // push, and you get the same screen duplicated on the stack. A short
  // cooldown after any nav call blocks the immediate repeat tap.
  const lastNavAtRef = useRef(0);
  function navigateOnce(action: () => void) {
    const now = Date.now();
    if (now - lastNavAtRef.current < 500) return;
    lastNavAtRef.current = now;
    action();
  }

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
    if (pathname.startsWith(item.pathname)) return; // already here — this was the real duplicate bug, not tap speed
    navigateOnce(() => router.push(item.pathname as never));
  }

  const activeRouteName = state.routes[state.index]?.name ?? 'index';
  const fabConfig = getFabConfig(activeRouteName, pathname);
  const items = fabConfig.mode === 'menu' ? fabConfig.items : [];

  // Android hardware back button: Modal used to intercept this for free
  // via onRequestClose. Now that both popovers are plain overlay Views
  // (see the render below — removed Modal because its native Android
  // Dialog dims the background by default regardless of our own styles,
  // which is what was still showing up as a dark backdrop), back-button
  // handling has to be wired up explicitly instead.
  useEffect(() => {
    if (!isCardOpen && !isMoreMenuOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isCardOpen) {
        setIsCardOpen(false);
        return true;
      }
      if (isMoreMenuOpen) {
        setIsMoreMenuOpen(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isCardOpen, isMoreMenuOpen]);

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
        navigateOnce(() => router.setParams(item.params as never));
      }
      return;
    }
    // `as never`: QUICK_ADD's pathnames are assembled dynamically per tab
    // (not string literals Expo Router's typed-routes codegen can see at
    // this call site), so the cast is a deliberate, narrow escape hatch —
    // not a general `any`. Every pathname above is a real, existing route.
    navigateOnce(() => router.push({ pathname: item.pathname, params: item.params } as never));
  }

  // Same push-vs-update-in-place logic as handleQuickAddPress, just for
  // the single direct action a 'direct'-mode screen's + performs — no
  // popup to close first since there isn't one.
  function handleDirectFabPress(config: Extract<FabConfig, { mode: 'direct' }>) {
    if (!config.pathname) return; // not built yet — no-op, e.g. Add Order today
    if (pathname === config.pathname) {
      if (config.params) {
        navigateOnce(() => router.setParams(config.params as never));
      }
      return;
    }
    navigateOnce(() => router.push({ pathname: config.pathname, params: config.params } as never));
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.wrap, { paddingBottom: insets.bottom + spacing.xs }]} pointerEvents="box-none">
      <View ref={rowRef} onLayout={measureRowPosition} collapsable={false}>
      <Animated.View style={[styles.row, navAnimatedStyle]}>
        <View style={styles.pill}>
          {/* Flat 4-tab row — no inline expansion. More opens the grouped
              popover menu above instead of morphing the bar itself, since
              a flat/expanding strip doesn't scale to 9 destinations
              without hiding most of them behind swipes. */}
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
                    accessibilityState={{ selected: isFocused }}
                    accessibilityLabel={meta.label}
                  >
                    <View style={[styles.iconChip, isFocused && styles.tabButtonActive]}>
                      <Ionicons
                        name={meta.icon}
                        size={20}
                        color={isFocused ? colors.primary : colors.textSecondary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: isFocused ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </View>

        {/* No + at all on 'hidden' screens (Reports, Settings, Account,
            the /more hub, etc.) — the pill then centers alone for free
            via `row`'s existing alignSelf: 'center', no extra layout
            logic needed once this simply isn't rendered. */}
        {fabConfig.mode !== 'hidden' ? (
          <Pressable
            onPress={() => {
              setIsMoreMenuOpen(false);
              if (fabConfig.mode === 'menu') {
                setIsCardOpen((open) => !open);
              } else {
                handleDirectFabPress(fabConfig);
              }
            }}
            style={styles.fab}
            accessibilityLabel={
              fabConfig.mode === 'menu' ? (isCardOpen ? 'Close quick add' : 'Quick add') : 'Add'
            }
          >
            <Ionicons
              name={fabConfig.mode === 'menu' && isCardOpen ? 'close' : 'add'}
              size={26}
              color={colors.textInverse}
            />
          </Pressable>
        ) : null}
      </Animated.View>
      </View>
      </View>

      {/* Quick Add popup — plain overlay View, not <Modal>. Modal's native
          Android Dialog dims the background by default regardless of our
          own transparent/backdrop styling; a plain sibling View here
          gives full control with zero platform-imposed dimming. Rendered
          after the nav row above (same parent), so it stacks on top
          without needing Modal or manual zIndex. */}
      {cardMounted ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
        </View>
      ) : null}

      {/* More menu popup — same reasoning as Quick Add above: plain
          overlay View instead of <Modal>, so the scrim below is the
          *only* dimming that happens, fully under our control. */}
      {moreMenuMounted ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsMoreMenuOpen(false)} accessibilityLabel="Close more menu" />
          <View
            style={[styles.moreMenuPositioner, { bottom: cardBottomOffset }]}
            pointerEvents="box-none"
          >
            <Animated.View style={[styles.moreMenuCard, moreMenuAnimatedStyle]}>
              {MORE_MENU_ITEMS.filter((item) => item.pathname).map((item) => {
                const isActive = !!item.pathname && pathname.startsWith(item.pathname);
                return (
                  <Pressable
                    key={item.label}
                    onPress={() => handleMoreMenuPress(item)}
                    style={({ pressed }) => [styles.cardRow, pressed && styles.cardRowPressed]}
                    accessibilityLabel={item.label}
                  >
                    <View style={styles.cardIcon}>
                      <Ionicons name={item.icon} size={15} color={isActive ? colors.primary : colors.textPrimary} />
                    </View>
                    <Text style={[styles.cardRowLabel, isActive && styles.cardRowLabelPrimary]}>{item.label}</Text>
                  </Pressable>
                );
              })}

              <View style={styles.moreMenuDivider} />

              <Pressable
                onPress={() => {
                  setIsMoreMenuOpen(false);
                  if (pathname === '/more') return; // already here
                  navigateOnce(() => router.push('/more' as never));
                }}
                style={({ pressed }) => [styles.cardRow, pressed && styles.cardRowPressed]}
                accessibilityLabel="More options"
              >
                <Text style={styles.moreOptionsLabel}>More options</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </Pressable>
            </Animated.View>
          </View>
        </View>
      ) : null}
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
      paddingHorizontal: spacing.sm,
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
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      height: 60,
      position: 'relative',
      overflow: 'hidden',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
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
      paddingHorizontal: spacing.md + 2,
      minWidth: 46,
      minHeight: 46,
    },
    // Highlight pill behind the active tab — Netflix and Google Photos
    // both do this (rounded fill behind icon+label, not just a color
    // change) and it reads as a clearer "you are here" than color alone.
    //
    // Originally used colors.surfaceMuted, on the theory that a
    // translucent tint of the user-customizable primary wasn't safely
    // computable from a plain hex token. Wrong in practice: confirmed
    // against the actual dark palette (src/theme/palettes.ts) that
    // surface (#26211D) and surfaceMuted (#2F2925) are close enough in
    // darkness to be visually indistinguishable — the highlight was
    // rendering, just invisibly. A hex alpha suffix on primary (e.g.
    // '#C9683F22') is valid in RN styles and works for ANY chosen accent
    // color without needing a dedicated token, and guarantees contrast
    // since it's a tint of the accent itself rather than two similarly
    // dark neutrals.
    iconChip: {
      width: 36,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
    },
    tabButtonActive: {
      backgroundColor: `${colors.primary}22`, // ~13% opacity
      borderRadius: radii.full,
    },
    tabLabel: {
      ...typography.caption,
      fontSize: 11,
    },
    // --- More menu (trimmed popover) ---
    // Centered above the row rather than right-anchored like Quick Add's
    // card — More sits mid-pill, not attached to the FAB, and centering
    // keeps it visually attached to where it opened from.
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
    // Deliberately quieter than a normal row — no icon chip, muted
    // color, right-aligned chevron — so "More options" reads as an
    // escape hatch, not a 5th action competing with the real ones above.
    moreOptionsLabel: {
      ...typography.bodySm,
      color: colors.textSecondary,
      flex: 1,
    },
    fab: {
      width: 56,
      height: 56,
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
    iconSpacer: {
      width: 26,
      height: 26,
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
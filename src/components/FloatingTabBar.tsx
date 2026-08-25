import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, usePathname } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
  interpolateColor,
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

// Height of the bar — used to position the Quick Add / More popups
// correctly (they measure the bar's real on-screen position via
// measureInWindow rather than relying on this constant directly, but
// it's kept as the pre-measurement fallback default).
const NAV_ROW_HEIGHT = 72;

// Extra clearance (beyond the bar's own top edge) that both popups add
// to their vertical offset, so they clear the embedded FAB — whichr
// pokes 22px above the bar — with a visibly obvious gap rather than a
// mathematically-minimal one that risks reading as touching due to
// shadow bleed. Tighten this if it ends up too generous once seen live.
const POPUP_FAB_CLEARANCE = 24;

// Filled variant shown when a tab is active, on top of the color change
// and pop/rotate motion — a plain outline-vs-outline color swap felt
// flat; swapping to the filled glyph gives the tap a visible "state
// changed" feeling beyond just recoloring. 'menu-outline' has no
// distinct filled counterpart in Ionicons, so More reuses 'menu' as its
// active glyph (subtly different weight, not a true fill).
const TAB_META: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  orders: { label: 'Orders', icon: 'receipt-outline', activeIcon: 'receipt' },
  production: { label: 'Production', icon: 'flame-outline', activeIcon: 'flame' },
  more: { label: 'More', icon: 'menu-outline', activeIcon: 'menu' },
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
 *                anything unrecognized: no + shown at all.
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
    return { mode: 'hidden' };
  }
  if (activeRouteName === 'orders') {
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
 * One tab. Highlight is per-tab and independent — a small chip wrapping
 * just the icon fades from transparent to tinted on focus, rather than
 * a shared element traveling between tabs (tried that; it was
 * positioned across the whole row's height to measure correctly, which
 * visually intruded into the label below — an inline per-tab chip
 * avoids that entirely since it just sits in the icon's own slot in
 * normal layout flow). Icon still swaps to a filled variant and does a
 * pop/rotate "flick" on becoming active.
 */
function TabItem({
  icon,
  activeIcon,
  label,
  isFocused,
  badgeCount,
  onPress,
  colors,
  styles,
}: {
  icon: IconName;
  activeIcon: IconName;
  label: string;
  isFocused: boolean;
  /** Wired for future use — Orders/Production may show a live count
   * later. No data source for this exists yet, so every call site below
   * passes `undefined` today; this just avoids another restructure once
   * that data's available. */
  badgeCount?: number;
  onPress: () => void;
  colors: Record<ColorToken, string>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const progress = useSharedValue(isFocused ? 1 : 0);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, {
      duration: motionDuration.fast,
      easing: motionEasing.standard,
    });
    if (isFocused) {
      // Quick pop past 1.0 then spring-settle, plus a small counter-
      // rotation that untwists back to 0 — reads as a little "flick"
      // rather than a plain fade. Judgment-call default; swap freely if
      // it doesn't feel right in motion.
      scale.value = withSequence(
        withTiming(1.22, { duration: 120, easing: motionEasing.decelerate }),
        withSpring(1, motionSpring.gentle)
      );
      rotate.value = withSequence(
        withTiming(-14, { duration: 0 }),
        withTiming(0, { duration: 240, easing: motionEasing.decelerate })
      );
    }
  }, [isFocused]);

  const chipAnimStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', `${colors.primary}22`]),
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  const labelAnimStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.textSecondary, colors.primary]),
  }));

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={badgeCount ? `${label}, ${badgeCount} new` : label}
    >
      <Animated.View style={[styles.iconChip, chipAnimStyle]}>
        <Ionicons name={isFocused ? activeIcon : icon} size={22} color={isFocused ? colors.primary : colors.textSecondary} />
        {badgeCount ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text style={[styles.tabLabel, labelAnimStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

/**
 * Replaces Expo Router <Tabs>'s default fixed bar (via the `tabBar`
 * prop). Full-width, flush against the bottom of the screen — not a
 * floating pill — with the Quick Add + embedded as a notch at the
 * top-center of the bar rather than sitting beside it. A single
 * traveling highlight slides between whichever tab is active; each
 * tab's icon also pops/rotates and swaps to a filled variant on
 * becoming active. Tapping + opens a contextual popup listing that
 * screen's Quick Add actions (or performs one direct action on
 * single-purpose screens — see getFabConfig).
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
  // <Modal> — Android's native Dialog dims the background by default
  // regardless of our own styles, which is what was showing up as an
  // unwanted dark backdrop). Measuring the bar's real on-screen position
  // with measureInWindow avoids guessing at its height/offset.
  const rowRef = useRef<View>(null);
  const [cardBottomOffset, setCardBottomOffset] = useState(insets.bottom + spacing.sm + NAV_ROW_HEIGHT);

  // Guards every navigation triggered from this bar against rapid
  // double-taps — without this, tapping fast enough fires a second press
  // before `pathname` has updated from the first one, so the "already
  // here?" checks below don't catch it and you get a duplicated screen.
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
        // The FAB pokes up 22px above the bar's own top edge (see
        // styles.fab's top: -22). The previous +34 total should have
        // left a small real gap mathematically, but it was still
        // reading as touching on-device (likely shadow bleed making a
        // small gap look like contact, or the FAB's own drop shadow
        // extending past its visible circle). Bumping to a clearly
        // visible gap rather than a precisely-calculated minimum one —
        // easy to tighten later via POPUP_FAB_CLEARANCE if it ends up
        // too generous.
        setCardBottomOffset(windowHeight - y + spacing.sm + POPUP_FAB_CLEARANCE);
      }
    });
  }

  // Quick Add "pop" animation — scales/rises up instead of a plain fade.
  // Driven manually so the closing half gets to actually play:
  // `cardMounted` stays true through the close animation, only flipping
  // off once the animation's finished callback fires.
  const [cardMounted, setCardMounted] = useState(false);
  const cardProgress = useSharedValue(0);

  useEffect(() => {
    if (isCardOpen) {
      cardProgress.value = 0;
      setCardMounted(true);
      requestAnimationFrame(() => {
        cardProgress.value = withTiming(1, { duration: 100 });
      });
    } else {
      cardProgress.value = withTiming(0, { duration: motionDuration.instant }, (finished) => {
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

  // --- More menu (same overlay mechanism as Quick Add) ---
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
    if (!item.pathname) return;
    if (pathname.startsWith(item.pathname)) return; // already here
    navigateOnce(() => router.push(item.pathname as never));
  }

  const activeRouteName = state.routes[state.index]?.name ?? 'index';
  const fabConfig = getFabConfig(activeRouteName, pathname);
  const items = fabConfig.mode === 'menu' ? fabConfig.items : [];

  // Android hardware back button: now that both popovers are plain
  // overlay Views (not <Modal>), back-button handling is wired up
  // explicitly instead of relying on Modal's onRequestClose.
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
    if (!item.pathname) return;
    if (pathname === item.pathname) {
      if (item.params) {
        navigateOnce(() => router.setParams(item.params as never));
      }
      return;
    }
    navigateOnce(() => router.push({ pathname: item.pathname, params: item.params } as never));
  }

  function handleDirectFabPress(config: Extract<FabConfig, { mode: 'direct' }>) {
    if (!config.pathname) return;
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
      <View style={styles.wrap} pointerEvents="box-none">
        <Animated.View style={navAnimatedStyle}>
        <View ref={rowRef} onLayout={measureRowPosition} collapsable={false}>
          <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <View style={styles.tabsRow}>
              {state.routes
                .filter((route) => TAB_META[route.name])
                .map((route) => {
                  const routeIndex = state.routes.findIndex((r) => r.key === route.key);
                  const isFocused = state.index === routeIndex;
                  const meta = TAB_META[route.name];
                  const isMoreTab = route.name === 'more';

                  // The FAB notch sits between Orders and Production —
                  // an empty fixed-width spacer reserves its clearance
                  // so tabs never sit under it.
                  const insertSpacerBefore = route.name === 'production';

                  return (
                    <View key={route.key} style={styles.tabSlot}>
                      {insertSpacerBefore ? <View style={styles.fabSpacer} /> : null}
                      <TabItem
                        icon={meta.icon}
                        activeIcon={meta.activeIcon}
                        label={meta.label}
                        isFocused={isFocused}
                        colors={colors}
                        styles={styles}
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
                      />
                    </View>
                  );
                })}
            </View>
          </View>
        </View>

        {/* Embedded FAB — overlaps the bar's top edge at center, rather
            than floating beside the bar. Inside the same Animated.View
            as the bar (was a sibling before, which is why it wasn't
            hiding on scroll — fixed), so both move together. No + at
            all on 'hidden' screens (Reports, Settings, Account, the
            /more hub, etc.). */}
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
              name={(fabConfig.mode === 'menu' && isCardOpen) || isMoreMenuOpen ? 'close' : 'add'}
              size={26}
              color={colors.textInverse}
            />
          </Pressable>
        ) : null}
        </Animated.View>
      </View>

      {/* Quick Add popup — plain overlay View, not <Modal>. Centered
          above the bar, same as the More menu below — was right-
          anchored (right: spacing.lg) from when the FAB sat beside the
          pill on the right edge; now that it's embedded at center, that
          anchor left the popup floating off to one side instead of
          above the FAB. */}
      {cardMounted ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsCardOpen(false)} accessibilityLabel="Close quick add" />
          <View style={[styles.moreMenuPositioner, { bottom: cardBottomOffset }]} pointerEvents="box-none">
            <Animated.View style={[styles.card, cardAnimatedStyle]}>
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
        </View>
      ) : null}

      {/* More menu popup — Option B (icon grid) over Option A (bottom
          sheet): "simpler" was the ask, and a dimmed-backdrop sheet is
          actually more visual weight than a small popover, not less —
          plus the /more full screen already exists specifically so this
          popup never has to grow past what's built. A 2x2 grid is a
          fixed shape though — works cleanly for today's 4 built items,
          but a 5th (e.g. Expenses) won't tile evenly and will need a
          decision (3rd row with a gap, or switch to 3 columns) when
          that happens. */}
      {moreMenuMounted ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsMoreMenuOpen(false)} accessibilityLabel="Close more menu" />
          <View style={[styles.moreMenuPositioner, { bottom: cardBottomOffset }]} pointerEvents="box-none">
            <Animated.View style={[styles.moreMenuCard, moreMenuAnimatedStyle]}>
              <View style={styles.moreMenuGrid}>
                {MORE_MENU_ITEMS.filter((item) => item.pathname).map((item) => {
                  const isActive = !!item.pathname && pathname.startsWith(item.pathname);
                  return (
                    <Pressable
                      key={item.label}
                      onPress={() => handleMoreMenuPress(item)}
                      style={({ pressed }) => [styles.gridTile, pressed && styles.cardRowPressed]}
                      accessibilityLabel={item.label}
                    >
                      <View style={[styles.gridTileIcon, isActive && styles.gridTileIconActive]}>
                        <Ionicons name={item.icon} size={22} color={isActive ? colors.primary : colors.textPrimary} />
                      </View>
                      <Text style={[styles.gridTileLabel, isActive && styles.cardRowLabelPrimary]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.moreMenuDivider} />

              <Pressable
                onPress={() => {
                  setIsMoreMenuOpen(false);
                  if (pathname === '/more') return;
                  navigateOnce(() => router.push('/more' as never));
                }}
                style={({ pressed }) => [styles.moreOptionsRow, pressed && styles.cardRowPressed]}
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
    },
    // Full-width, flush with the bottom of the screen — not a floating
    // pill. Rounded top corners only, per the reference; bottom stays
    // square since it sits directly on the screen edge / system nav bar.
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: spacing.lg,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    tabsRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      position: 'relative',
    },
    // Reserves clearance for the embedded FAB notch between Orders and
    // Production, so tabs never render underneath it.
    fabSpacer: {
      width: 72,
    },
    tabButton: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.xs,
      minWidth: 56,
    },
    // Wraps just the icon so the highlight can never intrude into the
    // label below — a fixed wide-oval size per the reference image,
    // same size every tab, only its background fades in/out.
    iconChip: {
      width: 60,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
    },
    // Each tab's own outer slot in tabsRow — plain View, no Fragment or
    // cross-parent measurement needed now that the highlight is per-tab
    // rather than a single shared traveling element.
    tabSlot: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: radii.full,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    badgeText: {
      ...typography.caption,
      fontSize: 9,
      color: colors.textInverse,
      fontWeight: '700',
    },
    tabLabel: {
      ...typography.caption,
      fontSize: 11,
    },
    // --- Embedded FAB notch ---
    // Overlaps the bar's rounded top edge at center, rather than
    // floating as a separate circle beside the bar.
    fab: {
      position: 'absolute',
      top: -22,
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
    // --- More menu (trimmed popover) ---
    moreMenuPositioner: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    moreMenuCard: {
      width: 260,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.sm,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
    },
    moreMenuGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    gridTile: {
      width: '50%',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderRadius: radii.md,
    },
    gridTileIcon: {
      width: 48,
      height: 48,
      // Half of moreMenuCard's own radius (radii.lg = 16) — nested
      // rounded rectangles read more polished when the inner radius is
      // proportional to the outer one rather than picked independently.
      borderRadius: 8,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    gridTileIconActive: {
      backgroundColor: `${colors.primary}22`,
    },
    gridTileLabel: {
      ...typography.bodySm,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    moreMenuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
      marginHorizontal: spacing.sm,
    },
    // Deliberately its own style rather than reusing cardRow (Quick
    // Add's rows) — given the same vertical rhythm as the grid tiles
    // above it (spacing.md, not cardRow's tighter spacing.sm) so it
    // reads as an intentionally quieter row, not an accidentally
    // cramped one. Still visually secondary via color/no icon-chip,
    // just no longer a different density scale.
    moreOptionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      minHeight: 48,
    },
    moreOptionsLabel: {
      ...typography.bodySm,
      color: colors.textSecondary,
      flex: 1,
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
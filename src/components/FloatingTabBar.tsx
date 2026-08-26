import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
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

// Filled variant shown when a tab is active, on top of the color change
// and pop/rotate motion. 'menu-outline' has no distinct filled
// counterpart in Ionicons, so More reuses 'menu' as its active glyph
// (subtly different weight, not a true fill).
const TAB_META: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  orders: { label: 'Orders', icon: 'receipt-outline', activeIcon: 'receipt' },
  production: { label: 'Production', icon: 'flame-outline', activeIcon: 'flame' },
  more: { label: 'More', icon: 'menu-outline', activeIcon: 'menu' },
};

type PanelItem = {
  label: string;
  icon: IconName;
  /** Omit for actions with no built destination yet — renders disabled
   * with a "Soon" badge, same convention used throughout this file. */
  pathname?: string;
  params?: Record<string, string>;
};

/**
 * What the Add tab's panel shows on the current screen. Only reached for
 * 'index' (Home) and 'more' sub-routes now — 'orders' and 'production'
 * bypass the panel entirely and navigate directly instead, since each
 * has exactly one obvious action and nothing to choose between (see
 * handleAddTabPress below).
 */
function getAddPanelItems(activeRouteName: string, pathname: string): PanelItem[] {
  if (activeRouteName === 'index') {
    return [
      { label: 'Add order', icon: 'receipt-outline', pathname: '/orders/new' },
      {
        label: 'Add ingredient',
        icon: 'nutrition-outline',
        pathname: '/more/ingredients',
        params: { openAdd: '1' },
      },
      { label: 'Add product', icon: 'cube-outline', pathname: '/more/products/new' },
      { label: 'Add expense', icon: 'wallet-outline' }, // Phase 9, not built yet
    ];
  }
  if (activeRouteName === 'more') {
    if (pathname.startsWith('/more/ingredients')) {
      return [
        { label: 'Add ingredient', icon: 'nutrition-outline', pathname: '/more/ingredients', params: { openAdd: '1' } },
      ];
    }
    if (pathname.startsWith('/more/products')) {
      return [{ label: 'Add product', icon: 'cube-outline', pathname: '/more/products/new' }];
    }
    if (pathname.startsWith('/more/recipes')) {
      return [{ label: 'Add recipe', icon: 'book-outline', pathname: '/more/recipes/new' }];
    }
    // TODO: add an Expenses branch once /more/expenses exists.
    // Settings (appearance), the /more hub itself, and anything else
    // under More has no obvious add action — empty panel, not hidden.
    return [];
  }
  return [];
}

/**
 * Flat list shown inside the More panel — replaces the old wrapping-pill
 * grid + separate "More options" row. Built sections (real pathname) are
 * tappable and highlight when it's the current route; not-yet-built
 * sections (Expenses, Reports — see docs/ROADMAP.md phases 9 & 11) get
 * the same disabled/"Soon" treatment already used for unbuilt Add-panel
 * items, so both panels read as one consistent pattern. "See all" at
 * the bottom is the only way to reach what's left (Storefront,
 * Subscription, Account, etc.) via the full /more hub screen.
 */
const MORE_PANEL_ITEMS: PanelItem[] = [
  { label: 'Ingredients', icon: 'nutrition-outline', pathname: '/more/ingredients' },
  { label: 'Products', icon: 'cube-outline', pathname: '/more/products' },
  { label: 'Recipes', icon: 'book-outline', pathname: '/more/recipes' },
  { label: 'Expenses', icon: 'wallet-outline' }, // Phase 9, not built yet
  { label: 'Reports', icon: 'bar-chart-outline' }, // Phase 11, not built yet
  { label: 'Settings', icon: 'settings-outline', pathname: '/more/appearance' },
];

/**
 * The exact route of every top-level screen reachable via the More
 * panel/hub, plus the hub itself. Used to decide push vs replace: a
 * navigation whose TARGET is one of these paths is a switch between
 * peer top-level screens (must not grow the back stack); anything else
 * (a sub-route like /more/products/new or /more/products/[id]) is a
 * normal detail screen and should push. Keep this derived from
 * MORE_PANEL_ITEMS/'/more' rather than hand-listed, so a newly-wired-up
 * destination (Expenses, Reports, ...) picks up the right behavior the
 * moment it gets a real pathname, with nothing else to update.
 */
const TOP_LEVEL_MORE_PATHS = new Set<string>([
  '/more',
  ...MORE_PANEL_ITEMS.map((item) => item.pathname).filter((p): p is string => !!p),
]);

/**
 * One real navigation tab (Home/Orders/Production/More) OR the
 * synthetic Add tab (no route of its own — see FloatingTabBar). Same
 * visual language either way: icon pops/rotates and swaps to a filled
 * variant, label recolors, a chip behind the icon tints in — so Add
 * reads as just another tab in the row, not a special element.
 */
function TabItem({
  icon,
  activeIcon,
  label,
  isActive,
  chipActive,
  badgeCount,
  onPress,
  colors,
  styles,
}: {
  icon: IconName;
  activeIcon: IconName;
  label: string;
  /** Drives label/icon color + the pop/rotate motion. For real routes
   * this is genuine navigation focus; for Add (no route) this is
   * simply "is its panel currently open". */
  isActive: boolean;
  /** Drives just the background chip, separately from isActive. Lets
   * More's chip light up while its panel is open WITHOUT also tinting
   * its label purple when you're not actually on a /more/* screen —
   * conflating those two was a real bug caught earlier (two tabs
   * appearing selected at once). Defaults to `isActive` when omitted. */
  chipActive?: boolean;
  badgeCount?: number;
  onPress: () => void;
  colors: Record<ColorToken, string>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const resolvedChipActive = chipActive ?? isActive;
  const progress = useSharedValue(isActive ? 1 : 0);
  const chipProgress = useSharedValue(resolvedChipActive ? 1 : 0);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, {
      duration: motionDuration.fast,
      easing: motionEasing.standard,
    });
    if (isActive) {
      // Quick pop past 1.0 then spring-settle, plus a small counter-
      // rotation that untwists back to 0 — reads as a little "flick"
      // rather than a plain fade. Judgment-call default; swap freely.
      scale.value = withSequence(
        withTiming(1.22, { duration: 120, easing: motionEasing.decelerate }),
        withSpring(1, motionSpring.gentle)
      );
      rotate.value = withSequence(
        withTiming(-14, { duration: 0 }),
        withTiming(0, { duration: 240, easing: motionEasing.decelerate })
      );
    }
  }, [isActive]);

  useEffect(() => {
    chipProgress.value = withTiming(resolvedChipActive ? 1 : 0, {
      duration: motionDuration.fast,
      easing: motionEasing.standard,
    });
  }, [resolvedChipActive]);

  const chipAnimStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(chipProgress.value, [0, 1], ['transparent', `${colors.primary}22`]),
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
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={badgeCount ? `${label}, ${badgeCount} new` : label}
    >
      <Animated.View style={[styles.iconChip, chipAnimStyle]}>
        <Ionicons name={isActive ? activeIcon : icon} size={22} color={isActive ? colors.primary : colors.textSecondary} />
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
 * prop). Five equal tabs in one row — Home, Orders, Add, Production,
 * More — Add is a synthetic tab with no route of its own. Tapping Add
 * or More expands a panel upward, physically attached to the bar
 * inside the same rounded card (not a separate floating overlay, not a
 * Modal, no full-screen dim) — a spring animates the panel's height
 * from 0 to its measured natural height. Only one panel can be open at
 * a time; opening one closes the other.
 */
export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { navHidden, forceHiddenCount } = useScrollNav();

  // Guards every navigation triggered from this bar against rapid
  // double-taps — without this, tapping fast enough fires a second
  // press before `pathname` has updated from the first one, so the
  // "already here?" checks below don't catch it and you get a
  // duplicated screen.
  const lastNavAtRef = useRef(0);
  function navigateOnce(action: () => void) {
    const now = Date.now();
    if (now - lastNavAtRef.current < 500) return;
    lastNavAtRef.current = now;
    action();
  }

  // --- Unified expand panel (shared by Add and More) ---
  // `activePanel` is the single source of truth for which one (if
  // either) is open — a real navigation route is never involved, so
  // there's no scenario where both could be true, which is what
  // guarantees "Add and More cannot be open simultaneously" rather than
  // that being a rule enforced by extra checks.
  type PanelKind = 'add' | 'more' | null;
  const [activePanel, setActivePanel] = useState<PanelKind>(null);
  const [panelMounted, setPanelMounted] = useState<PanelKind>(null);
  const panelHeight = useSharedValue(0);
  const measuredHeightRef = useRef(0);

  function openPanel(kind: Exclude<PanelKind, null>) {
    if (activePanel === kind) {
      closePanel();
      return;
    }
    setPanelMounted(kind);
    setActivePanel(kind);
    // Height animates in once the freshly-mounted content reports its
    // real height via onLayout below (measuredHeightRef) — see the
    // useEffect that watches activePanel.
  }

  function closePanel() {
    setActivePanel(null);
    panelHeight.value = withSpring(0, motionSpring.gentle, (finished) => {
      if (finished) runOnJS(setPanelMounted)(null);
    });
  }

  // Kicks off the opening spring once the newly-mounted panel's content
  // has reported a real measured height. A one-frame lag between mount
  // and measurement is normal here and not visible in practice.
  useEffect(() => {
    if (activePanel && measuredHeightRef.current > 0) {
      panelHeight.value = withSpring(measuredHeightRef.current, motionSpring.gentle);
    }
  }, [activePanel]);

  function handlePanelContentLayout(height: number) {
    measuredHeightRef.current = height;
    if (activePanel) {
      panelHeight.value = withSpring(height, motionSpring.gentle);
    }
  }

  const panelClipStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
  }));

  // Android hardware back button closes whichever panel is open.
  useEffect(() => {
    if (!activePanel) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closePanel();
      return true;
    });
    return () => sub.remove();
  }, [activePanel]);

  const activeRouteName = state.routes[state.index]?.name ?? 'index';
  const addItems = getAddPanelItems(activeRouteName, pathname);

  function handleAddItemPress(item: PanelItem) {
    closePanel();
    if (!item.pathname) return; // not built yet — no-op, same convention as "Soon" rows
    if (pathname === item.pathname) {
      if (item.params) {
        navigateOnce(() => router.setParams(item.params as never));
      }
      return;
    }
    // Some Add-panel items (e.g. "Add ingredient") land on a top-level
    // destination's own route; others (e.g. "Add product" →
    // /more/products/new) land on a real detail/creation sub-screen.
    // Only the former should replace — see TOP_LEVEL_MORE_PATHS.
    const navigate = TOP_LEVEL_MORE_PATHS.has(item.pathname) ? router.replace : router.push;
    navigateOnce(() => navigate({ pathname: item.pathname, params: item.params } as never));
  }

  function handleMoreItemPress(item: PanelItem) {
    closePanel();
    if (!item.pathname) return;
    if (pathname.startsWith(item.pathname)) return; // already here
    // replace, not push: Ingredients/Products/Recipes/Settings are
    // peer top-level screens (same tier as Home/Orders/Production/More)
    // — switching between them must not grow the back stack, same as
    // switching tabs doesn't. Only navigation INTO a detail screen
    // (e.g. a specific product) should push. See the nav-rule note atop
    // this file's More-panel section and the matching fix in
    // more/index.tsx.
    navigateOnce(() => router.replace(item.pathname as never));
  }

  function handleRealTabPress(route: { key: string; name: string }, isFocused: boolean) {
    closePanel();
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }

  /**
   * Add is contextual per screen, not just per-panel-item like before:
   * - Home: opens the Quick Add panel (multiple actions to choose from).
   * - Orders: nothing to choose between — jump straight to New Order.
   * - Production: nothing to choose between — jump straight to the
   *   ingredient restock flow.
   * - Ingredients (any /more/ingredients route): nothing to choose
   *   between either — jump straight to Add ingredient instead of
   *   opening a panel with a single row to tap through.
   * - Anything else (other More sub-routes): falls back to the panel,
   *   same as before this change.
   */
  function handleAddTabPress() {
    if (activeRouteName === 'orders') {
      closePanel();
      // Phase 7 (Orders) has shipped — '/orders/new' is the real route,
      // confirmed against app/(tabs)/orders/new.tsx, matching the
      // convention this was originally written against.
      if (pathname === '/orders/new') return;
      navigateOnce(() => router.push('/orders/new' as never));
      return;
    }
    if (activeRouteName === 'production') {
      closePanel();
      // ASSUMPTION: Production has no single "active" ingredient to
      // restock directly, so this shortcuts to the Ingredients list
      // (same destination as the existing "Add ingredient" quick-add
      // item) rather than a specific ingredient's Restock sheet.
      if (pathname === '/more/ingredients') return;
      // replace: this jumps straight to the Ingredients top-level screen
      // from Production (another top-level screen) — same rule as the
      // More-panel switches, not a detail push.
      navigateOnce(() => router.replace('/more/ingredients' as never));
      return;
    }
    if (activeRouteName === 'more' && pathname.startsWith('/more/ingredients')) {
      // Ingredients only ever has one add action — jump straight to it
      // instead of opening a panel with a single row to tap through.
      handleAddItemPress({
        label: 'Add ingredient',
        icon: 'nutrition-outline',
        pathname: '/more/ingredients',
        params: { openAdd: '1' },
      });
      return;
    }
    if (activeRouteName === 'more' && pathname.startsWith('/more/products')) {
      // Same as Ingredients — Products only has one add action.
      handleAddItemPress({
        label: 'Add product',
        icon: 'cube-outline',
        pathname: '/more/products/new',
      });
      return;
    }
    openPanel('add');
  }

  const navAnimatedStyle = useAnimatedStyle(() => {
    const hidden = navHidden.value > 0 || forceHiddenCount.value > 0 ? 1 : 0;
    return {
      transform: [{ translateY: withTiming(hidden * 90, { duration: motionDuration.medium, easing: motionEasing.standard }) }],
      opacity: withTiming(hidden ? 0 : 1, { duration: motionDuration.medium, easing: motionEasing.standard }),
    };
  });

  const indexRoute = state.routes.find((r) => r.name === 'index')!;
  const ordersRoute = state.routes.find((r) => r.name === 'orders')!;
  const productionRoute = state.routes.find((r) => r.name === 'production')!;
  const moreRoute = state.routes.find((r) => r.name === 'more')!;
  const isIndexFocused = state.routes[state.index]?.key === indexRoute.key;
  const isOrdersFocused = state.routes[state.index]?.key === ordersRoute.key;
  const isProductionFocused = state.routes[state.index]?.key === productionRoute.key;
  const isMoreFocused = state.routes[state.index]?.key === moreRoute.key;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Invisible full-screen backdrop — closes whichever panel is open
          on any tap or scroll-drag anywhere above the nav/panel. Sized
          against THIS outer full-screen container, not `wrap` below
          (which only auto-sizes to the card's own height) — previously
          it only covered the panel's height, so taps/scrolls on real
          screen content (Ingredients, Products, etc.) never reached it.
          No visual scrim, per the "no backdrop covering the whole
          screen" requirement — this exists purely to catch the touch.
          Rendered before `wrap` so the nav bar/panel (rendered after,
          i.e. on top) still receives its own taps normally. */}
      {panelMounted ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={closePanel} accessibilityLabel="Close panel" />
      ) : null}

      <View style={styles.wrap} pointerEvents="box-none">
        <Animated.View style={navAnimatedStyle}>
          <View style={[styles.unifiedCard, { paddingBottom: insets.bottom }]}>
            {/* The panel and the tab row below share this one rounded
                card — no seam, no separate shadow, no floating card
                detached from the bar. Height-clipped wrapper; content
                inside reports its natural height via onLayout so the
                spring has a real target instead of an assumed one. */}
            <Animated.View style={[styles.panelClip, panelClipStyle]}>
              <View
                onLayout={(e) => handlePanelContentLayout(e.nativeEvent.layout.height)}
                style={styles.panelContent}
              >
                {panelMounted === 'add' ? (
                  <View style={styles.panelList}>
                    {addItems.length === 0 ? (
                      <Text style={styles.panelEmpty}>Nothing to add here.</Text>
                    ) : (
                      addItems.map((item, i) => (
                        <Pressable
                          key={item.label}
                          onPress={() => handleAddItemPress(item)}
                          style={({ pressed }) => [styles.panelRow, pressed && item.pathname && styles.panelRowPressed]}
                          disabled={!item.pathname}
                          accessibilityLabel={item.pathname ? item.label : `${item.label}, coming soon`}
                        >
                          <View style={[styles.panelRowIcon, !item.pathname && styles.panelRowIconDisabled]}>
                            <Ionicons name={item.icon} size={15} color={item.pathname ? colors.primary : colors.textSecondary} />
                          </View>
                          <Text
                            style={[
                              styles.panelRowLabel,
                              i === 0 && item.pathname && styles.panelRowLabelPrimary,
                              !item.pathname && styles.panelRowLabelDisabled,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {!item.pathname ? <Text style={styles.panelRowSoon}>Soon</Text> : null}
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : panelMounted === 'more' ? (
                  <View style={styles.panelList}>
                    {MORE_PANEL_ITEMS.map((item) => {
                      const isBuilt = !!item.pathname;
                      const isActive = isBuilt && pathname.startsWith(item.pathname!);
                      return (
                        <Pressable
                          key={item.label}
                          onPress={() => handleMoreItemPress(item)}
                          disabled={!isBuilt}
                          style={({ pressed }) => [styles.panelRow, pressed && isBuilt && styles.panelRowPressed]}
                          accessibilityLabel={isBuilt ? item.label : `${item.label}, coming soon`}
                        >
                          <View
                            style={[
                              styles.panelRowIcon,
                              isActive && { backgroundColor: `${colors.primary}22` },
                            ]}
                          >
                            <Ionicons
                              name={item.icon}
                              size={16}
                              color={isActive ? colors.primary : isBuilt ? colors.textPrimary : colors.textSecondary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.panelRowLabel,
                              isActive && styles.panelRowLabelPrimary,
                              !isBuilt && styles.panelRowLabelDisabled,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {!isBuilt ? <Text style={styles.panelRowSoon}>Soon</Text> : null}
                        </Pressable>
                      );
                    })}

                    <View style={styles.moreMenuDivider} />

                    <Pressable
                      onPress={() => {
                        closePanel();
                        if (pathname === '/more') return;
                        // replace: the More hub is a peer top-level screen
                        // too, not a detail of whichever destination you're
                        // leaving — same reasoning as handleMoreItemPress.
                        navigateOnce(() => router.replace('/more' as never));
                      }}
                      style={({ pressed }) => [styles.moreOptionsRow, pressed && styles.panelRowPressed]}
                      accessibilityLabel="See all"
                    >
                      <Text style={styles.moreOptionsLabel}>See all</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            {/* Five equal tabs, one row. Add has no route — it's purely
                a panel trigger (Home) or a direct-navigate shortcut
                (Orders/Production/Ingredients) — styled identically to
                the real tabs either way. */}
            <View style={styles.tabsRow}>
              <TabItem
                icon={TAB_META.index.icon}
                activeIcon={TAB_META.index.activeIcon}
                label={TAB_META.index.label}
                isActive={isIndexFocused}
                colors={colors}
                styles={styles}
                onPress={() => handleRealTabPress(indexRoute, isIndexFocused)}
              />
              <TabItem
                icon={TAB_META.orders.icon}
                activeIcon={TAB_META.orders.activeIcon}
                label={TAB_META.orders.label}
                isActive={isOrdersFocused}
                colors={colors}
                styles={styles}
                onPress={() => handleRealTabPress(ordersRoute, isOrdersFocused)}
              />
              <TabItem
                icon="add-outline"
                activeIcon="close"
                label="Add"
                isActive={activePanel === 'add'}
                colors={colors}
                styles={styles}
                onPress={handleAddTabPress}
              />
              <TabItem
                icon={TAB_META.production.icon}
                activeIcon={TAB_META.production.activeIcon}
                label={TAB_META.production.label}
                isActive={isProductionFocused}
                colors={colors}
                styles={styles}
                onPress={() => handleRealTabPress(productionRoute, isProductionFocused)}
              />
              <TabItem
                icon={TAB_META.more.icon}
                activeIcon={TAB_META.more.activeIcon}
                label={TAB_META.more.label}
                isActive={isMoreFocused}
                chipActive={activePanel === 'more' || isMoreFocused}
                colors={colors}
                styles={styles}
                onPress={() => openPanel('more')}
              />
            </View>
          </View>
        </Animated.View>
      </View>
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
    // The single unified card — panel and tab row live inside this one
    // rounded container with no seam between them, per the reference:
    // "feel like a single unified component," not a floating card above
    // a separate bar.
    unifiedCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    panelClip: {
      overflow: 'hidden',
    },
    // Absolutely positioned within panelClip so its onLayout-reported
    // height reflects its natural full size regardless of the parent
    // clip's current animated height (RN still computes child layout
    // even while a clipping ancestor's height is smaller/zero).
    panelContent: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      // Distinct surface tone from unifiedCard's base background so the
      // expanded panel reads as its own elevated sheet, not just a
      // continuation of the tab row below it.
  
    },
    panelList: {
      padding: spacing.md,
    },
    panelEmpty: {
      ...typography.bodySm,
      color: colors.textSecondary,
      paddingVertical: spacing.md,
      textAlign: 'center',
    },
    panelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      minHeight: 44,
    },
    panelRowPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    panelRowIcon: {
      width: 26,
      height: 26,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelRowIconDisabled: {
      backgroundColor: colors.surfaceMuted,
    },
    panelRowLabel: {
      ...typography.bodySm,
      color: colors.textPrimary,
      flex: 1,
    },
    panelRowLabelPrimary: {
      fontWeight: '600',
    },
    panelRowLabelDisabled: {
      color: colors.textSecondary,
    },
    panelRowSoon: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    moreMenuDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
      marginHorizontal: spacing.sm,
    },
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
    tabsRow: {
      flexDirection: 'row',
      paddingTop: spacing.sm,
      // Thin divider so the tab row reads as clearly separate from the
      // expanded panel above it, instead of the two blending together.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    tabButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.xs,
    },
    // Wraps just the icon so the highlight can never intrude into the
    // label below.
    iconChip: {
      width: 52,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
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
  });
}
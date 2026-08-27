import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../src/components/FloatingTabBar';
import { ScrollNavProvider } from '../../src/contexts/ScrollNavContext';
import { useThemeColors } from '../../src/theme/ThemeContext';

/**
 * 4 visible tabs (Home · Orders · Production · More) plus 4 more that
 * exist in this navigator but are hidden from FloatingTabBar's row and
 * reached only via the More panel/hub: Ingredients, Products, Recipes,
 * Settings (Appearance for now — see moreMenu.ts). See
 * docs/DECISIONS.md's 2026-08-19 entry and docs/UI_UX_1.md section G
 * for the visible-row reasoning, and the navigation-architecture entry
 * for why the More-panel destinations are real tabs rather than routes
 * nested under "more".
 *
 * That's the crux of the app's navigation architecture: every
 * top-level destination — visible or hidden-behind-More — is a sibling
 * <Tabs.Screen>, not a Stack.Screen pushed on top of another route.
 * Switching between top-level destinations is always a TAB SWITCH,
 * which React Navigation gives us for free: each tab keeps its own
 * independent internal Stack (so a section's drill-down state survives
 * switching away and back), and switching tabs never adds to some
 * shared cross-section back stack the way nested Stack pushes would.
 * Only genuine drill-down screens (Ingredient Detail, Product Detail,
 * Recipe Instructions, etc.) live inside a tab's own Stack and use
 * normal push/pop back navigation.
 *
 * Adding a future top-level destination (Expenses, Reports, Storefront,
 * ...) means adding another <Tabs.Screen> here plus an entry in
 * src/constants/moreMenu.ts — nothing else needed for it to inherit
 * this same back-stack behavior automatically.
 *
 * `backBehavior="initialRoute"` keeps the hardware/gesture back button
 * from hopping through previously-visited tabs one at a time (React
 * Navigation's tab-navigator default, `backBehavior="history"`, would
 * do exactly that — e.g. Ingredients → Products → back → Ingredients —
 * which is the same back-stack pollution this whole structure exists
 * to avoid, just triggered by the hardware button instead of a tap).
 * With "initialRoute", back from any secondary tab always goes
 * straight to Home in one step. A tab's own Stack still pops normally
 * first if it has a drill-down screen on top — this only kicks in once
 * that tab is at its root.
 *
 * ScrollNavProvider wraps <Tabs> so the same shared scroll-visibility
 * value is available to every screen inside every tab (via
 * useHideNavOnScroll) and to FloatingTabBar itself.
 */
export default function TabsLayout() {
  const { colors } = useThemeColors();

  return (
    <ScrollNavProvider>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          headerShown: false,
          // Same white-flash cause as Stack's contentStyle, one layer up:
          // Tabs' own scene container defaults to white, and every tab's
          // content sits on top of it during any transition.
          sceneStyle: { backgroundColor: colors.background },
        }}
        tabBar={(props) => <FloatingTabBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
        <Tabs.Screen name="production" options={{ title: 'Production' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
        {/* Hidden from the visible row — reached via the More panel/hub
            (see MORE_MENU_ITEMS / MORE_PANEL_ITEMS) — but still real
            sibling tabs, which is what gives each of them its own
            independent back stack. */}
        <Tabs.Screen name="ingredients" options={{ title: 'Ingredients', href: null }} />
        <Tabs.Screen name="products" options={{ title: 'Products', href: null }} />
        <Tabs.Screen name="recipes" options={{ title: 'Recipes', href: null }} />
        <Tabs.Screen name="appearance" options={{ title: 'Settings', href: null }} />
      </Tabs>
    </ScrollNavProvider>
  );
}

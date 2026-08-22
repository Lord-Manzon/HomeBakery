import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../src/components/FloatingTabBar';
import { ScrollNavProvider } from '../../src/contexts/ScrollNavContext';
import { useThemeColors } from '../../src/theme/ThemeContext';

/**
 * 4-tab layout (Home · Orders · Production · More) with a custom floating
 * tabBar — replaces the previous fixed 5-tab bar (Ingredients folded into
 * More). See docs/DECISIONS.md's 2026-08-19 entry and docs/UI_UX_1.md
 * section G for the full reasoning.
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
        screenOptions={{
          headerShown: false,
          // Same white-flash cause as Stack's contentStyle, one layer up:
          // Tabs' own scene container defaults to white, and every tab's
          // content (including More's whole nested Ingredients stack)
          // sits on top of it during any transition.
          sceneStyle: { backgroundColor: colors.background },
        }}
        tabBar={(props) => <FloatingTabBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
        <Tabs.Screen name="production" options={{ title: 'Production' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
    </ScrollNavProvider>
  );
}

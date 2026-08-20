import { createContext, useContext, useMemo, useRef } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * Drives the floating tab pill + FAB's show/hide-on-scroll behavior (see
 * docs/DECISIONS.md's 2026-08-19 "floating pill nav + FAB with
 * scroll-to-hide" entry). One shared value, provided once above the
 * <Tabs> navigator in app/(tabs)/_layout.tsx, read by FloatingTabBar and
 * written to by any scrollable screen via useHideNavOnScroll().
 *
 * `navHidden` is 0 (visible) or 1 (hidden) — not a raw scroll offset —
 * so FloatingTabBar's animated style only has to interpolate between two
 * states, and multiple screens can drive the same value without needing
 * to agree on absolute scroll positions.
 */
type ScrollNavContextValue = {
  navHidden: SharedValue<number>;
};

const ScrollNavContext = createContext<ScrollNavContextValue | null>(null);

export function ScrollNavProvider({ children }: { children: React.ReactNode }) {
  const navHidden = useSharedValue(0);
  const value = useMemo(() => ({ navHidden }), [navHidden]);
  return <ScrollNavContext.Provider value={value}>{children}</ScrollNavContext.Provider>;
}

export function useScrollNav(): ScrollNavContextValue {
  const ctx = useContext(ScrollNavContext);
  if (!ctx) {
    throw new Error('useScrollNav must be used inside a ScrollNavProvider');
  }
  return ctx;
}

/**
 * Ref-based "last offset" per screen — kept out of the shared context
 * since each screen's own scroll position is independent; only the
 * derived hidden/visible boolean is shared.
 */
export function useLastScrollOffsetRef() {
  return useRef(0);
}

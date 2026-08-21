import { createContext, useContext, useMemo, useRef } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * Drives the floating tab pill + FAB's show/hide behavior — both the
 * scroll-driven hide (see docs/DECISIONS.md's 2026-08-19 entry) and the
 * route-driven hide for full-screen forms (see the 2026-08-21 entry).
 * One provider above the <Tabs> navigator in app/(tabs)/_layout.tsx.
 *
 * `navHidden` is 0 (visible) or 1 (hidden) — not a raw scroll offset —
 * so FloatingTabBar's animated style only has to interpolate between two
 * states, and multiple screens can drive the same value without needing
 * to agree on absolute scroll positions.
 *
 * `forceHiddenCount` is a mount-count, not a boolean: React Navigation
 * can keep a previous screen mounted underneath a newly pushed one, so a
 * plain boolean set on mount/unset on unmount could flip back to
 * "visible" while a different full-screen route is still on top. Any
 * count > 0 means at least one full-screen route wants the nav hidden.
 */
type ScrollNavContextValue = {
  navHidden: SharedValue<number>;
  forceHiddenCount: SharedValue<number>;
};

const ScrollNavContext = createContext<ScrollNavContextValue | null>(null);

export function ScrollNavProvider({ children }: { children: React.ReactNode }) {
  const navHidden = useSharedValue(0);
  const forceHiddenCount = useSharedValue(0);
  const value = useMemo(() => ({ navHidden, forceHiddenCount }), [navHidden, forceHiddenCount]);
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
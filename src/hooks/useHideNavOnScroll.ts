import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useScrollNav } from '../contexts/ScrollNavContext';

// Ignore scroll noise smaller than this (px) before deciding a direction
// — without it, tiny bounce/rubber-band deltas near the top of the list
// flicker the nav in and out.
const DIRECTION_THRESHOLD = 8;
// Always show the nav once scrolled back within this many px of the top,
// even without a clear "scroll up" gesture — matches the mockup's
// behavior and avoids the nav staying hidden right at the top of a list.
const TOP_SNAP_ZONE = 24;

/**
 * Attach to any FlatList/ScrollView's `onScroll` (with
 * `scrollEventThrottle={16}`) to drive the floating tab pill + FAB's
 * show/hide behavior. Runs on the UI thread via Reanimated's worklet —
 * see docs/DECISIONS.md's 2026-08-19 entry.
 *
 * Usage:
 *   const onScroll = useHideNavOnScroll();
 *   <FlatList onScroll={onScroll} scrollEventThrottle={16} ... />
 */
export function useHideNavOnScroll() {
  const { navHidden } = useScrollNav();
  const lastY = useSharedValue(0);

  return useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      const delta = y - lastY.value;
      lastY.value = y;

      if (y <= TOP_SNAP_ZONE) {
        navHidden.value = 0;
        return;
      }
      if (delta > DIRECTION_THRESHOLD) {
        navHidden.value = 1; // scrolling down — hide
      } else if (delta < -DIRECTION_THRESHOLD) {
        navHidden.value = 0; // scrolling up — show
      }
    },
  });
}

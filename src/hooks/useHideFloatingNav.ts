import { useEffect } from 'react';
import { useScrollNav } from '../contexts/ScrollNavContext';

/**
 * Call once at the top of a full-screen, single-purpose route (a form
 * like New Product, New Recipe, Restock — not a list or detail/browse
 * screen) to hide the floating pill nav + FAB while that screen is
 * mounted. See docs/DECISIONS.md's 2026-08-21 entry and
 * docs/UI_UX_1.md section G for which screens this applies to.
 *
 * Usage:
 *   export default function NewProductScreen() {
 *     useHideFloatingNav();
 *     ...
 *   }
 */
export function useHideFloatingNav() {
  const { forceHiddenCount } = useScrollNav();

  useEffect(() => {
    forceHiddenCount.value += 1;
    return () => {
      forceHiddenCount.value -= 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
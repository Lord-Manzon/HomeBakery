import { useCallback, useRef } from 'react';
import { useFocusEffect, usePathname } from 'expo-router';
import { useScrollNav } from '../contexts/ScrollNavContext';

export function useHideFloatingNav() {
  const { forceHiddenCount } = useScrollNav();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useFocusEffect(
    useCallback(() => {
      forceHiddenCount.value += 1;
      console.log('[nav-debug] FOCUS', pathnameRef.current, '→ count =', forceHiddenCount.value);
      return () => {
        forceHiddenCount.value -= 1;
        console.log('[nav-debug] BLUR ', pathnameRef.current, '→ count =', forceHiddenCount.value);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forceHiddenCount])
  );
}
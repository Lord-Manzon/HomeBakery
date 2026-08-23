import { useRef } from 'react';
import { useRouter } from 'expo-router';

/**
 * Wraps router.push with a short lock so a fast double-tap on a card/row
 * (common on a phone, easy to do while a baker's other hand is full)
 * can't fire two pushes before the first one registers — which stacks a
 * duplicate copy of the destination screen on the nav stack. Debounces
 * on a fixed timer rather than a navigation-finished event, since Expo
 * Router doesn't expose a simple "push settled" signal to key off of
 * (per docs/ARCHITECTURE.md, no direct @react-navigation/* imports).
 * Surfaced first by the Recipe detail screen's "Used in" list, but the
 * same fast-double-tap risk applies to any Pressable that calls
 * router.push, so this is written to be reused wherever that comes up
 * next rather than fixed as a one-off.
 */
export function useNavigateOnce(lockMs: number = 800) {
  const router = useRouter();
  const locked = useRef(false);

  return (href: string) => {
    if (locked.current) return;
    locked.current = true;
    router.push(href);
    setTimeout(() => {
      locked.current = false;
    }, lockMs);
  };
}
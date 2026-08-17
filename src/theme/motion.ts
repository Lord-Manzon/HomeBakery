import { Easing } from 'react-native-reanimated';

/**
 * Motion design tokens — same idea as spacing.ts/typography.ts/colors.ts:
 * a shared vocabulary so animation timing doesn't drift screen-by-screen.
 * Built on react-native-reanimated (already a dependency, pulled in by
 * Expo Router — see docs/DECISIONS.md's 2026-08-17 "Motion design token
 * system" entry for why Reanimated was chosen over the core `Animated`
 * API that BottomSheet.tsx historically used).
 *
 * Usage pattern in a component:
 *   import { withTiming } from 'react-native-reanimated';
 *   import { motionDuration, motionEasing } from '../theme';
 *   scale.value = withTiming(0.96, {
 *     duration: motionDuration.fast,
 *     easing: motionEasing.standard,
 *   });
 */

/**
 * Durations in milliseconds.
 * - instant: micro feedback that must feel immediate — checkbox/chip
 *   toggles, a value flipping on screen.
 * - fast: button/row press feedback — the "give" the person asked for
 *   when tapping something.
 * - medium: sheets appearing/dismissing, screen transitions, anything
 *   the person watches happen rather than just feels.
 * - slow: reserved for rare, larger transitions (e.g. a full-screen
 *   success state) — using this for anything routine will read as
 *   sluggish, not polished.
 */
export const motionDuration = {
  instant: 100,
  fast: 150,
  medium: 250,
  slow: 350,
} as const;

/**
 * Easing curves, as raw cubic-bezier control points — [x1, y1, x2, y2] —
 * rather than a pre-built Easing object. Reanimated's `Easing.bezier()`
 * and React Native core's `Easing.bezier()` (from 'react-native') are
 * DIFFERENT, incompatible objects even though both accept the same
 * 4-number signature — exporting raw numbers here lets either engine
 * build its own compatible curve from one shared source, instead of
 * this file silently locking every consumer into Reanimated.
 * (BottomSheet.tsx's drag-to-dismiss is intentionally staying on core
 * `Animated` + PanResponder rather than being rewritten onto Reanimated
 * — see docs/DECISIONS.md's 2026-08-17 entry for why; it still draws
 * its timing numbers from this same file.)
 *
 * Usage:
 *   Reanimated:  Easing.bezier(...motionEasingCurve.standard)
 *     (import { Easing } from 'react-native-reanimated')
 *   Core RN:     Easing.bezier(...motionEasingCurve.standard)
 *     (import { Easing } from 'react-native')
 *
 * - standard: default for most transitions — starts and ends smoothly.
 * - decelerate: entrances (something arriving on screen) — starts fast,
 *   settles gently, feels responsive rather than abrupt.
 * - accelerate: exits (something leaving the screen) — starts slow,
 *   speeds away, so a dismissal doesn't linger.
 */
export const motionEasingCurve = {
  standard: [0.4, 0.0, 0.2, 1] as const,
  decelerate: [0.0, 0.0, 0.2, 1] as const,
  accelerate: [0.4, 0.0, 1, 1] as const,
} as const;

/**
 * Pre-built Reanimated Easing objects, for components already using
 * Reanimated (the standard going forward per the 2026-08-17 decision) —
 * saves every call site from re-spreading motionEasingCurve.standard
 * into Easing.bezier() itself. NOT usable with core RN's `Animated` API
 * — see motionEasingCurve above if you need that.
 */
export const motionEasing = {
  standard: Easing.bezier(...motionEasingCurve.standard),
  decelerate: Easing.bezier(...motionEasingCurve.decelerate),
  accelerate: Easing.bezier(...motionEasingCurve.accelerate),
} as const;

/**
 * Spring configs for gesture-driven or "settle into place" motion (e.g.
 * a bottom sheet's drag-to-dismiss releasing back to its resting
 * position). Springs are preferred over timing curves specifically for
 * anything that responds to a drag, since they can start from whatever
 * velocity the gesture left off with — a timing curve can't do that
 * without looking like it snapped.
 */
export const motionSpring = {
  // General-purpose settle: sheets, cards returning to place. Slight
  // overshoot reads as "alive" without feeling bouncy/toy-like.
  gentle: { damping: 18, stiffness: 180, mass: 1 },
  // Snappier, near-zero overshoot — for small UI (chips, checkmarks)
  // where a visible bounce would look like a glitch rather than polish.
  crisp: { damping: 22, stiffness: 260, mass: 0.9 },
} as const;

/**
 * Per-item delay (ms) for staggering list entrance animations — e.g.
 * product/ingredient cards fading/sliding in one after another instead
 * of all at once. Multiply by index, and clamp how many items actually
 * get staggered (see motionStagger.maxStaggeredItems) — staggering a
 * 50-row list makes the last rows visibly late rather than delightful.
 */
export const motionStagger = {
  listItem: 30,
  maxStaggeredItems: 8,
} as const;

export type MotionDurationToken = keyof typeof motionDuration;
export type MotionEasingToken = keyof typeof motionEasing;
export type MotionSpringToken = keyof typeof motionSpring;

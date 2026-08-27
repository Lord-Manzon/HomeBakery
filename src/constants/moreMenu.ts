import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

export type MoreMenuItem = {
  label: string;
  icon: IconName;
  /** Omit for destinations not built yet — the item then renders
   * disabled with a "Soon" badge wherever it's shown, and is
   * automatically excluded from the trimmed popup (see
   * FloatingTabBar.tsx), since only items with a real pathname belong
   * on the fast path. Add the pathname here — nowhere else — once a
   * destination is built, and it shows up in both places
   * automatically. */
  pathname?: string;
};

// Single ordered list. The trimmed "More" popup shows only the items
// with a pathname (today: Ingredients, Products, Recipes, Settings);
// the full /more screen shows all of them, in this order, with "Soon"
// on the ones still missing a pathname. One list, two views — nothing
// to keep in sync by hand as more phases get built.
export const MORE_MENU_ITEMS: MoreMenuItem[] = [
  { label: 'Ingredients', icon: 'nutrition-outline', pathname: '/ingredients' },
  { label: 'Products', icon: 'cube-outline', pathname: '/products' },
  { label: 'Recipes', icon: 'book-outline', pathname: '/recipes' },
  // Interim: only Appearance exists so far under what will become a
  // proper Settings hub (currency, etc. come later). Point Settings
  // straight at it for now — swap this one pathname once a real
  // settings/index hub screen exists.
  { label: 'Settings', icon: 'settings-outline', pathname: '/appearance' },
  { label: 'Expenses', icon: 'wallet-outline' }, // not built yet
  { label: 'Reports', icon: 'bar-chart-outline' }, // not built yet
  { label: 'Storefront', icon: 'storefront-outline' }, // not built yet
  { label: 'Subscription', icon: 'card-outline' }, // not built yet
  { label: 'Account', icon: 'person-outline' }, // not built yet
];
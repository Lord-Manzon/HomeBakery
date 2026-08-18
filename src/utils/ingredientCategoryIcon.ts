import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { IngredientCategory } from '../types/ingredient';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Icon shown per category on the Ingredients list, the gauge cards, and
 * the category picker in IngredientFormSheet. Ionicons only (the app's
 * icon set, per docs/UI_UX.md's Iconography section) — outline variants
 * to match the rest of the flat, warm aesthetic.
 */
const CATEGORY_ICONS: Record<IngredientCategory, IoniconName> = {
  'Dry goods': 'nutrition-outline',
  Dairy: 'water-outline',
  Flavoring: 'flask-outline',
  Packaging: 'cube-outline',
  Other: 'ellipsis-horizontal',
};

const DEFAULT_ICON: IoniconName = 'nutrition-outline';

export function getCategoryIcon(category: string | null): IoniconName {
  if (category && category in CATEGORY_ICONS) {
    return CATEGORY_ICONS[category as IngredientCategory];
  }
  return DEFAULT_ICON;
}

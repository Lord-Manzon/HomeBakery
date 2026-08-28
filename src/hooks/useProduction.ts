import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getProductionSourceItems,
  getProductionSourceItemsAfter,
  setProductionRowStatus,
} from '../services/production';
import type { ProductionSourceItem } from '../services/productionLogic';
import type { ProductionStatus } from '../types/order';

const productionDateKey = (date: string) => ['production', 'date', date] as const;
const productionAfterKey = (dateExclusive: string) => ['production', 'after', dateExclusive] as const;

export function useProductionForDate(date: string) {
  return useQuery({ queryKey: productionDateKey(date), queryFn: () => getProductionSourceItems(date) });
}

/** Powers the "Upcoming" tab -- everything strictly after `dateExclusive`
 * (the screen passes tomorrow's date, so results start the day after). */
export function useProductionAfter(dateExclusive: string) {
  return useQuery({
    queryKey: productionAfterKey(dateExclusive),
    queryFn: () => getProductionSourceItemsAfter(dateExclusive),
  });
}

/**
 * Checks/unchecks one checklist row. `items` are that row's own
 * underlying order_items (id/quantity/recipe data), already sitting in
 * whichever Today/Tomorrow/Upcoming query populated the screen -- no
 * separate fetch needed here (see production.ts's setProductionRowStatus,
 * which deducts/reverses immediately per row rather than waiting for the
 * whole day, per the 2026-08-28 decision superseding the earlier gate).
 * `autoDeductEnabled` comes from the baker's own profile
 * (bakers.auto_deduct_inventory) -- the calling screen reads it via
 * useBakerProfile() and passes it through, same pattern as
 * markOrderPaid's paymentMethod argument in useOrders.ts.
 */
export function useSetProductionRowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      items,
      newStatus,
      autoDeductEnabled,
    }: {
      items: Pick<ProductionSourceItem, 'orderItemId' | 'quantity' | 'recipePortion' | 'recipeIngredients'>[];
      newStatus: ProductionStatus;
      autoDeductEnabled: boolean;
    }) => setProductionRowStatus(items, newStatus, autoDeductEnabled),
    onSuccess: () => {
      // A toggle can affect this date's list, the Upcoming range, AND
      // ingredient stock (if auto-deduction just fired) -- invalidate all
      // three broadly rather than guessing one narrow key, same
      // reasoning as useOrders.ts's ordersBaseKey invalidation.
      queryClient.invalidateQueries({ queryKey: ['production'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getProductionSourceItems,
  getProductionSourceItemsAfter,
  setProductionRowStatus,
} from '../services/production';
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
 * Checks/unchecks one checklist row. `autoDeductEnabled` comes from the
 * baker's own profile (bakers.auto_deduct_inventory) -- the calling
 * screen reads it via useBakerProfile() and passes it through, same
 * pattern as markOrderPaid's paymentMethod argument in useOrders.ts.
 */
export function useSetProductionRowStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderItemIds,
      newStatus,
      scheduledDate,
      autoDeductEnabled,
    }: {
      orderItemIds: string[];
      newStatus: ProductionStatus;
      scheduledDate: string;
      autoDeductEnabled: boolean;
    }) => setProductionRowStatus(orderItemIds, newStatus, scheduledDate, autoDeductEnabled),
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

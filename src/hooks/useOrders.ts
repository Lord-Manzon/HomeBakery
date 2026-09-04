import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  getOrder,
  getOrders,
  hasAnyOrders,
  markOrderDelivered,
  markOrderPaid,
  rescheduleOrder,
  revertOrderDelivered,
  revertOrderPaid,
  updateOrder,
} from '../services/orders';
import { productionBaseKey } from './useProduction';
import type { Order, OrderRefineFilters, OrderTab } from '../types/order';
import type { OrderFormInput } from '../utils/validation/orderSchemas';

const ordersBaseKey = ['orders'] as const;
const ordersListKey = (tab: OrderTab, refine: OrderRefineFilters = {}) =>
  ['orders', 'list', tab, refine] as const;
const orderDetailKey = (id: string) => ['orders', 'detail', id] as const;

// staleTime carried over from the earlier prefetch/caching fix (Step 16)
// -- unchanged in spirit, just living alongside the new tab+refine args.
export function useOrders(tab: OrderTab, refine: OrderRefineFilters = {}) {
  return useQuery({
    queryKey: ordersListKey(tab, refine),
    queryFn: () => getOrders(tab, refine),
    staleTime: 60 * 1000,
  });
}

export function useOrder(id: string) {
  return useQuery({ queryKey: orderDetailKey(id), queryFn: () => getOrder(id), enabled: !!id });
}

// Shares the ['orders'] prefix, so every mutation below already
// invalidates this alongside the tab lists -- no separate invalidation
// needed.
export function useHasAnyOrders() {
  return useQuery({ queryKey: [...ordersBaseKey, 'hasAny'], queryFn: hasAnyOrders, staleTime: 60 * 1000 });
}

// Every mutation below invalidates the whole `['orders']` prefix (all 4
// list filters + any open order detail) instead of just one -- a single
// order change (a new order, a status flip, a delete) can move it in or
// out of more than one filter at once (e.g. Today AND Unpaid), so a
// narrower invalidation risks leaving some other open list stale.
//
// Every one of these ALSO invalidates `['production']` (see
// useProduction.ts's productionBaseKey): Production's checklist is
// entirely derived from orders/order_items, but its query keys live in
// a different namespace, so it was never automatically refreshed by
// these. Fixed 2026-08-30 -- a new order (or any other order change)
// wasn't showing up in Production until the app was force-restarted and
// got a fresh, unstale cache.

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderFormInput) => createOrder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

export function useUpdateOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderFormInput) => updateOrder(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

export function useMarkOrderDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: Pick<Order, 'id' | 'status' | 'payment_status'>) => markOrderDelivered(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

export function useMarkOrderPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      order,
      paymentMethod,
    }: {
      order: Pick<Order, 'id' | 'status'>;
      paymentMethod: string;
    }) => markOrderPaid(order, paymentMethod),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

// Undo counterparts to the two mutations above -- see
// src/services/orderLogic.ts's resolveStatusAfterReverting doc comment
// for how each dimension (delivered/paid) reverts independently.

export function useRevertOrderDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: Pick<Order, 'id' | 'status'>) => revertOrderDelivered(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

export function useRevertOrderPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: Pick<Order, 'id' | 'status'>) => revertOrderPaid(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: Pick<Order, 'id' | 'status'>) => cancelOrder(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}

// Also invalidates Production -- scheduled_date is exactly what
// Production groups by, so rescheduling can move an order's items into
// or out of Production's Today/Tomorrow/Upcoming view too.
export function useRescheduleOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newDate }: { id: string; newDate: string }) => rescheduleOrder(id, newDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
      queryClient.invalidateQueries({ queryKey: productionBaseKey });
    },
  });
}
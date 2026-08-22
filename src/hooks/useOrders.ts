import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  getOrder,
  getOrders,
  markOrderDelivered,
  markOrderPaid,
  updateOrder,
} from '../services/orders';
import type { Order, OrderListFilter } from '../types/order';
import type { OrderFormInput } from '../utils/validation/orderSchemas';

const ordersBaseKey = ['orders'] as const;
const ordersListKey = (filter: OrderListFilter) => ['orders', 'list', filter] as const;
const orderDetailKey = (id: string) => ['orders', 'detail', id] as const;

export function useOrders(filter: OrderListFilter) {
  return useQuery({ queryKey: ordersListKey(filter), queryFn: () => getOrders(filter) });
}

export function useOrder(id: string) {
  return useQuery({ queryKey: orderDetailKey(id), queryFn: () => getOrder(id), enabled: !!id });
}

// Every mutation below invalidates the whole `['orders']` prefix (all 4
// list filters + any open order detail) instead of just one -- a single
// order change (a new order, a status flip, a delete) can move it in or
// out of more than one filter at once (e.g. Today AND Unpaid), so a
// narrower invalidation risks leaving some other open list stale.

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderFormInput) => createOrder(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
    },
  });
}

export function useUpdateOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderFormInput) => updateOrder(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
    },
  });
}

export function useMarkOrderDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: Pick<Order, 'id' | 'status' | 'payment_status'>) => markOrderDelivered(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
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
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: Pick<Order, 'id' | 'status'>) => cancelOrder(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersBaseKey });
    },
  });
}
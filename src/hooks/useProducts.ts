import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProduct,
  createVariant,
  deactivateProduct,
  deactivateVariant,
  getProduct,
  getProducts,
  getVariants,
  setDefaultVariant,
  updateProduct,
  updateVariant,
} from '../services/products';
import type { ProductFormInput, VariantFormInput } from '../utils/validation/productSchemas';

const productsKey = ['products'] as const;
const productKey = (id: string) => ['products', id] as const;
const variantsKey = (productId: string) => ['products', productId, 'variants'] as const;

export function useProducts() {
  return useQuery({ queryKey: productsKey, queryFn: getProducts });
}

export function useProduct(id: string) {
  return useQuery({ queryKey: productKey(id), queryFn: () => getProduct(id), enabled: !!id });
}

export function useVariants(productId: string) {
  return useQuery({
    queryKey: variantsKey(productId),
    queryFn: () => getVariants(productId),
    enabled: !!productId,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductFormInput) => createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductFormInput) => updateProduct(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(productKey(id), data);
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useCreateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VariantFormInput) => createVariant(productId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: VariantFormInput }) =>
      updateVariant(variantId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

export function useSetDefaultVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => setDefaultVariant(productId, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
    },
  });
}

export function useDeactivateVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => deactivateVariant(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: variantsKey(productId) });
      queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
}

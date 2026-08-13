import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { completeOnboarding, getBakerProfile, updateBakerProfile } from '../services/bakers';
import { useAuth } from './useAuth';

const bakerProfileKey = ['bakerProfile'] as const;

export function useBakerProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: bakerProfileKey,
    queryFn: getBakerProfile,
    enabled: !!session,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (data) => queryClient.setQueryData(bakerProfileKey, data),
  });
}

export function useUpdateBakerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBakerProfile,
    onSuccess: (data) => queryClient.setQueryData(bakerProfileKey, data),
  });
}

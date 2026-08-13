import { supabase } from './supabase';
import type { Baker } from '../types/baker';

/** Fetches the current user's baker profile. RLS guarantees it's theirs. */
export async function getBakerProfile(): Promise<Baker> {
  const { data, error } = await supabase.from('bakers').select('*').single();
  if (error) throw error;
  return data as Baker;
}

export type OnboardingInput = {
  business_name: string;
  currency: string;
  timezone: string;
};

export async function completeOnboarding(input: OnboardingInput): Promise<Baker> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('No authenticated user.');

  const { data, error } = await supabase
    .from('bakers')
    .update(input)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Baker;
}

export async function updateBakerProfile(input: Partial<OnboardingInput>): Promise<Baker> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('No authenticated user.');

  const { data, error } = await supabase
    .from('bakers')
    .update(input)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Baker;
}

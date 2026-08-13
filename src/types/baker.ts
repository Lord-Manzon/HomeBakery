export type Baker = {
  id: string;
  business_name: string | null;
  currency: string;
  timezone: string;
  default_margin_percent: number;
  created_at: string;
  updated_at: string;
};

/** True once the baker has completed onboarding. */
export function hasCompletedOnboarding(baker: Baker | null | undefined): boolean {
  return !!baker?.business_name;
}

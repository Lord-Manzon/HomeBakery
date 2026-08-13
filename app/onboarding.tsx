import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { FormField } from '../src/components/FormField';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { useCompleteOnboarding } from '../src/hooks/useBakerProfile';
import { colors, spacing, typography } from '../src/theme';
import { onboardingSchema, type OnboardingFormData } from '../src/utils/validation/authSchemas';

export default function OnboardingScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const completeOnboarding = useCompleteOnboarding();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { currency: 'PHP', timezone: 'Asia/Manila' },
  });

  const onSubmit = async (data: OnboardingFormData) => {
    setServerError(null);
    try {
      await completeOnboarding.mutateAsync(data);
      // Root layout's redirect logic sends the baker to Home once
      // business_name is set — nothing to navigate here.
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Tell us about your bakery</Text>
        <Text style={styles.subtitle}>
          You can change any of this later in Account. Pricing defaults come later too.
        </Text>

        {serverError ? <ErrorBanner message={serverError} /> : null}

        <Controller
          control={control}
          name="business_name"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Business name"
              placeholder="e.g. Nina's Home Bakes"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.business_name?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="currency"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Currency"
              placeholder="PHP"
              autoCapitalize="characters"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.currency?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="timezone"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Timezone"
              placeholder="Asia/Manila"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.timezone?.message}
            />
          )}
        />

        <PrimaryButton
          title="Get started"
          onPress={handleSubmit(onSubmit)}
          isLoading={completeOnboarding.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.displaySm, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xxl },
});

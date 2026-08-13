import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { sendPasswordReset } from '../../src/services/auth';
import { colors, spacing, typography } from '../../src/theme';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormData,
} from '../../src/utils/validation/authSchemas';

export default function ForgotPasswordScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await sendPasswordReset(data.email);
      setSent(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          If an account exists for that address, a reset link is on its way.
        </Text>
        <Link href="/(auth)/log-in" style={styles.link}>
          Back to log in
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>We'll email you a link to set a new one.</Text>

        {serverError ? <ErrorBanner message={serverError} /> : null}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Email"
              placeholder="you@example.com"
              keyboardType="email-address"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.email?.message}
            />
          )}
        />

        <PrimaryButton
          title="Send reset link"
          onPress={handleSubmit(onSubmit)}
          isLoading={isSubmitting}
        />

        <View style={styles.footerRow}>
          <Link href="/(auth)/log-in" style={styles.link}>
            Back to log in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  center: { alignItems: 'center', textAlign: 'center' },
  title: {
    ...typography.displaySm,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  footerRow: { alignItems: 'center', marginTop: spacing.xl },
  link: { ...typography.body, color: colors.primary, fontWeight: '600' },
});

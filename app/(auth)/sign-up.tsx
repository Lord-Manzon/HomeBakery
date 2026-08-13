import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { signUpWithEmail } from '../../src/services/auth';
import { colors, spacing, typography } from '../../src/theme';
import { signUpSchema, type SignUpFormData } from '../../src/utils/validation/authSchemas';

export default function SignUpScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpFormData>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = async (data: SignUpFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const result = await signUpWithEmail(data.email, data.password);
      // If email confirmation is required (Supabase default), there's no
      // session yet — tell the baker to check their inbox instead of
      // silently doing nothing.
      if (!result.session) {
        setConfirmationSent(true);
      }
      // If confirmation is off, the session appears immediately and the
      // root layout's redirect logic takes it from here.
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link. Tap it, then come back and log in.
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
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Set up HomeBakery for your business.</Text>

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

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Password"
              placeholder="At least 8 characters"
              secureTextEntry
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <FormField
              label="Confirm password"
              placeholder="••••••••"
              secureTextEntry
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.confirmPassword?.message}
            />
          )}
        />

        <PrimaryButton
          title="Create account"
          onPress={handleSubmit(onSubmit)}
          isLoading={isSubmitting}
        />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/log-in" style={styles.link}>
            Log in
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
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { ...typography.body, color: colors.textSecondary },
  link: { ...typography.body, color: colors.primary, fontWeight: '600', textAlign: 'center' },
});

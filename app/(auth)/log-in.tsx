import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ErrorBanner } from '../../src/components/ErrorBanner';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { signInWithEmail } from '../../src/services/auth';
import { colors, spacing, typography } from '../../src/theme';
import { logInSchema, type LogInFormData } from '../../src/utils/validation/authSchemas';

export default function LogInScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LogInFormData>({ resolver: zodResolver(logInSchema) });

  const onSubmit = async (data: LogInFormData) => {
    setServerError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail(data.email, data.password);
      // Root layout's auth-state listener handles the redirect to
      // onboarding/tabs once the session updates — nothing to do here.
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to run your bakery.</Text>

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
              placeholder="••••••••"
              secureTextEntry
              onBlur={onBlur}
              onChangeText={onChange}
              value={value ?? ''}
              error={errors.password?.message}
            />
          )}
        />

        <PrimaryButton title="Log in" onPress={handleSubmit(onSubmit)} isLoading={isSubmitting} />

        <View style={styles.linksRow}>
          <Link href="/(auth)/forgot-password" style={styles.link}>
            Forgot password?
          </Link>
        </View>

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>New here? </Text>
          <Link href="/(auth)/sign-up" style={styles.link}>
            Create an account
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.displaySm, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xxl },
  linksRow: { marginTop: spacing.md, alignItems: 'center' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { ...typography.body, color: colors.textSecondary },
  link: { ...typography.body, color: colors.primary, fontWeight: '600' },
});

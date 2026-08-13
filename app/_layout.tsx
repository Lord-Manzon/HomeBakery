import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { useBakerProfile } from '../src/hooks/useBakerProfile';
import { signOut } from '../src/services/auth';
import { colors, spacing, typography } from '../src/theme';
import { hasCompletedOnboarding } from '../src/types/baker';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading: authLoading } = useAuth();
  const bakerProfile = useBakerProfile();

  const stillResolving = authLoading || (!!session && bakerProfile.isLoading);

  if (stillResolving) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // If we have a session but genuinely can't load the baker profile (not
  // just "still loading"), don't strand the person on a blank/broken
  // screen — let them sign out and try again rather than getting stuck.
  if (session && bakerProfile.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't load your profile</Text>
        <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
        <View style={styles.retryButton}>
          <PrimaryButton title="Sign out and retry" onPress={() => signOut()} />
        </View>
      </View>
    );
  }

  const isLoggedIn = !!session;
  const onboarded = hasCompletedOnboarding(bakerProfile.data);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isLoggedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={isLoggedIn && onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorTitle: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
  errorSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryButton: { width: '100%' },
});

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
import { ThemeProvider, useThemeColors } from '../src/theme/ThemeContext';
import { hasCompletedOnboarding } from '../src/types/baker';

/**
 * Status bar icon color has to track the resolved theme, not a fixed
 * value. Light mode's background is a warm cream (#FBF7F1, see
 * palettes.ts), so light/white system icons (the default) are nearly
 * invisible against it — that's the "white notification bar" issue.
 * Dark mode needs the opposite. Rendered inside ThemeProvider (not
 * RootLayout) since useThemeColors() only works below that provider.
 */
function ThemedStatusBar() {
  const { mode } = useThemeColors();
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />;
}

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
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
        {/* Outside ThemeProvider here, but this screen always uses the
            static light palette (colors.background below), so "dark"
            icons are always correct for it — no theme lookup needed. */}
        <StatusBar style="dark" />
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
        <StatusBar style="dark" />
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

  // Falls back to the same defaults as the 0003 migration when the baker
  // profile isn't loaded yet (auth/onboarding screens) or hasn't set a
  // preference. Wrapping unconditionally here is safe — screens that
  // don't call useThemeColors() (everything except Appearance, so far)
  // are completely unaffected either way.
  const themePreference = {
    themeAccent: bakerProfile.data?.theme_accent ?? '#C9683F',
    themeMode: bakerProfile.data?.theme_mode ?? ('system' as const),
  };

  return (
    <ThemeProvider preference={themePreference}>
      <ThemedStatusBar />
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
    </ThemeProvider>
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
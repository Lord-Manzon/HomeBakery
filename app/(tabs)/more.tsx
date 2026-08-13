import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useBakerProfile } from '../../src/hooks/useBakerProfile';
import { signOut } from '../../src/services/auth';
import { colors, spacing, typography } from '../../src/theme';

export default function MoreScreen() {
  const { data: baker } = useBakerProfile();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>More</Text>
      <Text style={styles.note}>
        Products, Reports, Expenses, Storefront Settings, Account. Added across their respective
        phases.
      </Text>

      {baker ? (
        <View style={styles.profileCard}>
          <Text style={styles.profileLabel}>Signed in as</Text>
          <Text style={styles.profileValue}>{baker.business_name}</Text>
          <Text style={styles.profileMeta}>
            {baker.currency} · {baker.timezone}
          </Text>
        </View>
      ) : null}

      <View style={styles.signOutButton}>
        <PrimaryButton title="Sign out" onPress={() => signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: { ...typography.titleLg, color: colors.textPrimary },
  note: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  profileCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  profileLabel: { ...typography.caption, color: colors.textSecondary },
  profileValue: {
    ...typography.titleSm,
    color: colors.textPrimary,
    marginTop: spacing.xxs,
  },
  profileMeta: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  signOutButton: { marginTop: 'auto' },
});

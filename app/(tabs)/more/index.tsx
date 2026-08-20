import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { useBakerProfile } from '../../../src/hooks/useBakerProfile';
import { signOut } from '../../../src/services/auth';
import { colors, spacing, typography } from '../../../src/theme';

export default function MoreScreen() {
  const { data: baker } = useBakerProfile();
  const router = useRouter();

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

      <Pressable
        style={styles.menuRow}
        onPress={() => router.push('/more/ingredients')}
      >
        <Text style={styles.menuRowLabel}>Ingredients</Text>
        <Text style={styles.menuRowChevron}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuRow}
        onPress={() => router.push('/more/products')}
      >
        <Text style={styles.menuRowLabel}>Products</Text>
        <Text style={styles.menuRowChevron}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuRow}
        onPress={() => router.push('/more/recipes')}
      >
        <Text style={styles.menuRowLabel}>Recipes</Text>
        <Text style={styles.menuRowChevron}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuRow}
        onPress={() => router.push('/more/appearance')}
      >
        <Text style={styles.menuRowLabel}>Appearance</Text>
        <Text style={styles.menuRowChevron}>›</Text>
      </Pressable>

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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  menuRowLabel: { ...typography.body, color: colors.textPrimary },
  menuRowChevron: { ...typography.body, color: colors.textSecondary },
  signOutButton: { marginTop: 'auto' },
});
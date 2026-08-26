import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { useBakerProfile } from '../../../src/hooks/useBakerProfile';
import { signOut } from '../../../src/services/auth';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { spacing, typography } from '../../../src/theme';
import { MORE_MENU_ITEMS } from '../../../src/constants/moreMenu';
import { Screen } from '../../../src/components/Screen';
import { useMemo } from 'react';

export default function MoreScreen() {
  const { data: baker } = useBakerProfile();
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>More</Text>

      {baker ? (
        <View style={styles.profileCard}>
          <Text style={styles.profileLabel}>Signed in as</Text>
          <Text style={styles.profileValue}>{baker.business_name}</Text>
          <Text style={styles.profileMeta}>
            {baker.currency} · {baker.timezone}
          </Text>
        </View>
      ) : null}

      {/* Same shared list the trimmed nav popup pulls its 4 built items
          from (see src/constants/moreMenu.ts) — every destination lives
          here, built or not, so this screen can keep growing without
          ever needing to touch the popup again. */}
      <View style={styles.menuList}>
        {MORE_MENU_ITEMS.map((item, i) => {
          const isActive = !!item.pathname && pathname.startsWith(item.pathname);
          return (
            <Pressable
              key={item.label}
              style={[styles.menuRow, i > 0 && styles.menuRowDivider]}
              onPress={() => {
                if (!item.pathname) return;
                if (pathname.startsWith(item.pathname)) return; // already here
                // replace, not push: every destination in this list is a
                // peer top-level screen (Ingredients/Products/Recipes/
                // Settings/...), same tier as this hub itself — switching
                // between them must not grow the back stack. Matches the
                // same rule applied to the More panel in FloatingTabBar.tsx.
                router.replace(item.pathname as never);
              }}
              disabled={!item.pathname}
              accessibilityLabel={item.pathname ? item.label : `${item.label}, coming soon`}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={item.pathname ? (isActive ? colors.primary : colors.textPrimary) : colors.textSecondary}
              />
              <Text
                style={[
                  styles.menuRowLabel,
                  isActive && styles.menuRowLabelActive,
                  !item.pathname && styles.menuRowLabelDisabled,
                ]}
              >
                {item.label}
              </Text>
              {item.pathname ? (
                <Text style={styles.menuRowChevron}>›</Text>
              ) : (
                <Text style={styles.menuRowSoon}>Soon</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.signOutButton}>
        <PrimaryButton title="Sign out" onPress={() => signOut()} />
      </View>
    </Screen>
  );
}

function makeStyles(colors: Record<string, string>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
  title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
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
  menuList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  menuRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  menuRowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  menuRowLabelActive: { color: colors.primary, fontWeight: '600' },
  menuRowLabelDisabled: { color: colors.textSecondary },
  menuRowChevron: { ...typography.body, color: colors.textSecondary },
  menuRowSoon: { ...typography.caption, color: colors.textSecondary },
  signOutButton: { marginTop: 'auto' },
});
}
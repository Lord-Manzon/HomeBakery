import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../src/theme/ThemeContext';
import { useBakerProfile, useUpdateBakerProfile } from '../../src/hooks/useBakerProfile';
import { spacing, radii } from '../../src/theme';
import { ACCENT_SWATCHES } from '../../src/theme/accentSwatches';
import { Screen } from '../../src/components/Screen';

type ThemeModePreference = 'light' | 'dark' | 'system';

const MODE_OPTIONS: { label: string; value: ThemeModePreference }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Match device', value: 'system' },
];

export default function AppearanceScreen() {
  const { colors, mode } = useThemeColors();
  const { data: baker, isLoading: isLoadingBaker } = useBakerProfile();
  const updateProfile = useUpdateBakerProfile();

  const [selectedAccent, setSelectedAccent] = useState<string>(colors.primary);
  const [selectedMode, setSelectedMode] = useState<ThemeModePreference>(mode);
  // Same pattern (and same "baker profile is already warm in the query
  // cache by the time this screen mounts" assumption) as selectedAccent/
  // selectedMode above -- an editable draft, not an instant-apply toggle,
  // so it's saved together with the other two preferences via one Save.
  const [autoDeductInventory, setAutoDeductInventory] = useState<boolean>(
    baker?.auto_deduct_inventory ?? true
  );

  if (isLoadingBaker || !baker) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const hasChanges =
    selectedAccent !== colors.primary ||
    selectedMode !== mode ||
    autoDeductInventory !== baker.auto_deduct_inventory;

  const handleSave = () => {
    updateProfile.mutate({
      theme_accent: selectedAccent,
      theme_mode: selectedMode,
      auto_deduct_inventory: autoDeductInventory,
    });
  };

  return (
    <Screen>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
    >
      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs }}>
        Appearance
      </Text>
      <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xl }}>
        Choose an accent color and how the app should look.
      </Text>

      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md }}>
        Accent color
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl }}>
        {ACCENT_SWATCHES.map((swatch) => {
          const isSelected = selectedAccent === swatch.hex;
          return (
            <Pressable
              key={swatch.hex}
              onPress={() => setSelectedAccent(swatch.hex)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={swatch.name}
              style={{ alignItems: 'center', width: 64, minHeight: 44 }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.full,
                  backgroundColor: swatch.hex,
                  borderWidth: isSelected ? 3 : 0,
                  borderColor: colors.textPrimary,
                }}
              />
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs }}>
                {swatch.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md }}>
        Mode
      </Text>
      <View style={{ marginBottom: spacing.xxl }}>
        {MODE_OPTIONS.map((opt) => {
          const isSelected = selectedMode === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setSelectedMode(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                minHeight: 44,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: isSelected ? colors.primary : colors.border,
                borderRadius: radii.md,
                marginBottom: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.textPrimary }}>{opt.label}</Text>
              {isSelected && (
                <View style={{ width: 10, height: 10, borderRadius: radii.full, backgroundColor: colors.primary }} />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.md }}>
        Production
      </Text>
      <Pressable
        onPress={() => setAutoDeductInventory((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: autoDeductInventory }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          minHeight: 44,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.md,
          marginBottom: spacing.xxl,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '600' }}>
            Automatically deduct ingredients
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
            When on, marking a product done in Production subtracts its recipe's ingredients from
            stock right away. When off, checking items off only updates the checklist.
          </Text>
        </View>
        <Ionicons
          name={autoDeductInventory ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={autoDeductInventory ? colors.primary : colors.textSecondary}
        />
      </Pressable>

      {updateProfile.isError && (
        <Text style={{ color: colors.danger, fontSize: 13, marginBottom: spacing.md }}>
          Couldn't save your appearance settings. Tap Save to try again.
        </Text>
      )}

      <Pressable
        onPress={handleSave}
        disabled={!hasChanges || updateProfile.isPending}
        style={{
          backgroundColor: hasChanges && !updateProfile.isPending ? colors.primary : colors.border,
          borderRadius: radii.md,
          paddingVertical: spacing.md,
          alignItems: 'center',
          minHeight: 44,
        }}
      >
        <Text style={{ color: colors.textInverse, fontWeight: '600', fontSize: 15 }}>
          {updateProfile.isPending ? 'Saving…' : updateProfile.isSuccess && !hasChanges ? 'Saved' : 'Save'}
        </Text>
      </Pressable>
    </ScrollView>
    </Screen>
  );
}
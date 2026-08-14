import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { useBakerProfile, useUpdateBakerProfile } from '../../../src/hooks/useBakerProfile';
import { spacing, radii } from '../../../src/theme';

type ThemeModePreference = 'light' | 'dark' | 'system';

// Curated accent swatches — not a free-form color picker on purpose. Per
// docs/DECISIONS.md (2026-08-15, theme picker feature): letting the baker
// choose ANY hex risks poor contrast against the fixed neutrals/status
// colors in src/theme/palettes.ts. A small on-brand set keeps every
// possible combination readable, at the cost of fewer choices.
const ACCENT_SWATCHES = [
  { name: 'Terracotta', hex: '#C9683F' }, // current default
  { name: 'Berry', hex: '#A6456B' },
  { name: 'Ocean', hex: '#3B6FA0' },
  { name: 'Sage', hex: '#5C7A54' },
  { name: 'Plum', hex: '#7D5A9E' },
  { name: 'Honey', hex: '#C08A2E' },
] as const;

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

  if (isLoadingBaker || !baker) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const hasChanges =
    selectedAccent !== colors.primary || selectedMode !== mode;

  const handleSave = () => {
    updateProfile.mutate({
      theme_accent: selectedAccent,
      theme_mode: selectedMode,
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
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
  );
}
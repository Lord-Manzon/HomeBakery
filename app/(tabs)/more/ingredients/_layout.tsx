import { Stack } from 'expo-router';
import { useThemeColors } from '../../../../src/theme/ThemeContext';

export default function IngredientsLayout() {
  const { colors } = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Without this, the native Stack defaults the screen's background
        // to white during the push/pop transition itself — a beat before
        // <Screen> has painted its own themed background in. That gap is
        // the white flash: barely visible in light mode, obvious in dark.
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/restock" />
    </Stack>
  );
}
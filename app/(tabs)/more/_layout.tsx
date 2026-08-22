import { Stack } from 'expo-router';
import { useThemeColors } from '../../../src/theme/ThemeContext';

export default function MoreLayout() {
  const { colors } = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="ingredients" />
      <Stack.Screen name="appearance" />
    </Stack>
  );
}
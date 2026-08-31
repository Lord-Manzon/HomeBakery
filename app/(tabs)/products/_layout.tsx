import { Stack } from 'expo-router';

export default function ProductsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="categories/new" />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/recipe" />
      <Stack.Screen name="[id]/recipe-view" />
      <Stack.Screen name="[id]/recipe-instructions" />
    </Stack>
  );
}

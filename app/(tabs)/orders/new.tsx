import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useHideFloatingNav } from '../../../src/hooks/useHideFloatingNav';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { useCreateOrder } from '../../../src/hooks/useOrders';
import { OrderForm, defaultOrderFormValues } from '../../../src/components/OrderForm';
import { spacing, typography } from '../../../src/theme';

export default function NewOrderScreen() {
  useHideFloatingNav();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const createOrder = useCreateOrder();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>New order</Text>
        <View style={styles.backButton} />
      </View>

      <OrderForm
        initialValues={defaultOrderFormValues()}
        submitLabel="Save order"
        isSubmitting={createOrder.isPending}
        hasSubmitError={createOrder.isError}
        onSubmit={(input) => {
          createOrder.mutate(input, {
            onSuccess: () => {
              router.replace('/orders');
            },
          });
        }}
      />
    </View>
  );
}

function makeStyles(colors: { background: string; textPrimary: string }) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.displaySm, color: colors.textPrimary },
  });
}

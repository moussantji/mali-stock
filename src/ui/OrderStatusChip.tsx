/**
 * Badge de statut de commande — couleurs cohérentes avec la palette Bogolan.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";
import { ORDER_STATUS_LABEL, type OrderStatus } from "../api/orders";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TONES: Record<OrderStatus, { fg: string; bg: string; icon: IconName }> = {
  pending: { fg: colors.goldDark, bg: "rgba(223,169,33,0.20)", icon: "time-outline" },
  confirmed: { fg: colors.primary, bg: "rgba(10,107,69,0.12)", icon: "checkmark-circle-outline" },
  declined: { fg: colors.stockOut, bg: colors.stockOutBg, icon: "close-circle-outline" },
  completed: { fg: colors.stockOk, bg: colors.stockOkBg, icon: "checkmark-done-circle-outline" },
  cancelled: { fg: colors.textMuted, bg: "rgba(27,32,26,0.07)", icon: "ban-outline" },
};

export function OrderStatusChip({ status, compact = false }: { status: OrderStatus; compact?: boolean }) {
  const tone = TONES[status];
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }, compact && styles.chipCompact]}>
      <Ionicons name={tone.icon} size={compact ? 10 : 11} color={tone.fg} />
      <Text style={[styles.text, { color: tone.fg }, compact && styles.textCompact]}>
        {ORDER_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
    alignSelf: "flex-start",
  },
  chipCompact: { paddingVertical: 3, paddingHorizontal: 7 },
  text: { fontSize: 10.5, fontWeight: "800" },
  textCompact: { fontSize: 9.5 },
});

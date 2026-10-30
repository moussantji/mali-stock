/**
 * Panneau de notifications — alertes réelles du stock :
 * ruptures (rouge latérite) et stock faible (or).
 * Le badge de la cloche reflète le nombre d'alertes en base.
 */
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, tricoloreBand } from "../theme";
import { formatNumber } from "../data";
import type { ApiProduct } from "../api/products";

interface Props {
  visible: boolean;
  products: ApiProduct[];
  pendingOrders?: number;
  onClose: () => void;
  onOpenStock: () => void;
  onOpenOrders?: () => void;
}

export function NotificationsSheet({
  visible,
  products,
  pendingOrders = 0,
  onClose,
  onOpenStock,
  onOpenOrders,
}: Props) {
  const insets = useSafeAreaInsets();
  const out = products.filter((p) => p.status === "out");
  const low = products.filter((p) => p.status === "low");
  const total = out.length + low.length;
  const hasOrders = pendingOrders > 0;

  const headTitle =
    hasOrders && total > 0
      ? `${pendingOrders} commande${pendingOrders > 1 ? "s" : ""} · ${total} alerte${total > 1 ? "s" : ""}`
      : hasOrders
        ? `${pendingOrders} commande${pendingOrders > 1 ? "s" : ""} en attente`
        : total > 0
          ? `${total} alerte${total > 1 ? "s" : ""} de stock`
          : "Aucune alerte";

  const headSub = hasOrders
    ? "Des clients attendent ta confirmation"
    : total > 0
      ? "Produits à réapprovisionner en priorité"
      : "Tous tes produits sont au-dessus du seuil";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer les notifications" />
        <View style={[styles.card, { marginBottom: insets.bottom + 8 }]}>
          <View style={styles.band}>
            {tricoloreBand.map((color) => (
              <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
            ))}
          </View>

          <View style={styles.head}>
            <View style={hasOrders && total === 0 ? styles.iconOrder : total > 0 ? styles.iconAlert : styles.iconOk}>
              <Ionicons
                name={hasOrders && total === 0 ? "cart" : total > 0 ? "notifications" : "notifications-off-outline"}
                size={20}
                color={hasOrders && total === 0 ? colors.goldDark : total > 0 ? colors.stockOut : colors.stockOk}
              />
            </View>
            <View style={styles.headText}>
              <Text style={styles.headTitle}>{headTitle}</Text>
              <Text style={styles.headSub}>{headSub}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {hasOrders ? (
              <Pressable
                onPress={() => {
                  onClose();
                  onOpenOrders?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Voir les commandes en attente"
                style={({ pressed }) => [styles.orderBanner, pressed && styles.pressed]}
              >
                <View style={styles.orderIcon}>
                  <Ionicons name="cart" size={18} color={colors.goldDark} />
                </View>
                <View style={styles.orderText}>
                  <Text style={styles.orderTitle}>
                    {pendingOrders} commande{pendingOrders > 1 ? "s" : ""} à confirmer
                  </Text>
                  <Text style={styles.orderSub}>Ouvre la boîte de réception vendeur</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.goldDark} />
              </Pressable>
            ) : null}

            {total === 0 ? (
              <View style={styles.allGood}>
                <Ionicons name="checkmark-circle" size={40} color={colors.stockOk} />
                <Text style={styles.allGoodText}>Ton stock est sain. Bonne gestion !</Text>
              </View>
            ) : (
              <>
                {out.map((product) => (
                  <AlertRow key={product.id} product={product} severe />
                ))}
                {low.map((product) => (
                  <AlertRow key={product.id} product={product} severe={false} />
                ))}
              </>
            )}
          </ScrollView>

          {total > 0 ? (
            <Pressable
              onPress={() => {
                onClose();
                onOpenStock();
              }}
              accessibilityRole="button"
              accessibilityLabel="Gérer le stock maintenant"
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <LinearGradient
                colors={[colors.primaryLight, colors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Ionicons name="cube-outline" size={17} color={colors.onPrimary} />
                <Text style={styles.ctaText}>Gérer le stock</Text>
              </LinearGradient>
            </Pressable>
          ) : hasOrders ? (
            <Pressable
              onPress={() => {
                onClose();
                onOpenOrders?.();
              }}
              accessibilityRole="button"
              accessibilityLabel="Voir les commandes en attente"
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <LinearGradient
                colors={[colors.primaryLight, colors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cta}
              >
                <Ionicons name="cart-outline" size={17} color={colors.onPrimary} />
                <Text style={styles.ctaText}>Voir les commandes</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function AlertRow({ product, severe }: { product: ApiProduct; severe: boolean }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: severe ? colors.stockOutBg : colors.stockLowBg }]}>
        <Ionicons
          name={severe ? "close-circle" : "alert-circle"}
          size={17}
          color={severe ? colors.stockOut : colors.stockLow}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {product.sku} · seuil {formatNumber(product.minQuantity)} {product.unit}
        </Text>
      </View>
      <Text style={[styles.rowQty, { color: severe ? colors.stockOut : colors.stockLow }]}>
        {formatNumber(product.quantity)} {product.unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 18, backgroundColor: "rgba(6, 61, 41, 0.55)" },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  band: { flexDirection: "row", height: 4 },
  bandPart: { flex: 1 },

  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 18, paddingBottom: 10 },
  headText: { flex: 1 },
  headTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  headSub: { fontSize: 11.5, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  iconAlert: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.stockOutBg,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOk: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.stockOkBg,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOrder: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(223,169,33,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  list: { maxHeight: 320 },
  listContent: { paddingHorizontal: 14, paddingBottom: 8, gap: 2 },

  orderBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(223,169,33,0.16)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  orderIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: { flex: 1 },
  orderTitle: { fontSize: 12.5, fontWeight: "900", color: colors.goldDark },
  orderSub: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },

  allGood: { alignItems: "center", paddingVertical: 26, gap: 10 },
  allGoodText: { fontSize: 13, fontWeight: "700", color: colors.text },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowName: { fontSize: 12.5, fontWeight: "800", color: colors.text },
  rowMeta: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  rowQty: { fontSize: 12, fontWeight: "800" },

  cta: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 14,
    marginTop: 8,
    borderRadius: 15,
  },
  ctaText: { color: colors.onPrimary, fontSize: 13.5, fontWeight: "800" },

  pressed: { opacity: 0.82 },
});

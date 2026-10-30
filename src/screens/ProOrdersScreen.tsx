/**
 * Onglet Commandes (vendeur) — gestion comptoir :
 *  - création d'une commande sans compte client (client comptoir facultatif) ;
 *  - commandes en attente : confirmer la quantité ou refuser ;
 *  - commandes confirmées : encaisser (espèces / Orange Money / Moov / Wave) ;
 *  - historique : terminées, refusées, annulées.
 * L'encaissement crée la sortie de stock côté serveur.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadows, spacing } from "../theme";
import { formatDateTimeShort, formatFcfa, formatQuantity } from "../data";
import {
  PAYMENT_METHOD_LABEL,
  type ApiOrder,
} from "../api/orders";
import type { ApiProduct } from "../api/products";
import { OrderStatusChip } from "../ui/OrderStatusChip";
import {
  ConfirmOrderModal,
  CreateOrderModal,
  DeclineOrderModal,
  PaymentModal,
} from "./OrderModals";

type Filter = "pending" | "confirmed" | "all";

interface Props {
  token: string;
  orders: ApiOrder[];
  products: ApiProduct[];
  loading: boolean;
  refreshing: boolean;
  error?: string | null;
  onRefresh: () => void;
  onChanged: () => void | Promise<void>;
}

export function ProOrdersScreen({
  token,
  orders,
  products,
  loading,
  refreshing,
  error = null,
  onRefresh,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("pending");
  const [confirmTarget, setConfirmTarget] = useState<ApiOrder | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<ApiOrder | null>(null);
  const [declineTarget, setDeclineTarget] = useState<ApiOrder | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const confirmedOrders = useMemo(() => orders.filter((o) => o.status === "confirmed"), [orders]);
  const visibleOrders =
    filter === "pending" ? pendingOrders : filter === "confirmed" ? confirmedOrders : orders;

  const stockFor = (order: ApiOrder): number | null => {
    const product = products.find((p) => p.id === order.product.id);
    return product ? product.quantity : null;
  };

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "pending", label: "En attente", count: pendingOrders.length },
    { key: "confirmed", label: "À encaisser", count: confirmedOrders.length },
    { key: "all", label: "Toutes", count: orders.length },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.title}>Commandes</Text>
            <Text style={styles.subtitle}>
              {pendingOrders.length > 0
                ? `${pendingOrders.length} en attente · ${confirmedOrders.length} à encaisser`
                : confirmedOrders.length > 0
                  ? `${confirmedOrders.length} commande${confirmedOrders.length > 1 ? "s" : ""} à encaisser`
                  : "Crée une commande pour démarrer"}
            </Text>
          </View>
          <Pressable
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Actualiser les commandes"
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
          >
            <Ionicons name="refresh" size={17} color={colors.primary} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setCreateOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Créer une nouvelle commande"
          style={({ pressed }) => [styles.createBtnWrap, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.primaryLight, colors.primaryDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createBtn}
          >
            <Ionicons name="add-circle" size={19} color={colors.onPrimary} />
            <Text style={styles.createBtnText}>Nouvelle commande</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.filters}>
          {filters.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.label}, ${item.count}`}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {item.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={[styles.loadingCard, shadows.card]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Chargement des commandes…</Text>
          </View>
        ) : error ? (
          <View style={[styles.errorCard, shadows.card]}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.stockOut} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Réessayer"
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="refresh" size={15} color={colors.primary} />
              <Text style={styles.retryText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : visibleOrders.length === 0 ? (
          <View style={[styles.emptyCard, shadows.card]}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={filter === "pending" ? "hourglass-outline" : filter === "confirmed" ? "wallet-outline" : "receipt-outline"}
                size={28}
                color={colors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === "pending"
                ? "Aucune commande en attente"
                : filter === "confirmed"
                  ? "Aucune commande à encaisser"
                  : "Aucune commande pour l'instant"}
            </Text>
            <Text style={styles.emptyText}>
              {filter === "pending"
                ? "Crée une commande pour un client au comptoir : elle apparaîtra ici en attente de confirmation."
                : filter === "confirmed"
                  ? "Les commandes confirmées t'attendent pour l'encaissement et la sortie de stock."
                  : "Crée, confirme et encaisse tes commandes : ton historique complet s'affichera ici."}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visibleOrders.map((order) => (
              <ProOrderCard
                key={order.id}
                order={order}
                onConfirm={() => setConfirmTarget(order)}
                onDecline={() => setDeclineTarget(order)}
                onPay={() => setPaymentTarget(order)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmOrderModal
        order={confirmTarget}
        token={token}
        stock={confirmTarget ? stockFor(confirmTarget) : null}
        onClose={() => setConfirmTarget(null)}
        onDone={onChanged}
      />
      <PaymentModal
        order={paymentTarget}
        token={token}
        onClose={() => setPaymentTarget(null)}
        onDone={onChanged}
      />
      <DeclineOrderModal
        order={declineTarget}
        token={token}
        onClose={() => setDeclineTarget(null)}
        onDone={onChanged}
      />
      <CreateOrderModal
        visible={createOpen}
        token={token}
        products={products}
        onClose={() => setCreateOpen(false)}
        onDone={onChanged}
      />
    </View>
  );
}

function ProOrderCard({
  order,
  onConfirm,
  onDecline,
  onPay,
}: {
  order: ApiOrder;
  onConfirm: () => void;
  onDecline: () => void;
  onPay: () => void;
}) {
  const unit = order.product.unit ?? "unité";
  const confirmed = order.confirmedQuantity;
  const adjusted = confirmed !== null && confirmed !== order.quantity;

  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.cardTop}>
        <View style={styles.clientAvatar}>
          <Text style={styles.clientInitials}>{order.client?.initials ?? "MS"}</Text>
        </View>
        <View style={styles.cardTopText}>
          <Text style={styles.clientName} numberOfLines={1}>{order.client?.name ?? "Client comptoir"}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            #{order.id} · {formatDateTimeShort(order.createdAt)}
          </Text>
        </View>
        <OrderStatusChip status={order.status} />
      </View>

      <View style={styles.divider} />

      <Text style={styles.productName}>{order.product.name ?? "Produit"}</Text>
      <Text style={styles.productMeta}>
        {[order.product.sku, `vendu au ${unit}`].filter(Boolean).join(" · ")}
      </Text>

      <View style={styles.amounts}>
        <View style={styles.amountCell}>
          <Text style={styles.amountLabel}>Demandé</Text>
          <Text style={styles.amountValue}>{formatQuantity(order.quantity)} {unit}</Text>
        </View>
        {adjusted ? (
          <View style={styles.amountCell}>
            <Text style={styles.amountLabel}>Confirmé</Text>
            <Text style={[styles.amountValue, { color: colors.primary }]}>
              {formatQuantity(confirmed ?? 0)} {unit}
            </Text>
          </View>
        ) : null}
        <View style={styles.totalCell}>
          <Text style={styles.amountLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatFcfa(order.total)}</Text>
        </View>
      </View>

      {order.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
          <Text style={styles.noteText}>{order.note}</Text>
        </View>
      ) : null}

      {order.vendorNote ? (
        <View style={styles.vendorNoteBox}>
          <Ionicons name="storefront-outline" size={13} color={colors.goldDark} />
          <Text style={styles.vendorNoteText}>{order.vendorNote}</Text>
        </View>
      ) : null}

      {order.paymentMethod ? (
        <View style={styles.paymentRow}>
          <Ionicons name="wallet-outline" size={13} color={colors.stockOk} />
          <Text style={styles.paymentText}>
            Encaissé par {PAYMENT_METHOD_LABEL[order.paymentMethod]}
            {order.paymentReference ? ` · ${order.paymentReference}` : ""}
          </Text>
        </View>
      ) : null}

      {order.status === "pending" ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onDecline}
            accessibilityRole="button"
            accessibilityLabel="Refuser la commande"
            style={({ pressed }) => [styles.ghostAction, pressed && styles.pressed]}
          >
            <Ionicons name="close-circle-outline" size={16} color={colors.stockOut} />
            <Text style={styles.ghostActionText}>Refuser</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirmer la commande"
            style={({ pressed }) => [styles.primaryActionWrap, pressed && styles.pressed]}
          >
            <LinearGradient
              colors={[colors.primaryLight, colors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryAction}
            >
              <Ionicons name="checkmark-circle" size={16} color={colors.onPrimary} />
              <Text style={styles.primaryActionText}>Confirmer</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : order.status === "confirmed" ? (
        <Pressable
          onPress={onPay}
          accessibilityRole="button"
          accessibilityLabel="Encaisser la commande"
          style={({ pressed }) => [styles.primaryActionWrap, styles.payWrap, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.goldLight, colors.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryAction}
          >
            <Ionicons name="wallet" size={16} color={colors.onGold} />
            <Text style={[styles.primaryActionText, { color: colors.onGold }]}>Encaisser</Text>
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },

  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  titleText: { flex: 1 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 11.5, fontWeight: "600", color: colors.textMuted, marginTop: 3 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  createBtnWrap: { borderRadius: 15 },
  createBtn: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 15,
  },
  createBtnText: { fontSize: 13.5, fontWeight: "900", color: colors.onPrimary },

  filters: { flexDirection: "row", gap: 7 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  filterTextActive: { color: colors.onPrimary },
  filterCount: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(27,32,26,0.08)",
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  filterCountText: { fontSize: 9.5, fontWeight: "900", color: colors.textMuted },
  filterCountTextActive: { color: colors.onPrimary },

  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  loadingText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },

  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(229, 72, 77, 0.3)",
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  errorText: { fontSize: 12.5, fontWeight: "700", color: colors.stockOut, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(10,107,69,0.08)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: { fontSize: 12.5, fontWeight: "800", color: colors.primary },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
  emptyText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },

  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  clientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  clientInitials: { fontSize: 12, fontWeight: "900", color: colors.primary },
  cardTopText: { flex: 1 },
  clientName: { fontSize: 13, fontWeight: "900", color: colors.text },
  meta: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 11 },

  productName: { fontSize: 13.5, fontWeight: "800", color: colors.text },
  productMeta: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 2 },

  amounts: { flexDirection: "row", alignItems: "flex-end", gap: 14, marginTop: 11 },
  amountCell: { gap: 2 },
  amountLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  amountValue: { fontSize: 12, fontWeight: "800", color: colors.text },
  totalCell: { marginLeft: "auto", alignItems: "flex-end", gap: 2 },
  totalValue: { fontSize: 16, fontWeight: "900", color: colors.goldDark },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 10,
    padding: 9,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: { flex: 1, fontSize: 11, fontWeight: "600", color: colors.textMuted, lineHeight: 15 },
  vendorNoteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(223,169,33,0.14)",
    borderRadius: 10,
    padding: 9,
    marginTop: 8,
  },
  vendorNoteText: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.goldDark, lineHeight: 15 },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  paymentText: { fontSize: 11, fontWeight: "700", color: colors.stockOk },

  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  ghostAction: {
    flex: 1,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(229,72,77,0.35)",
    backgroundColor: colors.surface,
  },
  ghostActionText: { fontSize: 12.5, fontWeight: "800", color: colors.stockOut },
  primaryActionWrap: { flex: 1 },
  payWrap: { marginTop: 12 },
  primaryAction: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 13,
  },
  primaryActionText: { color: colors.onPrimary, fontSize: 12.5, fontWeight: "900" },

  pressed: { opacity: 0.82 },
});

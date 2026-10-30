/**
 * Onglet Stock — gestion complète des produits :
 * liste réelle depuis l'API, recherche, entrée/sortie rapides, modification,
 * QR par produit, suppression, journal des mouvements, étiquettes PDF en lot.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadows, spacing } from "../theme";
import {
  formatDateShort,
  formatFcfa,
  formatNumber,
} from "../data";
import {
  fetchLabelsPdf,
  productsApi,
  type ApiProduct,
  type MovementType,
  type StockMovement,
} from "../api/products";
import { SearchBar, StatusChip } from "../components";
import { useAppDialog } from "../ui/AppDialog";

interface Props {
  products: ApiProduct[];
  summary: { totalUnits: number; stockValue: number } | null;
  loading: boolean;
  refreshing: boolean;
  token: string;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (product: ApiProduct) => void;
  onMove: (product: ApiProduct, type?: MovementType) => void;
  onQr: (product: ApiProduct) => void;
  onDelete: (product: ApiProduct) => void;
}

export function StockScreen({
  products,
  summary,
  loading,
  refreshing,
  token,
  onRefresh,
  onAdd,
  onEdit,
  onMove,
  onQr,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const dialog = useAppDialog();
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [labelsBusy, setLabelsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    productsApi
      .movements(token)
      .then((data) => {
        if (active) setHistory(data.movements ?? []);
      })
      .catch(() => {
        /* Journal indisponible : on reste silencieux. */
      });
    return () => {
      active = false;
    };
  }, [token, products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
    );
  }, [products, query]);

  const alertsCount = products.filter((p) => p.status !== "ok").length;

  const shareLabelsPdf = async () => {
    if (labelsBusy || products.length === 0) return;
    setLabelsBusy(true);
    try {
      const bytes = await fetchLabelsPdf(token);
      const file = new File(Paths.cache, "etiquettes-mali-stock.pdf");
      file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Étiquettes Mali Stock",
        UTI: "com.adobe.pdf",
      });
    } catch (requestError) {
      await dialog.alert({
        title: "Étiquettes PDF",
        message:
          requestError instanceof Error && requestError.message
            ? requestError.message
            : "Impossible de préparer les étiquettes. Réessaie.",
        variant: "danger",
      });
    } finally {
      setLabelsBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.headRow}>
          <View>
            <Text style={styles.title}>Stock</Text>
            <Text style={styles.subtitle}>
              {products.length === 0
                ? "Aucun produit pour le moment"
                : `${formatNumber(products.length)} produit${products.length > 1 ? "s" : ""} · ${formatNumber(summary?.totalUnits ?? 0)} unités · ${formatFcfa(summary?.stockValue ?? 0)}`}
            </Text>
          </View>
          {alertsCount > 0 ? (
            <View style={styles.alertPill}>
              <Ionicons name="warning" size={12} color={colors.stockOut} />
              <Text style={styles.alertPillText}>{alertsCount}</Text>
            </View>
          ) : null}
        </View>

        <SearchBar value={query} onChangeText={setQuery} />

        <View style={styles.toolbar}>
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un produit"
            style={({ pressed }) => [styles.toolBtn, styles.toolBtnPrimary, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={17} color={colors.onPrimary} />
            <Text style={styles.toolBtnPrimaryText}>Ajouter</Text>
          </Pressable>
          <Pressable
            onPress={() => void shareLabelsPdf()}
            disabled={labelsBusy || products.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Imprimer les étiquettes QR en PDF"
            style={({ pressed }) => [
              styles.toolBtn,
              styles.toolBtnGhost,
              pressed && styles.pressed,
              (labelsBusy || products.length === 0) && styles.disabled,
            ]}
          >
            {labelsBusy ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons name="print-outline" size={17} color={colors.primary} />
            )}
            <Text style={styles.toolBtnGhostText}>Étiquettes PDF</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={[styles.card, shadows.card, styles.loadingCard]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={[styles.card, shadows.card, styles.emptyCard]}>
            <View style={styles.emptyIcon}>
              <Ionicons name={products.length === 0 ? "cube-outline" : "search-outline"} size={26} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {products.length === 0 ? "Ton entrepôt est vide" : "Aucun résultat"}
            </Text>
            <Text style={styles.emptyText}>
              {products.length === 0
                ? "Ajoute ton premier produit : un QR code interne sera créé automatiquement pour l'étiqueter, même sans code-barres."
                : `Aucun produit ne correspond à « ${query} ».`}
            </Text>
            {products.length === 0 ? (
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel="Ajouter ton premier produit"
                style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
              >
                <Ionicons name="add" size={17} color={colors.onPrimary} />
                <Text style={styles.emptyCtaText}>Ajouter un produit</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((product, index) => (
              <ProductRow
                key={product.id}
                product={product}
                index={index}
                onEdit={() => onEdit(product)}
                onMove={(type) => onMove(product, type)}
                onQr={() => onQr(product)}
                onDelete={() => onDelete(product)}
              />
            ))}
          </View>
        )}

        {/* Journal des mouvements */}
        {history.length > 0 ? (
          <View style={styles.historyWrap}>
            <Text style={styles.sectionTitle}>Journal des mouvements</Text>
            <View style={[styles.card, shadows.card]}>
              {history.slice(0, 8).map((movement) => {
                const isEntry = movement.type === "entry";
                const isAdjust = movement.type === "adjustment";
                return (
                  <View key={movement.id} style={styles.historyRow}>
                    <View
                      style={[
                        styles.historyIcon,
                        { backgroundColor: isEntry ? colors.stockOkBg : isAdjust ? colors.accentSoft : colors.stockOutBg },
                      ]}
                    >
                      <Ionicons
                        name={isEntry ? "arrow-down" : isAdjust ? "swap-vertical" : "arrow-up"}
                        size={13}
                        color={isEntry ? colors.stockOk : isAdjust ? colors.goldDark : colors.stockOut}
                      />
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyName} numberOfLines={1}>{movement.productName}</Text>
                      <Text style={styles.historyMeta} numberOfLines={1}>
                        {movement.note ?? (movement.type === "entry" ? "Entrée" : movement.type === "exit" ? "Sortie" : "Ajustement")}
                        {" · "}
                        {formatDateShort(movement.createdAt)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.historyQty,
                        { color: isEntry ? colors.stockOk : isAdjust ? colors.goldDark : colors.stockOut },
                      ]}
                    >
                      {movement.quantity > 0 ? "+" : ""}
                      {formatNumber(movement.quantity)} {movement.unit}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ProductRow({
  product,
  index,
  onEdit,
  onMove,
  onQr,
  onDelete,
}: {
  product: ApiProduct;
  index: number;
  onEdit: () => void;
  onMove: (type?: MovementType) => void;
  onQr: () => void;
  onDelete: () => void;
}) {
  const tone = TILE_TONES[index % TILE_TONES.length];
  const low = product.status !== "ok";
  return (
    <View style={[styles.card, shadows.card, low && styles.cardLow]}>
      <View style={styles.rowTop}>
        <View style={[styles.tile, { backgroundColor: tone.bg }]}>
          <Text style={[styles.tileText, { color: tone.fg }]}>{product.initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {product.sku}
            {product.barcode ? ` · ${product.barcode}` : ""}
          </Text>
        </View>
        <StatusChip status={product.status} />
      </View>

      <View style={styles.meterRow}>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${Math.max(3, product.level)}%` }]} />
        </View>
        <Text style={styles.qtyText}>
          {formatNumber(product.quantity)} {product.unit}
          {product.minQuantity > 0 ? ` · seuil ${formatNumber(product.minQuantity)}` : ""}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onMove("entry")}
          accessibilityRole="button"
          accessibilityLabel={`Entrée de ${product.name}`}
          style={({ pressed }) => [styles.actBtn, styles.actEntry, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-down" size={14} color={colors.stockOk} />
          <Text style={[styles.actText, { color: colors.stockOk }]}>Entrée</Text>
        </Pressable>
        <Pressable
          onPress={() => onMove("exit")}
          accessibilityRole="button"
          accessibilityLabel={`Sortie de ${product.name}`}
          style={({ pressed }) => [styles.actBtn, styles.actExit, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-up" size={14} color={colors.stockOut} />
          <Text style={[styles.actText, { color: colors.stockOut }]}>Sortie</Text>
        </Pressable>
        <View style={styles.spacer} />
        <Pressable onPress={onQr} accessibilityRole="button" accessibilityLabel={`QR code de ${product.name}`} style={({ pressed }) => [styles.iconAct, pressed && styles.pressed]} hitSlop={4}>
          <Ionicons name="qr-code-outline" size={17} color={colors.primary} />
        </Pressable>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Modifier ${product.name}`} style={({ pressed }) => [styles.iconAct, pressed && styles.pressed]} hitSlop={4}>
          <Ionicons name="create-outline" size={17} color={colors.goldDark} />
        </Pressable>
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Supprimer ${product.name}`} style={({ pressed }) => [styles.iconAct, pressed && styles.pressed]} hitSlop={4}>
          <Ionicons name="trash-outline" size={17} color={colors.stockOut} />
        </Pressable>
      </View>
    </View>
  );
}

const TILE_TONES = [
  { fg: colors.primary, bg: "rgba(10,107,69,0.13)" },
  { fg: colors.goldDark, bg: "rgba(223,169,33,0.20)" },
  { fg: colors.red, bg: "rgba(178,58,46,0.12)" },
] as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },

  headRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  alertPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.stockOutBg,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginLeft: "auto",
  },
  alertPillText: { fontSize: 12, fontWeight: "800", color: colors.stockOut },

  toolbar: { flexDirection: "row", gap: spacing.sm },
  toolBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  toolBtnPrimary: { backgroundColor: colors.primary },
  toolBtnPrimaryText: { color: colors.onPrimary, fontSize: 13.5, fontWeight: "800" },
  toolBtnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  toolBtnGhostText: { color: colors.primary, fontSize: 13.5, fontWeight: "800" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  cardLow: { borderColor: "rgba(240, 165, 0, 0.45)" },
  loadingCard: { alignItems: "center", paddingVertical: 26 },

  rowTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  tile: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tileText: { fontSize: 13, fontWeight: "800" },
  info: { flex: 1 },
  name: { fontSize: 13.5, fontWeight: "800", color: colors.text },
  meta: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: 2 },

  meterRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 11 },
  meterTrack: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    backgroundColor: "rgba(27,32,26,0.08)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: colors.primary,
  },
  qtyText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actEntry: { borderColor: "rgba(46, 174, 110, 0.4)" },
  actExit: { borderColor: "rgba(229, 72, 77, 0.35)" },
  actText: { fontSize: 11.5, fontWeight: "800" },
  spacer: { flex: 1 },
  iconAct: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  emptyCard: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20 },
  list: { gap: spacing.sm },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  emptyText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  emptyCtaText: { color: colors.onPrimary, fontSize: 13.5, fontWeight: "800" },

  historyWrap: { marginTop: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  historyInfo: { flex: 1 },
  historyName: { fontSize: 12, fontWeight: "800", color: colors.text },
  historyMeta: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  historyQty: { fontSize: 12, fontWeight: "800" },

  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});

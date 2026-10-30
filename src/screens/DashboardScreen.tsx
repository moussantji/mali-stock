/**
 * Écran principal — shell multi-onglets :
 * Accueil (KPI réels, graphique, alertes) · Stock · Scanner · Commandes · Profil.
 * Toutes les données viennent de l'API (produits + résumé) ; les modales
 * produit / mouvement / QR sont possédées ici pour être partagées par tous les onglets.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { colors, shadows, spacing } from "../theme";
import { useAppDialog } from "../ui/AppDialog";
import {
  formatDateShort,
  formatFcfa,
  formatNumber,
} from "../data";
import {
  productsApi,
  toUiProduct,
  type ApiProduct,
  type MovementType,
  type StockSummary,
} from "../api/products";
import { ordersApi, type ApiOrder } from "../api/orders";
import {
  BottomNav,
  HeroBanner,
  IconButton,
  KpiCard,
  PrimaryButton,
  ProductCard,
  Reveal,
  SearchBar,
  SecondaryButton,
  StockChart,
  TricoloreBand,
  type TabKey,
} from "../components";
import { ProductFormModal, type ProductFormRequest } from "./ProductFormModal";
import { MovementModal } from "./MovementModal";
import { QrModal } from "./QrModal";
import { NotificationsSheet } from "./NotificationsSheet";
import { StockScreen } from "./StockScreen";
import { ScanScreen } from "./ScanScreen";
import { ProfileScreen } from "./ProfileScreen";
import { ProOrdersScreen } from "./ProOrdersScreen";
import { SecurityScreen } from "./SecurityScreen";
import { AdminScreen } from "./AdminScreen";

export function DashboardScreen() {
  const { user, signOut, token } = useAuth();
  const dialog = useAppDialog();

  /* ── Données réelles ─────────────────────────────────── */
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* ── Navigation & écrans superposés ──────────────────── */
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("home");
  const [securityOpen, setSecurityOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  /* ── Modales produit / mouvement / QR ────────────────── */
  const [formRequest, setFormRequest] = useState<ProductFormRequest | null>(null);
  const [movementRequest, setMovementRequest] = useState<{ product: ApiProduct; defaultType?: MovementType } | null>(null);
  const [qrProduct, setQrProduct] = useState<ApiProduct | null>(null);

  const refreshOrders = useCallback(async () => {
    if (!token) return;
    try {
      const data = await ordersApi.list(token);
      setOrders(data.orders ?? []);
      setOrdersError(null);
    } catch (requestError) {
      setOrdersError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Impossible de charger les commandes."
      );
    }
  }, [token]);

  const refresh = useCallback(
    async (asPull = false) => {
      if (!token) return;
      if (asPull) setRefreshing(true);
      try {
        const [productsResult, summaryResult] = await Promise.allSettled([
          productsApi.list(token),
          productsApi.summary(token),
        ]);

        if (productsResult.status === "fulfilled") {
          setProducts(productsResult.value.products ?? []);
          setLoadError(null);
        } else {
          const requestError = productsResult.reason;
          setLoadError(
            requestError instanceof Error && requestError.message
              ? requestError.message
              : "Impossible de charger le stock."
          );
        }

        if (summaryResult.status === "fulfilled") {
          setSummary(summaryResult.value);
        }

        await refreshOrders();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, refreshOrders]
  );

  /* Rafraîchit les commandes à l'ouverture de l'onglet et toutes les 15 s. */
  const openTab = useCallback(
    (next: TabKey) => {
      setTab(next);
      if (next === "orders") void refreshOrders();
    },
    [refreshOrders]
  );

  useEffect(() => {
    if (tab !== "orders") return;
    const interval = setInterval(() => {
      void refreshOrders();
    }, 15_000);
    return () => clearInterval(interval);
  }, [tab, refreshOrders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uiProducts = useMemo(() => products.map(toUiProduct), [products]);

  const chartData = useMemo(() => {
    const weekly = summary?.weekly ?? [];
    const max = Math.max(1, ...weekly.map((w) => w.value));
    return weekly.map((w) => ({ day: w.day, value: w.value === 0 ? 0 : w.value / max }));
  }, [summary]);

  /* ── Identité ────────────────────────────────────────── */
  const initials =
    user?.name
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "MS";
  const firstName = user?.name?.trim().split(/\s+/)[0] || "entrepreneur";

  /* ── Déconnexion ─────────────────────────────────────── */
  const confirmSignOut = useCallback(async () => {
    const confirmed = await dialog.confirm({
      title: "Déconnexion",
      message: "Veux-tu vraiment te déconnecter ?",
      variant: "danger",
      icon: "log-out-outline",
      confirmLabel: "Se déconnecter",
      cancelLabel: "Annuler",
    });
    if (confirmed) await signOut();
  }, [dialog, signOut]);

  /* ── Rapport partagé ─────────────────────────────────── */
  const shareReport = useCallback(async () => {
    if (!summary) {
      await dialog.alert({
        title: "Rapport",
        message: loading ? "Chargement du stock en cours…" : "Stock indisponible pour l'instant.",
        variant: "info",
      });
      return;
    }
    if (products.length === 0) {
      await dialog.alert({
        title: "Rapport de stock",
        message: "Ajoute d'abord des produits — le bouton « Ajouter » est prêt.",
        variant: "info",
        icon: "cube-outline",
      });
      return;
    }

    const critical = products
      .filter((p) => p.status !== "ok")
      .map((p) => `• ${p.name} — ${formatNumber(p.quantity)} ${p.unit}${p.status === "out" ? " (rupture)" : " (faible)"}`)
      .join("\n");

    const message = [
      `Rapport de stock — Mali Stock`,
      `${formatDateShort(new Date().toISOString())}`,
      ``,
      `Produits : ${formatNumber(summary.totalProducts)}`,
      `Unités en stock : ${formatNumber(summary.totalUnits)}`,
      `Valeur du stock : ${formatFcfa(summary.stockValue)}`,
      `Entrées du jour : +${formatNumber(summary.entriesToday)} · Sorties du jour : ${formatNumber(summary.exitsToday)}`,
      `Alertes : ${summary.alerts} (${summary.outCount} rupture(s), ${summary.lowCount} faible(s))`,
      critical !== "" ? `\nÀ réapprovisionner :\n${critical}` : "",
      ``,
      `${summary.trend}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await Share.share({ message });
    } catch {
      /* Partage annulé par l'utilisateur : rien à faire. */
    }
  }, [summary, products, loading, dialog]);

  /* ── Actions produit ─────────────────────────────────── */
  const handleSaved = useCallback(
    async (product: ApiProduct, created: boolean) => {
      setFormRequest(null);
      await refresh();
      await dialog.alert({
        title: created ? "Produit créé" : "Modifications enregistrées",
        message: `« ${product.name} »\nCode ${product.sku}${created ? "" : " mis à jour"} · ${formatNumber(product.quantity)} ${product.unit} en stock.\nCode interne : MALISTOCK:${product.qrToken}`,
        variant: "success",
        icon: created ? "add-circle-outline" : "checkmark-circle-outline",
        confirmLabel: "Parfait",
      });
      if (created) setTab("stock");
    },
    [refresh, dialog]
  );

  const handleMovementDone = useCallback(
    async (product: ApiProduct, type: MovementType) => {
      setMovementRequest(null);
      await refresh();
      const label = type === "entry" ? "Entrée enregistrée" : type === "exit" ? "Sortie enregistrée" : "Ajustement enregistré";
      await dialog.alert({
        title: label,
        message: `« ${product.name} » → ${formatNumber(product.quantity)} ${product.unit} en stock.`,
        variant: "success",
        icon: type === "exit" ? "arrow-up-circle-outline" : "arrow-down-circle-outline",
        confirmLabel: "OK",
      });
    },
    [refresh, dialog]
  );

  const handleDelete = useCallback(
    async (product: ApiProduct) => {
      const confirmed = await dialog.confirm({
        title: "Supprimer le produit ?",
        message: `« ${product.name} » et tout son historique de mouvements seront supprimés. Action irréversible.`,
        variant: "danger",
        icon: "trash-outline",
        confirmLabel: "Supprimer",
        cancelLabel: "Annuler",
      });
      if (!confirmed || !token) return;
      try {
        await productsApi.remove(token, product.id);
        await refresh();
        await dialog.alert({
          title: "Produit supprimé",
          message: `« ${product.name} » a été retiré du stock.`,
          variant: "success",
          icon: "trash-outline",
          confirmLabel: "OK",
        });
      } catch (requestError) {
        await dialog.alert({
          title: "Suppression impossible",
          message:
            requestError instanceof Error && requestError.message
              ? requestError.message
              : "Réessaie dans un instant.",
          variant: "danger",
        });
      }
    },
    [dialog, token, refresh]
  );

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uiProducts;
    return uiProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [uiProducts, query]);

  if (adminOpen) {
    return <AdminScreen onBack={() => setAdminOpen(false)} />;
  }

  if (securityOpen) {
    return <SecurityScreen onBack={() => setSecurityOpen(false)} />;
  }

  const alertsBadge = (!!summary && summary.alerts > 0) || orders.some((o) => o.status === "pending");
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="dark" />

      {tab === "home" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} tintColor={colors.primary} />}
        >
          {/* En-tête */}
          <Reveal index={0}>
            <View style={styles.header}>
              <LinearGradient
                colors={[colors.goldLight, colors.gold]}
                style={[styles.avatar, shadows.card]}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </LinearGradient>
              <View style={styles.headerText}>
                <Text style={styles.greeting} numberOfLines={1}>
                  Bonjour, {firstName}
                </Text>
                <Text style={styles.depot} numberOfLines={1}>
                  {user?.email ?? ""}
                </Text>
              </View>
              {user?.isAdmin ? (
                <IconButton
                  icon="settings-outline"
                  label="Administration"
                  onPress={() => setAdminOpen(true)}
                />
              ) : null}
              <IconButton icon="shield-checkmark-outline" label="Sécurité" onPress={() => setSecurityOpen(true)} />
              <IconButton icon="notifications-outline" label="Notifications" badge={alertsBadge} onPress={() => setAlertsOpen(true)} />
              <IconButton icon="log-out-outline" label="Se déconnecter" onPress={() => void confirmSignOut()} />
            </View>
          </Reveal>

          {loading ? (
            <View style={[styles.loadingCard, shadows.card]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Chargement de ton stock…</Text>
            </View>
          ) : loadError ? (
            <View style={[styles.errorCard, shadows.card]}>
              <Ionicons name="cloud-offline-outline" size={24} color={colors.stockOut} />
              <Text style={styles.errorCardText}>{loadError}</Text>
              <Pressable
                onPress={() => {
                  setLoading(true);
                  void refresh();
                }}
                accessibilityRole="button"
                accessibilityLabel="Réessayer"
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
              >
                <Ionicons name="refresh" size={15} color={colors.primary} />
                <Text style={styles.retryText}>Réessayer</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Hero banner bogolan tricolore */}
              <Reveal index={1}>
                <HeroBanner
                  value={summary ? formatFcfa(summary.stockValue) : "— FCFA"}
                  trend={summary?.trend ?? "…"}
                  onReport={() => void shareReport()}
                  onScan={() => setTab("scan")}
                />
              </Reveal>

              {/* Recherche */}
              <Reveal index={2}>
                <SearchBar value={query} onChangeText={setQuery} />
              </Reveal>

              {/* Indicateurs clés */}
              <Reveal index={3}>
                <View style={styles.kpiRow}>
                  <KpiCard
                    icon="cube-outline"
                    value={summary ? formatNumber(summary.totalProducts) : "0"}
                    label="Produits"
                    tone="primary"
                  />
                  <KpiCard
                    icon="warning-outline"
                    value={summary ? formatNumber(summary.alerts) : "0"}
                    label="Alertes"
                    tone="danger"
                  />
                  <KpiCard
                    icon="trending-up-outline"
                    value={summary ? `+${formatNumber(summary.entriesToday)}` : "+0"}
                    label="Entrées"
                    tone="gold"
                  />
                </View>
              </Reveal>

              {/* Graphique hebdomadaire */}
              <Reveal index={4}>
                <StockChart data={chartData} />
              </Reveal>

              {/* Produits suivis */}
              <Reveal index={5}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Produits suivis</Text>
                  {uiProducts.length > 0 ? (
                    <Pressable onPress={() => setTab("stock")} accessibilityRole="button" accessibilityLabel="Voir tout le stock" style={styles.linkBtn} hitSlop={6}>
                      <Text style={styles.linkText}>Tout voir</Text>
                      <Ionicons name="chevron-forward" size={13} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.productList}>
                  {visibleProducts.length === 0 && uiProducts.length === 0 ? (
                    <View style={[styles.emptyStateCard, shadows.card]}>
                      <View style={styles.emptyIcon}>
                        <Ionicons name="cube-outline" size={26} color={colors.primary} />
                      </View>
                      <Text style={styles.emptyTitle}>Ton entrepôt t'attend</Text>
                      <Text style={styles.emptyText}>
                        Ajoute ton premier produit : Mali Stock crée automatiquement un QR code
                        interne, même sans code-barres.
                      </Text>
                      <PrimaryButton label="Ajouter un produit" icon="add" onPress={() => setFormRequest({})} style={styles.emptyCta} />
                    </View>
                  ) : (
                    visibleProducts.slice(0, 5).map((p, i) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        index={i}
                        onPress={() => {
                          setQuery("");
                          setTab("stock");
                        }}
                      />
                    ))
                  )}
                  {visibleProducts.length === 0 && uiProducts.length > 0 ? (
                    <Text style={styles.empty}>Aucun produit ne correspond à « {query} ».</Text>
                  ) : null}
                </View>
              </Reveal>

              {/* Actions principales */}
              {uiProducts.length > 0 ? (
                <Reveal index={6}>
                  <View style={styles.ctaRow}>
                    <PrimaryButton label="Ajouter un produit" icon="add" onPress={() => setFormRequest({})} style={styles.ctaPrimary} />
                    <SecondaryButton label="Scanner" icon="scan-outline" onPress={() => setTab("scan")} />
                  </View>
                </Reveal>
              ) : null}
            </>
          )}
        </ScrollView>
      ) : tab === "stock" ? (
        <StockScreen
          products={products}
          summary={summary}
          loading={loading}
          refreshing={refreshing}
          token={token ?? ""}
          onRefresh={() => void refresh(true)}
          onAdd={() => setFormRequest({})}
          onEdit={(product) => setFormRequest({ product })}
          onMove={(product, type) => setMovementRequest({ product, defaultType: type })}
          onQr={(product) => setQrProduct(product)}
          onDelete={(product) => void handleDelete(product)}
        />
      ) : tab === "scan" ? (
        <ScanScreen
          token={token ?? ""}
          onFound={(product) => setMovementRequest({ product })}
          onUnknownCode={(code) => setFormRequest({ prefillBarcode: code })}
        />
      ) : tab === "orders" ? (
        <ProOrdersScreen
          token={token ?? ""}
          orders={orders}
          products={products}
          loading={loading}
          refreshing={refreshing}
          error={ordersError}
          onRefresh={() => void refresh(true)}
          onChanged={() => refresh()}
        />
      ) : (
        <ProfileScreen
          summary={summary}
          onOpenSecurity={() => setSecurityOpen(true)}
          onOpenStock={() => setTab("stock")}
          onOpenAdmin={() => setAdminOpen(true)}
        />
      )}

      {/* Bandeau signature au-dessus de la navigation */}
      <TricoloreBand height={3} />
      <BottomNav active={tab} onChange={openTab} badges={{ orders: pendingOrders }} />

      {/* Modales partagées */}
      <ProductFormModal
        request={formRequest}
        token={token ?? ""}
        onClose={() => setFormRequest(null)}
        onSaved={(product, created) => void handleSaved(product, created)}
      />
      <MovementModal
        request={movementRequest}
        token={token ?? ""}
        onClose={() => setMovementRequest(null)}
        onDone={(product, type) => void handleMovementDone(product, type)}
      />
      <QrModal
        visible={qrProduct !== null}
        token={token ?? ""}
        product={qrProduct}
        onClose={() => setQrProduct(null)}
        onRegenerated={() => void refresh()}
      />
      <NotificationsSheet
        visible={alertsOpen}
        products={products}
        pendingOrders={pendingOrders}
        onClose={() => setAlertsOpen(false)}
        onOpenStock={() => setTab("stock")}
        onOpenOrders={() => openTab("orders")}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onGold, fontSize: 15, fontWeight: "800" },
  headerText: { flex: 1 },
  greeting: { fontSize: 17, fontWeight: "800", color: colors.text },
  depot: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  kpiRow: { flexDirection: "row", gap: spacing.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.text },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
  linkText: { fontSize: 11.5, fontWeight: "800", color: colors.primary },
  productList: { gap: spacing.sm },
  empty: { fontSize: 13, fontWeight: "600", color: colors.textMuted, textAlign: "center", paddingVertical: spacing.lg },

  emptyStateCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: "center",
  },
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
  emptyCta: { alignSelf: "stretch", marginTop: 16 },

  ctaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  ctaPrimary: { flex: 1 },

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
  errorCardText: { fontSize: 12.5, fontWeight: "700", color: colors.stockOut, textAlign: "center", lineHeight: 18 },
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

  pressed: { opacity: 0.8 },
});

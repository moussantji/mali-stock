/**
 * Panneau admin « Boutiques » :
 *  - liste de toutes les boutiques vendeuses avec leurs indicateurs de stock ;
 *  - consultation du stock de chaque boutique ;
 *  - modification des informations publiques de la boutique.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, ApiError } from "../auth/api";
import { colors, shadows } from "../theme";
import { formatDateShort, formatFcfa, formatNumber } from "../data";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface AdminShop {
  id: string;
  ownerName: string;
  ownerEmail: string;
  shopName: string | null;
  category: string | null;
  city: string | null;
  bio: string | null;
  productCount: number;
  totalUnits: number;
  stockValue: number;
  outCount: number;
  lowCount: number;
  createdAt: string;
}

interface AdminShopProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number;
  status: "ok" | "low" | "out";
  createdAt: string;
}

interface ShopDetail {
  shop: AdminShop;
  products: AdminShopProduct[];
}

function Field({
  label,
  icon,
  multiline = false,
  ...inputProps
}: { label: string; icon: IconName; multiline?: boolean } & Omit<
  React.ComponentProps<typeof TextInput>,
  "style"
>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, multiline && styles.inputWrapMultiline]}>
        <Ionicons name={icon} size={17} color={colors.textMuted} style={multiline ? styles.iconTop : undefined} />
        <TextInput
          {...inputProps}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline]}
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function AdminShopsPanel() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [shops, setShops] = useState<AdminShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AdminShop | null>(null);
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [shopName, setShopName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadShops = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ shops: AdminShop[] }>("/api/admin/shops", { token });
      setShops(data.shops ?? []);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Impossible de charger les boutiques."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  const fillForm = (shop: AdminShop) => {
    setShopName(shop.shopName ?? "");
    setCategory(shop.category ?? "");
    setCity(shop.city ?? "");
    setBio(shop.bio ?? "");
    setSaveMessage(null);
    setSaveSuccess(false);
  };

  const openShop = useCallback(
    async (shop: AdminShop) => {
      setSelected(shop);
      setDetail(null);
      setDetailError(null);
      fillForm(shop);
      if (!token) return;
      setDetailLoading(true);
      try {
        const data = await apiRequest<ShopDetail>(`/api/admin/shops/${shop.id}`, { token });
        setDetail(data);
        fillForm(data.shop);
      } catch (requestError) {
        setDetailError(
          requestError instanceof ApiError
            ? requestError.message
            : "Impossible de charger le stock de cette boutique."
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [token]
  );

  const saveShop = async () => {
    if (!selected || !token) return;
    setSaveMessage(null);
    setSaveSuccess(false);

    if (shopName.trim().length < 2) {
      setSaveMessage("Le nom de la boutique doit contenir au moins 2 caractères.");
      return;
    }

    setSaving(true);
    try {
      const data = await apiRequest<{ shop: AdminShop }>(`/api/admin/shops/${selected.id}`, {
        method: "PATCH",
        token,
        body: {
          shopName: shopName.trim(),
          shopCategory: category.trim(),
          shopCity: city.trim(),
          shopBio: bio.trim(),
        },
      });
      setSelected(data.shop);
      setDetail((current) => (current ? { ...current, shop: data.shop } : current));
      setShops((current) =>
        current.map((shop) => (shop.id === data.shop.id ? data.shop : shop))
      );
      fillForm(data.shop);
      setSaveSuccess(true);
      setSaveMessage("Boutique mise à jour.");
    } catch (requestError) {
      setSaveMessage(
        requestError instanceof ApiError
          ? requestError.message
          : "Impossible d'enregistrer les modifications."
      );
    } finally {
      setSaving(false);
    }
  };

  /* ── Détail d'une boutique ─────────────────────────────── */
  if (selected) {
    const shop = detail?.shop ?? selected;
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => {
            setSelected(null);
            setDetail(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Retour à la liste des boutiques"
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={styles.backLabel}>Toutes les boutiques</Text>
        </Pressable>

        <View style={[styles.card, shadows.card]}>
          <View style={styles.shopHero}>
            <LinearGradient colors={[colors.goldLight, colors.gold]} style={styles.shopAvatar}>
              <Ionicons name="storefront-outline" size={22} color={colors.onGold} />
            </LinearGradient>
            <View style={styles.shopHeroText}>
              <Text style={styles.shopTitle} numberOfLines={2}>
                {shop.shopName || "Boutique sans nom"}
              </Text>
              <Text style={styles.shopOwner} numberOfLines={1}>{shop.ownerName}</Text>
              <Text style={styles.shopEmail} numberOfLines={1}>{shop.ownerEmail}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <Stat value={formatNumber(shop.productCount)} label="Produits" />
            <Stat value={formatNumber(shop.totalUnits)} label="Unités" />
            <Stat value={formatFcfa(shop.stockValue).replace(" FCFA", "")} label="Valeur (F)" />
          </View>

          {shop.outCount > 0 || shop.lowCount > 0 ? (
            <View style={styles.alertRow}>
              <Ionicons name="warning-outline" size={14} color={colors.stockLow} />
              <Text style={styles.alertText}>
                {shop.outCount} rupture(s) · {shop.lowCount} produit(s) sous le seuil
              </Text>
            </View>
          ) : null}

          <Text style={styles.memberSince}>Boutique créée le {formatDateShort(shop.createdAt)}</Text>
        </View>

        <View style={[styles.card, shadows.card]}>
          <Text style={styles.sectionLabel}>Informations de la boutique</Text>
          <Field
            label="Nom de la boutique"
            icon="storefront-outline"
            value={shopName}
            onChangeText={setShopName}
            placeholder="Boutique Bogolan"
            autoCapitalize="words"
            editable={!saving}
          />
          <Field
            label="Catégorie"
            icon="grid-outline"
            value={category}
            onChangeText={setCategory}
            placeholder="Artisanat, tissus, épicerie…"
            autoCapitalize="sentences"
            editable={!saving}
          />
          <Field
            label="Ville"
            icon="location-outline"
            value={city}
            onChangeText={setCity}
            placeholder="Bamako"
            autoCapitalize="words"
            editable={!saving}
          />
          <Field
            label="Description"
            icon="document-text-outline"
            value={bio}
            onChangeText={setBio}
            placeholder="Présentation de la boutique…"
            autoCapitalize="sentences"
            multiline
            numberOfLines={3}
            editable={!saving}
          />

          {saveMessage ? (
            <View style={saveSuccess ? styles.successBox : styles.errorBox}>
              <Ionicons
                name={saveSuccess ? "checkmark-circle" : "alert-circle"}
                size={17}
                color={saveSuccess ? colors.stockOk : colors.stockOut}
              />
              <Text style={saveSuccess ? styles.successText : styles.errorText}>{saveMessage}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void saveShop()}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer la boutique"
            style={({ pressed }) => [pressed && styles.pressed, saving && styles.disabled]}
          >
            <LinearGradient
              colors={[colors.primaryLight, colors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.saveBtn, shadows.primaryButton]}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name="checkmark-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.saveText}>Enregistrer les modifications</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <View style={[styles.card, shadows.card]}>
          <Text style={styles.sectionLabel}>
            Stock de la boutique ({detail?.products.length ?? shop.productCount})
          </Text>

          {detailLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : detailError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
              <Text style={styles.errorText}>{detailError}</Text>
            </View>
          ) : (detail?.products ?? []).length === 0 ? (
            <Text style={styles.emptyText}>Cette boutique n'a encore aucun produit.</Text>
          ) : (
            (detail?.products ?? []).map((product) => (
              <View key={product.id} style={styles.productRow}>
                <View style={styles.productIcon}>
                  <Ionicons name="cube-outline" size={16} color={colors.primary} />
                </View>
                <View style={styles.productText}>
                  <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.productMeta} numberOfLines={1}>
                    {product.sku} · {formatNumber(product.quantity)} {product.unit} ·{" "}
                    {formatFcfa(product.salePrice)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    product.status === "ok"
                      ? styles.statusOk
                      : product.status === "low"
                        ? styles.statusLow
                        : styles.statusOut,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      product.status === "ok"
                        ? styles.statusOkText
                        : product.status === "low"
                          ? styles.statusLowText
                          : styles.statusOutText,
                    ]}
                  >
                    {product.status === "ok" ? "OK" : product.status === "low" ? "Faible" : "Rupture"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  }

  /* ── Liste des boutiques ───────────────────────────────── */
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Boutiques ({shops.length})</Text>
        <Pressable
          onPress={() => void loadShops()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Actualiser les boutiques"
        >
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : shops.length === 0 ? (
        <View style={[styles.card, styles.emptyCard, shadows.card]}>
          <Ionicons name="storefront-outline" size={28} color={colors.primary} />
          <Text style={styles.emptyTitle}>Aucune boutique</Text>
          <Text style={styles.emptyText}>
            Crée un compte vendeur dans l'onglet « Vendeurs » pour ouvrir une boutique.
          </Text>
        </View>
      ) : (
        shops.map((shop) => (
          <Pressable
            key={shop.id}
            onPress={() => void openShop(shop)}
            accessibilityRole="button"
            accessibilityLabel={`Gérer ${shop.shopName ?? shop.ownerName}`}
            style={({ pressed }) => [styles.shopCard, shadows.card, pressed && styles.pressed]}
          >
            <View style={styles.shopRow}>
              <View style={styles.shopIcon}>
                <Ionicons name="storefront-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.shopMain}>
                <Text style={styles.shopName} numberOfLines={1}>
                  {shop.shopName || "Boutique sans nom"}
                </Text>
                <Text style={styles.shopSub} numberOfLines={1}>
                  {shop.ownerName} · {[shop.city, shop.category].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
              {shop.outCount > 0 || shop.lowCount > 0 ? (
                <View style={styles.alertDot}>
                  <Text style={styles.alertDotText}>{shop.outCount + shop.lowCount}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>

            <View style={styles.miniStats}>
              <MiniStat icon="cube-outline" value={formatNumber(shop.productCount)} label="produits" />
              <MiniStat icon="layers-outline" value={formatNumber(shop.totalUnits)} label="unités" />
              <MiniStat icon="cash-outline" value={formatFcfa(shop.stockValue)} label="stock" />
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function MiniStat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.miniStat}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.miniStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 16, gap: 12, paddingBottom: 32 },

  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },

  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listTitle: { fontSize: 14, fontWeight: "800", color: colors.text },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    overflow: "hidden",
  },
  emptyCard: { alignItems: "center", gap: 8, paddingVertical: 26 },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: colors.text },
  emptyText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 17,
    textAlign: "center",
  },

  shopCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 11,
  },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  shopIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  shopMain: { flex: 1 },
  shopName: { fontSize: 13.5, fontWeight: "800", color: colors.text },
  shopSub: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  alertDot: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.stockLowBg,
    alignItems: "center",
    justifyContent: "center",
  },
  alertDotText: { fontSize: 10, fontWeight: "900", color: colors.stockLow },

  miniStats: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  miniStat: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  miniStatValue: { fontSize: 10.5, fontWeight: "800", color: colors.text, flexShrink: 1 },
  miniStatLabel: { fontSize: 8, fontWeight: "700", color: colors.textMuted },

  shopHero: { flexDirection: "row", alignItems: "center", gap: 12 },
  shopAvatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  shopHeroText: { flex: 1 },
  shopTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  shopOwner: { fontSize: 12, fontWeight: "700", color: colors.primary, marginTop: 2 },
  shopEmail: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },

  statsRow: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 15, fontWeight: "800", color: colors.text },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.stockLowBg,
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  alertText: { fontSize: 10.5, fontWeight: "800", color: colors.stockLow },
  memberSince: { fontSize: 10, fontWeight: "600", color: colors.textMuted, marginTop: 10 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  field: { marginBottom: 11 },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 13,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
  },
  inputWrapMultiline: { height: 88, alignItems: "flex-start", paddingTop: 12 },
  iconTop: { marginTop: 1 },
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, padding: 0 },
  inputMultiline: { height: 66, textAlignVertical: "top" },

  saveBtn: {
    height: 48,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginBottom: 10,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.stockOut, lineHeight: 16 },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.stockOkBg,
    borderRadius: 12,
    padding: 11,
    marginBottom: 10,
  },
  successText: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.stockOk, lineHeight: 16 },

  loader: { paddingVertical: 16 },

  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  productIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  productText: { flex: 1 },
  productName: { fontSize: 12, fontWeight: "800", color: colors.text },
  productMeta: { fontSize: 9.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },

  statusBadge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  statusText: { fontSize: 8.5, fontWeight: "900", textTransform: "uppercase" },
  statusOk: { backgroundColor: colors.stockOkBg },
  statusOkText: { color: colors.stockOk },
  statusLow: { backgroundColor: colors.stockLowBg },
  statusLowText: { color: colors.stockLow },
  statusOut: { backgroundColor: colors.stockOutBg },
  statusOutText: { color: colors.stockOut },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});

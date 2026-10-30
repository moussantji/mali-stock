/**
 * Onglet Profil — compte utilisateur : identité, sécurité (2FA),
 * statistiques de stock, déconnexion.
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { colors, shadows, spacing } from "../theme";
import { formatFcfa, formatDateShort, formatNumber } from "../data";
import type { StockSummary } from "../api/products";
import { useAppDialog } from "../ui/AppDialog";

interface Props {
  summary: StockSummary | null;
  onOpenSecurity: () => void;
  onOpenStock: () => void;
  onOpenAdmin: () => void;
}

export function ProfileScreen({ summary, onOpenSecurity, onOpenStock, onOpenAdmin }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut, getTwoFactorStatus, isSubmitting } = useAuth();
  const dialog = useAppDialog();
  const [twoFactorOn, setTwoFactorOn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getTwoFactorStatus().then((status) => {
      if (active) setTwoFactorOn(status?.enabled ?? false);
    });
    return () => {
      active = false;
    };
  }, [getTwoFactorStatus]);

  const initials =
    user?.name
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "MS";

  const confirmSignOut = async () => {
    const confirmed = await dialog.confirm({
      title: "Déconnexion",
      message: "Veux-tu vraiment te déconnecter ?",
      variant: "danger",
      icon: "log-out-outline",
      confirmLabel: "Se déconnecter",
      cancelLabel: "Annuler",
    });
    if (confirmed) await signOut();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Profil</Text>

        {/* Carte identité */}
        <View style={[styles.card, shadows.card]}>
          <View style={styles.identityRow}>
            <LinearGradient colors={[colors.goldLight, colors.gold]} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>{user?.name ?? "Mali Stock"}</Text>
              <Text style={styles.email} numberOfLines={1}>{user?.email ?? ""}</Text>
              <View style={styles.chips}>
                <View style={styles.chipRole}>
                  <Ionicons
                    name={user?.isAdmin ? "shield-checkmark-outline" : "storefront-outline"}
                    size={11}
                    color={colors.primary}
                  />
                  <Text style={styles.chipRoleText}>
                    {user?.isAdmin ? "Administrateur" : "Compte vendeur"}
                  </Text>
                </View>
                <View style={styles.chipOk}>
                  <Ionicons name="checkmark-circle" size={11} color={colors.stockOk} />
                  <Text style={styles.chipOkText}>Email vérifié</Text>
                </View>
                <View style={twoFactorOn ? styles.chipOk : styles.chipWarn}>
                  <Ionicons
                    name={twoFactorOn ? "shield-checkmark" : "shield-outline"}
                    size={11}
                    color={twoFactorOn ? colors.stockOk : colors.goldDark}
                  />
                  <Text style={twoFactorOn ? styles.chipOkText : styles.chipWarnText}>
                    2FA {twoFactorOn ? "activée" : "désactivée"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          {user?.createdAt ? (
            <Text style={styles.memberSince}>
              Membre depuis {formatDateShort(user.createdAt)}
            </Text>
          ) : null}
        </View>

        {/* Statistiques de stock */}
        {summary ? (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.sectionLabel}>Ton stock</Text>
            <View style={styles.statsRow}>
              <StatCell value={formatNumber(summary.totalProducts)} label="Produits" />
              <StatCell value={formatNumber(summary.totalUnits)} label="Unités" />
              <StatCell value={formatFcfa(summary.stockValue).replace(" FCFA", "")} label="Valeur (F)" />
            </View>
          </View>
        ) : null}

        {/* Actions */}
        <View style={[styles.card, shadows.card]}>
          <Text style={styles.sectionLabel}>Compte</Text>

          {user?.isAdmin ? (
            <Row
              icon="settings-outline"
              label="Administration"
              sub="Gérer les boutiques et les comptes vendeurs"
              tone="gold"
              onPress={onOpenAdmin}
            />
          ) : null}

          <Row
            icon="shield-checkmark-outline"
            label="Sécurité & double validation"
            sub="2FA, codes de secours, appareils de confiance"
            tone="primary"
            onPress={onOpenSecurity}
          />
          <Row
            icon="cube-outline"
            label="Gérer mon stock"
            sub="Produits, mouvements, QR codes"
            tone="gold"
            onPress={onOpenStock}
          />
          <Row
            icon="log-out-outline"
            label="Se déconnecter"
            sub={isSubmitting ? "Déconnexion…" : "Fermer la session sur ce téléphone"}
            tone="danger"
            onPress={() => void confirmSignOut()}
          />
        </View>

        <Text style={styles.footer}>Mali Stock · Bogolan Tricolore · v1.0</Text>
      </ScrollView>
    </View>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({
  icon,
  label,
  sub,
  tone,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sub: string;
  tone: "primary" | "gold" | "danger";
  onPress?: () => void;
  disabled?: boolean;
}) {
  const toneColor = tone === "primary" ? colors.primary : tone === "gold" ? colors.goldDark : colors.stockOut;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${toneColor}14` }]}>
        <Ionicons name={icon} size={18} color={toneColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },

  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginTop: spacing.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },

  identityRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onGold, fontSize: 18, fontWeight: "800" },
  identityText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "800", color: colors.text },
  email: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chipRole: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(10,107,69,0.10)",
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  chipRoleText: { fontSize: 10, fontWeight: "800", color: colors.primary },
  chipOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.stockOkBg,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  chipOkText: { fontSize: 10, fontWeight: "800", color: colors.stockOk },
  chipWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  chipWarnText: { fontSize: 10, fontWeight: "800", color: colors.goldDark },
  memberSince: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 10 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  statsRow: { flexDirection: "row" },
  statCell: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 16, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 13.5, fontWeight: "800", color: colors.text },
  rowSub: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: 1 },

  footer: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.textMuted,
    textAlign: "center",
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },

  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
});

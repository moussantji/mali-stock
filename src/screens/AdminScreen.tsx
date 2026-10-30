/**
 * Espace administrateur :
 *  - gestion des boutiques (informations + stock de chaque vendeur) ;
 *  - création et suivi des comptes vendeurs.
 * Seuls les comptes marqués is_admin peuvent accéder à cet écran et à l'API /api/admin.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { apiRequest, ApiError } from "../auth/api";
import { colors, shadows, tricoloreBand } from "../theme";
import { AdminShopsPanel } from "./AdminShopsPanel";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type AdminSection = "shops" | "sellers";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  accountType: "standard" | "pro";
  isAdmin: boolean;
  emailVerified: boolean;
  shopName: string | null;
  shopCategory: string | null;
  shopCity: string | null;
  createdAt: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({
  label,
  icon,
  right,
  ...inputProps
}: { label: string; icon: IconName; right?: React.ReactNode } & Omit<
  React.ComponentProps<typeof TextInput>,
  "style"
>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name={icon} size={17} color={colors.textMuted} />
        <TextInput
          {...inputProps}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
        />
        {right}
      </View>
    </View>
  );
}

/* ── Onglet « Comptes vendeurs » ─────────────────────────── */
function SellersPanel() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [shopName, setShopName] = useState("");
  const [shopCategory, setShopCategory] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string; password: string } | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiRequest<{ users: AdminUser[] }>("/api/admin/users", { token });
      setUsers(data.users ?? []);
    } catch (requestError) {
      setMessage(
        requestError instanceof ApiError
          ? requestError.message
          : "Impossible de charger les comptes."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const submit = async () => {
    Keyboard.dismiss();
    setMessage(null);
    setSuccess(null);

    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanEmail = email.trim().toLowerCase();
    const cleanShopName = shopName.trim();

    if (cleanName.length < 2) {
      setMessage("Renseigne le nom complet du vendeur (2 caractères minimum).");
      return;
    }
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setMessage("Renseigne une adresse email valide.");
      return;
    }
    if (password.length < 8) {
      setMessage("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (cleanShopName.length < 2) {
      setMessage("Indique le nom de la boutique (2 caractères minimum).");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<{ user: AdminUser }>("/api/admin/users", {
        method: "POST",
        token,
        body: {
          role: "seller",
          name: cleanName,
          email: cleanEmail,
          password,
          shopName: cleanShopName,
          shopCategory: shopCategory.trim(),
          shopCity: shopCity.trim(),
        },
      });
      setSuccess({ email: cleanEmail, password });
      setName("");
      setEmail("");
      setPassword("");
      setShopName("");
      setShopCategory("");
      setShopCity("");
      await loadUsers();
    } catch (requestError) {
      setMessage(
        requestError instanceof ApiError
          ? requestError.message
          : "Impossible de créer le compte vendeur."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, shadows.card]}>
        <View style={styles.cardBand}>
          {tricoloreBand.map((color) => (
            <View key={color} style={[styles.cardBandPart, { backgroundColor: color }]} />
          ))}
        </View>

        <Text style={styles.sectionLabel}>Nouveau compte vendeur</Text>
        <Text style={styles.hint}>
          Le compte est vérifié immédiatement : le vendeur peut se connecter dès que tu lui
          communiques ses identifiants.
        </Text>

        <Field
          label="Nom complet"
          icon="person-outline"
          value={name}
          onChangeText={setName}
          placeholder="Aminata Diallo"
          autoCapitalize="words"
          editable={!submitting}
        />
        <Field
          label="Adresse email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="vendeur@exemple.ml"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />
        <Field
          label="Mot de passe"
          icon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          placeholder="8 caractères minimum"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          right={
            <Pressable
              onPress={() => setShowPassword((visible) => !visible)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          }
        />
        <Field
          label="Nom de la boutique"
          icon="storefront-outline"
          value={shopName}
          onChangeText={setShopName}
          placeholder="Boutique Bogolan"
          autoCapitalize="words"
          editable={!submitting}
        />
        <Field
          label="Catégorie (facultatif)"
          icon="grid-outline"
          value={shopCategory}
          onChangeText={setShopCategory}
          placeholder="Artisanat, tissus, épicerie…"
          autoCapitalize="sentences"
          editable={!submitting}
        />
        <Field
          label="Ville (facultatif)"
          icon="location-outline"
          value={shopCity}
          onChangeText={setShopCity}
          placeholder="Bamako"
          autoCapitalize="words"
          editable={!submitting}
        />

        {message ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
            <Text style={styles.errorText}>{message}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={17} color={colors.stockOk} />
            <View style={styles.successTextWrap}>
              <Text style={styles.successTitle}>Compte vendeur créé</Text>
              <Text style={styles.successText} selectable>
                {success.email} · {success.password}
              </Text>
              <Text style={styles.successHint}>
                Communique ces identifiants au vendeur. Il pourra changer son mot de passe dans
                son profil.
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Créer le compte vendeur"
          style={({ pressed }) => [pressed && styles.pressed, submitting && styles.disabled]}
        >
          <LinearGradient
            colors={[colors.primaryLight, colors.primaryDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.submitBtn, shadows.primaryButton]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Ionicons name="storefront-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.submitText}>Créer le compte vendeur</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <View style={[styles.card, shadows.card]}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionLabel}>Comptes ({users.length})</Text>
          <Pressable
            onPress={() => void loadUsers()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Actualiser la liste des comptes"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : users.length === 0 ? (
          <Text style={styles.hint}>Aucun compte pour le moment.</Text>
        ) : (
          users.map((item) => (
            <View key={item.id} style={styles.userRow}>
              <View style={styles.userIcon}>
                <Ionicons
                  name={item.isAdmin ? "shield-checkmark-outline" : "storefront-outline"}
                  size={17}
                  color={item.isAdmin ? colors.primary : colors.goldDark}
                />
              </View>
              <View style={styles.userText}>
                <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
                {item.shopName ? (
                  <Text style={styles.userShop} numberOfLines={1}>{item.shopName}</Text>
                ) : null}
              </View>
              <View style={[styles.badge, item.isAdmin ? styles.badgeAdmin : styles.badgePro]}>
                <Text style={[styles.badgeText, item.isAdmin ? styles.badgeAdminText : styles.badgeProText]}>
                  {item.isAdmin ? "Admin" : "Vendeur"}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/* ── Écran principal Administration ──────────────────────── */
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>("shops");

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={[styles.shellHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Retour au tableau de bord"
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backLabel}>Retour</Text>
        </Pressable>

        <Text style={styles.pageTitle}>Administration</Text>
        <Text style={styles.pageSubtitle}>
          {user?.name ? `${user.name} · ` : ""}Gère les boutiques et les comptes vendeurs.
        </Text>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setSection("shops")}
            style={[styles.tab, section === "shops" && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === "shops" }}
          >
            <Ionicons
              name="storefront-outline"
              size={15}
              color={section === "shops" ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabText, section === "shops" && styles.tabTextActive]}>
              Boutiques
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSection("sellers")}
            style={[styles.tab, section === "sellers" && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === "sellers" }}
          >
            <Ionicons
              name="people-outline"
              size={15}
              color={section === "sellers" ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.tabText, section === "sellers" && styles.tabTextActive]}>
              Vendeurs
            </Text>
          </Pressable>
        </View>
      </View>

      {section === "shops" ? <AdminShopsPanel /> : <SellersPanel />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  shellHeader: { paddingHorizontal: 16, paddingBottom: 10 },
  page: { paddingHorizontal: 16, gap: 14 },

  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  pageTitle: { fontSize: 27, fontWeight: "800", color: colors.text, marginTop: 2 },
  pageSubtitle: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted, lineHeight: 18, marginTop: 2 },

  tabs: {
    flexDirection: "row",
    backgroundColor: "rgba(27,32,26,0.06)",
    borderRadius: 999,
    padding: 4,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tabActive: { backgroundColor: colors.surface, ...shadows.card },
  tabText: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    overflow: "hidden",
  },
  cardBand: { position: "absolute", top: 0, left: 0, right: 0, height: 4, flexDirection: "row" },
  cardBandPart: { flex: 1 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  hint: { fontSize: 11, fontWeight: "600", color: colors.textMuted, lineHeight: 16, marginBottom: 12 },

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
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, padding: 0 },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.stockOut, lineHeight: 16 },

  successBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOkBg,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  successTextWrap: { flex: 1 },
  successTitle: { fontSize: 12, fontWeight: "800", color: colors.stockOk },
  successText: { fontSize: 11.5, fontWeight: "700", color: colors.text, marginTop: 2 },
  successHint: { fontSize: 10, fontWeight: "600", color: colors.textMuted, lineHeight: 14, marginTop: 4 },

  submitBtn: {
    height: 50,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  submitText: { color: colors.onPrimary, fontSize: 13.5, fontWeight: "800" },

  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  loader: { paddingVertical: 12 },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  userIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceWarm,
  },
  userText: { flex: 1 },
  userName: { fontSize: 12.5, fontWeight: "800", color: colors.text },
  userEmail: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  userShop: { fontSize: 10, fontWeight: "700", color: colors.goldDark, marginTop: 1 },

  badge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.3 },
  badgeAdmin: { backgroundColor: "rgba(10,107,69,0.12)" },
  badgeAdminText: { color: colors.primary },
  badgePro: { backgroundColor: colors.accentSoft },
  badgeProText: { color: colors.goldDark },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});

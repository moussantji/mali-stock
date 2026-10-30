/**
 * Formulaire produit — création et modification.
 * Feuille Bogolan coulissante : nom, code, catégorie, unité, prix,
 * quantité initiale (création seulement), seuil d'alerte, code-barres.
 * Validation alignée sur server/src/routes/products.js.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { colors, spacing, tricoloreBand } from "../theme";
import { parseDecimal } from "../data";
import { productsApi, type ApiProduct, type ProductInput } from "../api/products";
import { useAppDialog } from "../ui/AppDialog";

const UNIT_SUGGESTIONS = ["unité", "rouleau", "balle", "kilo", "litre", "sac", "boîte"];

export interface ProductFormRequest {
  /** Produit à modifier, ou null pour une création. */
  product?: ApiProduct | null;
  /** Code-barres pré-rempli (flux scan → création). */
  prefillBarcode?: string | null;
}

interface Props {
  request: ProductFormRequest | null;
  token: string;
  onClose: () => void;
  onSaved: (product: ApiProduct, created: boolean) => void;
}

interface FormState {
  name: string;
  sku: string;
  category: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  quantity: string;
  minQuantity: string;
  barcode: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  category: "",
  unit: "unité",
  purchasePrice: "",
  salePrice: "",
  quantity: "",
  minQuantity: "",
  barcode: "",
  description: "",
};

function fieldError(form: FormState, mode: "create" | "edit"): string | null {
  const name = form.name.trim();
  if (name.length < 2 || name.length > 160) return "Le nom doit contenir entre 2 et 160 caractères.";

  if (form.sku.trim() !== "") {
    const sku = form.sku.trim().toUpperCase();
    if (sku.length > 40 || !/^[A-Z0-9][A-Z0-9\-_.]*$/.test(sku)) {
      return "Code invalide : lettres, chiffres, - _ . (40 max).";
    }
  }

  const unit = form.unit.trim();
  if (unit === "" || unit.length > 24) return "Indique une unité (rouleau, balle, litre…).";

  for (const [label, raw] of [
    ["Prix d'achat", form.purchasePrice],
    ["Prix de vente", form.salePrice],
    ["Quantité", mode === "create" ? form.quantity : ""],
    ["Seuil d'alerte", form.minQuantity],
  ] as const) {
    if (raw.trim() === "") continue;
    const value = parseDecimal(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1e9) return `${label} invalide.`;
  }

  if (form.barcode.trim() !== "") {
    const barcode = form.barcode.trim();
    if (barcode.length > 64 || !/^[A-Za-z0-9\-_]+$/.test(barcode)) {
      return "Code-barres invalide (lettres et chiffres uniquement).";
    }
  }

  return null;
}

export function ProductFormModal({ request, token, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const dialog = useAppDialog();
  const mode = request?.product ? "edit" : "create";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  const editing = request?.product ?? null;

  useEffect(() => {
    if (!request) return;
    const product = request.product;
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        category: product.category ?? "",
        unit: product.unit,
        purchasePrice: moneyText(product.purchasePrice),
        salePrice: moneyText(product.salePrice),
        quantity: "",
        minQuantity: moneyText(product.minQuantity),
        barcode: product.barcode ?? "",
        description: product.description ?? "",
      });
      setShowDescription((product.description ?? "").length > 0);
    } else {
      setForm({
        ...EMPTY_FORM,
        barcode: request.prefillBarcode ?? "",
      });
      setShowDescription(false);
    }
    setError(null);
  }, [request]);

  const patch = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  const suggestions = useMemo(
    () => UNIT_SUGGESTIONS.filter((u) => u !== form.unit.trim().toLowerCase()).slice(0, 5),
    [form.unit]
  );

  const submit = async () => {
    if (saving) return;
    const validation = fieldError(form, mode);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setSaving(true);

    const optionalNumber = (raw: string): number | undefined => {
      if (raw.trim() === "") return undefined;
      const value = parseDecimal(raw);
      return Number.isFinite(value) ? value : undefined;
    };

    const body: ProductInput = {
      name: form.name.trim().replace(/\s+/g, " "),
      unit: form.unit.trim(),
    };
    if (form.sku.trim() !== "") body.sku = form.sku.trim().toUpperCase();
    if (form.category.trim() !== "") body.category = form.category.trim();
    if (form.barcode.trim() !== "") body.barcode = form.barcode.trim();
    else body.barcode = null;
    if (form.description.trim() !== "") body.description = form.description.trim();
    else body.description = null;

    const purchase = optionalNumber(form.purchasePrice);
    const sale = optionalNumber(form.salePrice);
    const min = optionalNumber(form.minQuantity);
    if (typeof purchase !== "undefined") body.purchasePrice = purchase;
    if (typeof sale !== "undefined") body.salePrice = sale;
    if (typeof min !== "undefined") body.minQuantity = min;

    try {
      if (editing) {
        const { product } = await productsApi.update(token, editing.id, body);
        onSaved(product, false);
      } else {
        const quantity = optionalNumber(form.quantity);
        if (typeof quantity !== "undefined") body.quantity = quantity;
        const { product } = await productsApi.create(token, body);
        onSaved(product, true);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Impossible d'enregistrer. Réessaie."
      );
    } finally {
      setSaving(false);
    }
  };

  const visible = request !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer le formulaire" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.band}>
            {tricoloreBand.map((color) => (
              <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
            ))}
          </View>

          <View style={styles.sheetHead}>
            <View style={[styles.iconWrap, mode === "create" ? styles.iconWrapGreen : styles.iconWrapGold]}>
              <Ionicons name={mode === "create" ? "add-circle-outline" : "create-outline"} size={22} color={mode === "create" ? colors.primary : colors.goldDark} />
            </View>
            <View style={styles.sheetHeadText}>
              <Text style={styles.sheetTitle}>{mode === "create" ? "Nouveau produit" : "Modifier le produit"}</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>
                {editing ? editing.name : "Tissé, teinture, savon… tout ce que tu vends"}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Nom du produit *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(t) => patch({ name: t })}
              placeholder="Ex. Bogolan tissé main · rouleau 10 m"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
            />

            <View style={styles.row2}>
              <View style={styles.col2}>
                <Text style={styles.label}>Code (SKU)</Text>
                <TextInput
                  style={styles.input}
                  value={form.sku}
                  onChangeText={(t) => patch({ sku: t.toUpperCase() })}
                  placeholder="Auto si vide"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.col2}>
                <Text style={styles.label}>Catégorie</Text>
                <TextInput
                  style={styles.input}
                  value={form.category}
                  onChangeText={(t) => patch({ category: t })}
                  placeholder="Tissu, teinture…"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <Text style={styles.label}>Unité *</Text>
            <TextInput
              style={styles.input}
              value={form.unit}
              onChangeText={(t) => patch({ unit: t })}
              placeholder="rouleau, balle, litre…"
              placeholderTextColor={colors.textMuted}
            />
            {suggestions.length > 0 ? (
              <View style={styles.chips}>
                {suggestions.map((unit) => (
                  <Pressable
                    key={unit}
                    onPress={() => patch({ unit })}
                    accessibilityRole="button"
                    accessibilityLabel={`Unité ${unit}`}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  >
                    <Text style={styles.chipText}>{unit}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.row2}>
              <View style={styles.col2}>
                <Text style={styles.label}>Prix d'achat</Text>
                <MoneyInput value={form.purchasePrice} onChange={(t) => patch({ purchasePrice: t })} placeholder="0" />
              </View>
              <View style={styles.col2}>
                <Text style={styles.label}>Prix de vente</Text>
                <MoneyInput value={form.salePrice} onChange={(t) => patch({ salePrice: t })} placeholder="0" />
              </View>
            </View>

            {mode === "create" ? (
              <>
                <Text style={styles.label}>Quantité initiale</Text>
                <TextInput
                  style={styles.input}
                  value={form.quantity}
                  onChangeText={(t) => patch({ quantity: t })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </>
            ) : (
              <Text style={styles.hintInline}>
                Les quantités se gèrent par mouvements (bouton +/− sur la fiche), pour garder un
                journal exact.
              </Text>
            )}

            <Text style={styles.label}>Seuil d'alerte</Text>
            <TextInput
              style={styles.input}
              value={form.minQuantity}
              onChangeText={(t) => patch({ minQuantity: t })}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.hint}>Alerte « stock faible » quand la quantité atteint ce seuil.</Text>

            <Text style={styles.label}>Code-barres</Text>
            <View style={[styles.input, styles.inputRow]}>
              <TextInput
                style={styles.inputInner}
                value={form.barcode}
                onChangeText={(t) => patch({ barcode: t })}
                placeholder="Scan automatique via le bouton caméra"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
              />
              <Ionicons name="barcode-outline" size={20} color={colors.textMuted} />
            </View>

            <Text
              style={styles.label}
              onPress={() => setShowDescription((v) => !v)}
              suppressHighlighting
            >
              {showDescription ? "Description" : "+ Ajouter une description"}
            </Text>
            {showDescription ? (
              <TextInput
                style={[styles.input, styles.textarea]}
                value={form.description}
                onChangeText={(t) => patch({ description: t })}
                placeholder="Détails utiles (couleurs, lot, provenance…)"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.stockOut} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void submit()}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={mode === "create" ? "Créer le produit" : "Enregistrer les modifications"}
              style={({ pressed }) => [pressed && styles.pressed, saving && styles.disabled]}
            >
              <LinearGradient
                colors={[colors.primaryLight, colors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitBtn}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <Ionicons name={mode === "create" ? "add" : "checkmark"} size={18} color={colors.onPrimary} />
                    <Text style={styles.submitText}>
                      {mode === "create" ? "Créer le produit" : "Enregistrer"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable onPress={onClose} hitSlop={8} style={styles.cancelWrap}>
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function moneyText(value: number): string {
  return value === 0 ? "" : String(value);
}

function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (t: string) => void; placeholder?: string }) {
  return (
    <View style={[styles.input, styles.inputRow]}>
      <TextInput
        style={styles.inputInner}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder ?? "0"}
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.currency}>F</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(6, 61, 41, 0.55)" },
  sheet: {
    backgroundColor: colors.surfaceWarm,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: "92%",
    overflow: "hidden",
  },
  band: { height: 4, flexDirection: "row" },
  bandPart: { flex: 1 },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sheetHeadText: { flex: 1 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  sheetSubtitle: { fontSize: 11.5, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapGreen: { backgroundColor: "rgba(10,107,69,0.10)" },
  iconWrapGold: { backgroundColor: "rgba(223,169,33,0.18)" },

  formBody: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, gap: 4 },
  label: {
    fontSize: 10.5,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 10,
  },
  hint: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: -4 },
  hintInline: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 12,
    lineHeight: 15,
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  inputInner: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, padding: 0 },
  textarea: { height: 84, paddingTop: 12, textAlignVertical: "top" },
  currency: { fontSize: 13, fontWeight: "800", color: colors.goldDark },
  row2: { flexDirection: "row", gap: spacing.md },
  col2: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: 11.5, fontWeight: "700", color: colors.primary },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginTop: 14,
  },
  errorText: { flex: 1, fontSize: 11.5, fontWeight: "700", color: colors.stockOut, lineHeight: 16 },

  submitBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 18,
  },
  submitText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },
  cancelWrap: { alignItems: "center", paddingVertical: 14 },
  cancelText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted, textDecorationLine: "underline" },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});

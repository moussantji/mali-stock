/**
 * Mouvement de stock — entrée, sortie, ajustement.
 * Quantités transactionnelles côté serveur (jamais d'écrasement),
 * aperçu du résultat avant validation.
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
import { formatNumber, parseDecimal } from "../data";
import { productsApi, type ApiProduct, type MovementType } from "../api/products";

interface Props {
  request: { product: ApiProduct; defaultType?: MovementType } | null;
  token: string;
  onClose: () => void;
  onDone: (product: ApiProduct, type: MovementType) => void;
}

const TYPES: Array<{
  key: MovementType;
  label: string;
  icon: "arrow-down-circle" | "arrow-up-circle" | "swap-vertical";
  hint: string;
}> = [
  { key: "entry", label: "Entrée", icon: "arrow-down-circle", hint: "Production, réception, achat" },
  { key: "exit", label: "Sortie", icon: "arrow-up-circle", hint: "Vente, distribution, don" },
  { key: "adjustment", label: "Ajustement", icon: "swap-vertical", hint: "Correction d'inventaire" },
];

export function MovementModal({ request, token, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const product = request?.product ?? null;
  const [type, setType] = useState<MovementType>("entry");
  const [quantity, setQuantity] = useState("");
  const [negative, setNegative] = useState(false);
  const [unitPrice, setUnitPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setType(request.defaultType ?? "entry");
    setQuantity("");
    setNegative(false);
    setUnitPrice("");
    setNote("");
    setError(null);
  }, [request]);

  const parsedQuantity = useMemo(() => parseDecimal(quantity), [quantity]);
  const quantityValid = Number.isFinite(parsedQuantity) && parsedQuantity > 0;

  const delta = useMemo(() => {
    if (!quantityValid) return null;
    if (type === "exit") return -Math.abs(parsedQuantity);
    if (type === "adjustment") return negative ? -parsedQuantity : parsedQuantity;
    return parsedQuantity;
  }, [quantityValid, parsedQuantity, type, negative]);

  const projected = useMemo(() => {
    if (!product || delta === null) return null;
    return Math.max(0, Math.round((product.quantity + delta) * 100) / 100);
  }, [product, delta]);

  const negativeResult = product !== null && delta !== null && product.quantity + delta < 0;

  const submit = async () => {
    if (saving || !product) return;
    if (!quantityValid) {
      setError("Indique une quantité supérieure à 0.");
      return;
    }
    if (negativeResult) {
      setError(`Stock insuffisant : ${formatNumber(product.quantity)} ${product.unit} disponibles.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const price = parseDecimal(unitPrice);
      /* Serveur : sortie reçoit une quantité positive (signée en base),
         ajustement reçoit une valeur signée. */
      const signedQuantity =
        type === "exit" ? Math.abs(parsedQuantity) : type === "adjustment" ? delta ?? parsedQuantity : parsedQuantity;
      const { product: fresh } = await productsApi.move(token, product.id, {
        type,
        quantity: signedQuantity,
        unitPrice: Number.isFinite(price) && price > 0 ? price : undefined,
        note: note.trim() !== "" ? note.trim() : undefined,
      });
      onDone(fresh, type);
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Mouvement impossible. Réessaie."
      );
    } finally {
      setSaving(false);
    }
  };

  const visible = request !== null;
  const activeMeta = TYPES.find((t) => t.key === type) ?? TYPES[0];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.band}>
            {tricoloreBand.map((color) => (
              <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
            ))}
          </View>

          <View style={styles.sheetHead}>
            <View style={styles.tile}>
              <Text style={styles.tileText}>{product?.initials ?? ""}</Text>
            </View>
            <View style={styles.sheetHeadText}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{product?.name ?? ""}</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>
                {product ? `${product.sku} · ${formatNumber(product.quantity)} ${product.unit} en stock` : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Choix du type */}
            <View style={styles.typeRow}>
              {TYPES.map((t) => {
                const active = t.key === type;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setType(t.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Mouvement : ${t.label}`}
                    style={[styles.typeBtn, active && styles.typeBtnActive]}
                  >
                    <Ionicons
                      name={t.icon}
                      size={20}
                      color={active ? (t.key === "exit" ? colors.stockOut : colors.primary) : colors.textMuted}
                    />
                    <Text style={[styles.typeText, active && styles.typeTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.typeHint}>{activeMeta.hint}</Text>

            {/* Ajustement : signe */}
            {type === "adjustment" ? (
              <View style={styles.signRow}>
                <Pressable
                  onPress={() => setNegative(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Incrémenter le stock"
                  style={[styles.signBtn, !negative && styles.signBtnActive]}
                >
                  <Ionicons name="add" size={16} color={!negative ? colors.primary : colors.textMuted} />
                  <Text style={[styles.signText, !negative && styles.signTextActive]}>Incrémenter</Text>
                </Pressable>
                <Pressable
                  onPress={() => setNegative(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Décrémenter le stock"
                  style={[styles.signBtn, negative && styles.signBtnActiveNegative]}
                >
                  <Ionicons name="remove" size={16} color={negative ? colors.stockOut : colors.textMuted} />
                  <Text style={[styles.signText, negative && styles.signTextActiveNegative]}>Décrémenter</Text>
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.label}>{type === "exit" ? "Quantité sortie *" : "Quantité *"}</Text>
            <View style={[styles.input, styles.inputRow, styles.quantityInput]}>
              <TextInput
                style={[styles.inputInner, styles.quantityText]}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <Text style={styles.unitText}>{product?.unit ?? ""}</Text>
            </View>

            {delta !== null && product ? (
              <View style={[styles.preview, negativeResult && styles.previewBad]}>
                <Ionicons
                  name={negativeResult ? "warning" : "git-compare-outline"}
                  size={16}
                  color={negativeResult ? colors.stockOut : colors.primary}
                />
                <Text style={[styles.previewText, negativeResult && styles.previewTextBad]}>
                  {negativeResult
                    ? `Impossible : ${formatNumber(product.quantity)} ${product.unit} seulement en stock.`
                    : `Résultat : ${formatNumber(product.quantity)} ${product.unit} → ${formatNumber(projected ?? 0)} ${product.unit}`}
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>
              {type === "entry" ? "Prix d'achat unitaire" : type === "exit" ? "Prix de vente unitaire" : "Prix unitaire"}
            </Text>
            <View style={[styles.input, styles.inputRow]}>
              <TextInput
                style={styles.inputInner}
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.currency}>FCFA</Text>
            </View>

            <Text style={styles.label}>Note (journal)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Ex. Réception atelier, vente marché Sogoniko…"
              placeholderTextColor={colors.textMuted}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.stockOut} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void submit()}
              disabled={saving || !quantityValid || negativeResult}
              accessibilityRole="button"
              accessibilityLabel={`Valider le mouvement ${activeMeta.label}`}
              style={({ pressed }) => [
                pressed && styles.pressed,
                (saving || !quantityValid || negativeResult) && styles.disabled,
              ]}
            >
              <LinearGradient
                colors={type === "exit" ? [colors.stockOut, colors.stockOut] : [colors.primaryLight, colors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitBtn}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
                    <Text style={styles.submitText}>
                      Valider {activeMeta.label.toLowerCase()}
                      {delta !== null && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${formatNumber(delta)})` : ""}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(6, 61, 41, 0.55)" },
  sheet: {
    backgroundColor: colors.surfaceWarm,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: "90%",
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
    paddingBottom: 6,
  },
  sheetHeadText: { flex: 1 },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
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
  tile: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,107,69,0.10)",
  },
  tileText: { fontSize: 14, fontWeight: "800", color: colors.primary },

  formBody: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6, gap: 4 },

  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeBtnActive: { borderColor: colors.primary, backgroundColor: "rgba(10,107,69,0.07)" },
  typeText: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  typeTextActive: { color: colors.primary },
  typeHint: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
  },

  signRow: { flexDirection: "row", gap: spacing.sm, marginTop: 10 },
  signBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  signBtnActive: { borderColor: colors.primary, backgroundColor: "rgba(10,107,69,0.07)" },
  signBtnActiveNegative: { borderColor: colors.stockOut, backgroundColor: colors.stockOutBg },
  signText: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  signTextActive: { color: colors.primary },
  signTextActiveNegative: { color: colors.stockOut },

  label: {
    fontSize: 10.5,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 14,
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    marginTop: 6,
  },
  inputRow: { flexDirection: "row", alignItems: "center" },
  inputInner: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, padding: 0 },
  quantityInput: { height: 58 },
  quantityText: { fontSize: 22, fontWeight: "800" },
  unitText: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  currency: { fontSize: 12.5, fontWeight: "800", color: colors.goldDark },
  noteInput: { height: 46 },

  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10,107,69,0.08)",
    borderRadius: 12,
    padding: 11,
    marginTop: 10,
  },
  previewBad: { backgroundColor: colors.stockOutBg },
  previewText: { flex: 1, fontSize: 12.5, fontWeight: "800", color: colors.primary },
  previewTextBad: { color: colors.stockOut },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
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

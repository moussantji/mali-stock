/**
 * Modales de traitement d'une commande côté vendeur :
 *  - ConfirmOrderModal : confirmer / ajuster la quantité demandée ;
 *  - PaymentModal : encaisser en espèces ou mobile money (sortie de stock) ;
 *  - DeclineOrderModal : refuser avec un motif pour le client.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { formatDateTimeShort, formatFcfa, formatQuantity, parseDecimal } from "../data";
import {
  ordersApi,
  PAYMENT_METHOD_HINT,
  PAYMENT_METHOD_LABEL,
  type ApiOrder,
  type PaymentMethod,
} from "../api/orders";
import type { ApiProduct } from "../api/products";
import { OrderStatusChip } from "../ui/OrderStatusChip";
import { useAppDialog } from "../ui/AppDialog";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/* ── Coquille commune ─────────────────────────────────────── */

function Sheet({
  visible,
  onClose,
  icon,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  icon: IconName;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.band}>
            {tricoloreBand.map((color) => (
              <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
            ))}
          </View>
          <View style={styles.head}>
            <View style={styles.headIcon}>
              <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.headText}>
              <Text style={styles.headTitle}>{title}</Text>
              <Text style={styles.headSub}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ── Récapitulatif partagé ────────────────────────────────── */

function OrderSummary({ order }: { order: ApiOrder }) {
  const unit = order.product.unit ?? "unité";
  return (
    <View style={styles.summary}>
      <View style={styles.summaryTop}>
        <View style={styles.clientAvatar}>
          <Text style={styles.clientInitials}>{order.client?.initials ?? "MS"}</Text>
        </View>
        <View style={styles.summaryTopText}>
          <Text style={styles.clientName} numberOfLines={1}>{order.client?.name ?? "Client comptoir"}</Text>
          <Text style={styles.summaryMeta} numberOfLines={1}>
            {order.client?.accountType === "pro"
              ? "Compte vendeur"
              : order.client?.accountType === "standard"
                ? "Compte client historique"
                : order.client?.phone
                  ? order.client.phone
                  : "Client comptoir"}{" "}
            · {formatDateTimeShort(order.createdAt)}
          </Text>
        </View>
        <OrderStatusChip status={order.status} compact />
      </View>
      <View style={styles.summaryDivider} />
      <Text style={styles.summaryProduct}>{order.product.name ?? "Produit"}</Text>
      <Text style={styles.summaryMeta}>{order.product.sku ?? ""}</Text>
      <View style={styles.summaryAmounts}>
        <View>
          <Text style={styles.amountLabel}>Demandé</Text>
          <Text style={styles.amountValue}>{formatQuantity(order.quantity)} {unit}</Text>
        </View>
        <View>
          <Text style={styles.amountLabel}>Prix unitaire</Text>
          <Text style={styles.amountValue}>{formatFcfa(order.unitPrice)}</Text>
        </View>
        <View style={styles.summaryTotal}>
          <Text style={styles.amountLabel}>Total</Text>
          <Text style={styles.summaryTotalValue}>{formatFcfa(order.total)}</Text>
        </View>
      </View>
      {order.note ? (
        <View style={styles.clientNote}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
          <Text style={styles.clientNoteText}>{order.note}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── Confirmation / ajustement de quantité ────────────────── */

export function ConfirmOrderModal({
  order,
  token,
  stock,
  onClose,
  onDone,
}: {
  order: ApiOrder | null;
  token: string;
  stock: number | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const dialog = useAppDialog();
  const [qtyText, setQtyText] = useState("1");
  const [vendorNote, setVendorNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setQtyText(String(order.quantity).replace(".", ","));
    setVendorNote("");
    setError(null);
    setSubmitting(false);
  }, [order]);

  if (!order) {
    return <Sheet visible={false} onClose={onClose} icon="checkmark-circle-outline" title="" subtitle="">{null}</Sheet>;
  }

  const unit = order.product.unit ?? "unité";
  const quantity = parseDecimal(qtyText);
  const validQuantity = Number.isFinite(quantity) && quantity > 0;
  const insufficient = validQuantity && stock !== null && quantity > stock;

  const step = (delta: number) => {
    const current = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const next = Math.max(0.01, Math.round((current + delta) * 100) / 100);
    setQtyText(String(next).replace(".", ","));
    setError(null);
  };

  const submit = async () => {
    if (!validQuantity) {
      setError("Indique une quantité valide (supérieure à 0).");
      return;
    }
    if (stock !== null && quantity > stock) {
      setError(`Stock insuffisant : ${formatQuantity(stock)} ${unit} disponibles.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await ordersApi.confirm(token, order.id, {
        confirmedQuantity: quantity,
        vendorNote: vendorNote.trim() || null,
      });
      await onDone();
      onClose();
      await dialog.alert({
        title: "Commande confirmée",
        message: [
          `${formatQuantity(quantity)} ${unit} réservés pour ${order.client?.name ?? "le client"}.`,
          "Encaisse dès que le client se présente au comptoir.",
        ].join("\n"),
        variant: "success",
        icon: "checkmark-circle-outline",
        confirmLabel: "OK",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Impossible de confirmer la commande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      icon="checkmark-circle-outline"
      title="Confirmer la commande"
      subtitle="Ajuste la quantité réellement disponible"
    >
      <OrderSummary order={order} />

      <View style={[styles.stockRow, insufficient && styles.stockRowDanger]}>
        <Ionicons
          name={insufficient ? "alert-circle" : "cube-outline"}
          size={16}
          color={insufficient ? colors.stockOut : colors.primary}
        />
        <Text style={[styles.stockText, insufficient && { color: colors.stockOut }]}>
          {stock !== null
            ? `Stock actuel : ${formatQuantity(stock)} ${unit}`
            : "Le stock sera vérifié à la confirmation."}
        </Text>
      </View>

      <Text style={styles.fieldLabel}>Quantité confirmée</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => step(-1)}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Diminuer la quantité"
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, submitting && styles.disabled]}
        >
          <Ionicons name="remove" size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.qtyWrap}>
          <TextInput
            value={qtyText}
            onChangeText={(text) => {
              setQtyText(text);
              setError(null);
            }}
            keyboardType="decimal-pad"
            editable={!submitting}
            style={styles.qtyInput}
            selectTextOnFocus
            accessibilityLabel="Quantité confirmée"
          />
          <Text style={styles.qtyUnit} numberOfLines={1}>{unit}</Text>
        </View>
        <Pressable
          onPress={() => step(1)}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Augmenter la quantité"
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, submitting && styles.disabled]}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </Pressable>
      </View>
      {quantity !== order.quantity && validQuantity ? (
        <Text style={styles.adjustHint}>
          Quantité ajustée : le total sera recalculé à {formatFcfa(quantity * order.unitPrice)}.
        </Text>
      ) : null}

      <Text style={styles.fieldLabel}>Note pour la commande (facultatif)</Text>
      <TextInput
        value={vendorNote}
        onChangeText={setVendorNote}
        placeholder="Ex. commande préparée pour vendredi"
        placeholderTextColor={colors.textMuted}
        maxLength={255}
        editable={!submitting}
        multiline
        style={styles.noteInput}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.stockOut} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Confirmer la commande"
        style={({ pressed }) => [styles.ctaPress, pressed && styles.pressed, submitting && styles.disabled]}
      >
        <LinearGradient
          colors={[colors.primaryLight, colors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cta}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
              <Text style={styles.ctaText}>Confirmer la commande</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Sheet>
  );
}

/* ── Encaissement ─────────────────────────────────────────── */

const PAYMENT_OPTIONS: Array<{
  key: PaymentMethod;
  icon: IconName;
  fg: string;
  bg: string;
}> = [
  { key: "cash", icon: "cash-outline", fg: colors.goldDark, bg: "rgba(223,169,33,0.18)" },
  { key: "orange_money", icon: "phone-portrait-outline", fg: colors.red, bg: "rgba(178,58,46,0.12)" },
  { key: "moov", icon: "phone-portrait-outline", fg: colors.primary, bg: "rgba(10,107,69,0.12)" },
  { key: "wave", icon: "phone-portrait-outline", fg: colors.primaryDeep, bg: "rgba(6,61,41,0.10)" },
];

export function PaymentModal({
  order,
  token,
  onClose,
  onDone,
}: {
  order: ApiOrder | null;
  token: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const dialog = useAppDialog();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setMethod(null);
    setReference("");
    setError(null);
    setSubmitting(false);
  }, [order]);

  if (!order) {
    return <Sheet visible={false} onClose={onClose} icon="wallet-outline" title="" subtitle="">{null}</Sheet>;
  }

  const unit = order.product.unit ?? "unité";
  const quantity = order.confirmedQuantity ?? order.quantity;
  const total = Math.round(quantity * order.unitPrice * 100) / 100;

  const submit = async () => {
    if (!method) {
      setError("Choisis le mode de paiement (espèces ou mobile money).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await ordersApi.complete(token, order.id, {
        paymentMethod: method,
        paymentReference: method === "cash" ? null : reference.trim() || null,
      });
      await onDone();
      onClose();
      await dialog.alert({
        title: "Encaissement enregistré",
        message: [
          `${formatFcfa(total)} reçus par ${PAYMENT_METHOD_LABEL[method]}.`,
          `${formatQuantity(quantity)} ${unit} sortis du stock automatiquement.`,
          reference.trim() && method !== "cash" ? `Référence : ${reference.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        variant: "success",
        icon: "checkmark-done-circle-outline",
        confirmLabel: "OK",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Impossible d'encaisser cette commande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      icon="wallet-outline"
      title="Encaisser la commande"
      subtitle="Le stock sort automatiquement après validation"
    >
      <OrderSummary order={order} />

      <Text style={styles.fieldLabel}>Mode de paiement</Text>
      <View style={styles.methodGrid}>
        {PAYMENT_OPTIONS.map((option) => {
          const active = method === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => {
                setMethod(option.key);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={PAYMENT_METHOD_LABEL[option.key]}
              style={[styles.methodCard, active && styles.methodCardActive]}
            >
              <View style={[styles.methodIcon, { backgroundColor: option.bg }]}>
                <Ionicons name={option.icon} size={18} color={option.fg} />
              </View>
              <View style={styles.methodText}>
                <Text style={styles.methodName}>{PAYMENT_METHOD_LABEL[option.key]}</Text>
                <Text style={styles.methodSub} numberOfLines={1}>
                  {option.key === "cash" ? "Au comptoir" : "Mobile money"}
                </Text>
              </View>
              {active ? <Ionicons name="checkmark-circle" size={17} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>

      {method ? <Text style={styles.methodHint}>{PAYMENT_METHOD_HINT[method]}</Text> : null}

      {method && method !== "cash" ? (
        <>
          <Text style={styles.fieldLabel}>Référence de la transaction (facultatif)</Text>
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="Ex. OM-2026-00123"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            autoCapitalize="characters"
            editable={!submitting}
            style={styles.input}
          />
          <Text style={styles.adjustHint}>
            Note la référence pour ton suivi. L'API de paiement réelle sera branchée plus tard.
          </Text>
        </>
      ) : null}

      <View style={styles.totalCard}>
        <View style={styles.totalCardText}>
          <Text style={styles.totalCardLabel}>Montant à encaisser</Text>
          <Text style={styles.totalCardHint}>
            {formatQuantity(quantity)} {unit} × {formatFcfa(order.unitPrice)}
          </Text>
        </View>
        <Text style={styles.totalCardValue}>{formatFcfa(total)}</Text>
      </View>

      <View style={styles.stockOutRow}>
        <Ionicons name="cube-outline" size={14} color={colors.goldDark} />
        <Text style={styles.stockOutText}>
          {formatQuantity(quantity)} {unit} sortiront du stock après validation.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.stockOut} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Encaisser et valider la commande"
        style={({ pressed }) => [styles.ctaPress, pressed && styles.pressed, submitting && styles.disabled]}
      >
        <LinearGradient
          colors={[colors.primaryLight, colors.primaryDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cta}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="wallet" size={18} color={colors.onPrimary} />
              <Text style={styles.ctaText}>Encaisser et valider</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Sheet>
  );
}

/* ── Refus ────────────────────────────────────────────────── */

export function DeclineOrderModal({
  order,
  token,
  onClose,
  onDone,
}: {
  order: ApiOrder | null;
  token: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const dialog = useAppDialog();
  const [vendorNote, setVendorNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setVendorNote("");
    setError(null);
    setSubmitting(false);
  }, [order]);

  if (!order) {
    return <Sheet visible={false} onClose={onClose} icon="close-circle-outline" title="" subtitle="">{null}</Sheet>;
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await ordersApi.decline(token, order.id, vendorNote.trim() || null);
      await onDone();
      onClose();
      await dialog.alert({
        title: "Commande refusée",
        message: "La commande est clôturée. Le stock n'a pas été modifié.",
        variant: "info",
        icon: "close-circle-outline",
        confirmLabel: "OK",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Impossible de refuser la commande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      icon="close-circle-outline"
      title="Refuser la commande"
      subtitle="La commande sera clôturée sans toucher au stock"
    >
      <OrderSummary order={order} />

      <Text style={styles.fieldLabel}>Motif du refus (facultatif)</Text>
      <TextInput
        value={vendorNote}
        onChangeText={setVendorNote}
        placeholder="Ex. stock réservé pour un autre client"
        placeholderTextColor={colors.textMuted}
        maxLength={255}
        editable={!submitting}
        multiline
        style={styles.noteInput}
      />

      <View style={styles.declineWarning}>
        <Ionicons name="information-circle-outline" size={15} color={colors.stockOut} />
        <Text style={styles.declineWarningText}>
          Le stock n'est pas modifié. Tu pourras créer une nouvelle commande si besoin.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.stockOut} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Refuser la commande"
        style={({ pressed }) => [styles.ctaPress, pressed && styles.pressed, submitting && styles.disabled]}
      >
        <LinearGradient
          colors={[colors.redLight, colors.red]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cta}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="close-circle" size={18} color="#FFFFFF" />
              <Text style={styles.ctaText}>Refuser la commande</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Sheet>
  );
}

/* ── Création d'une commande vendeur ──────────────────────── */

export function CreateOrderModal({
  visible,
  token,
  products,
  onClose,
  onDone,
}: {
  visible: boolean;
  token: string;
  products: ApiProduct[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const dialog = useAppDialog();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setSelectedId(null);
    setQtyText("1");
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setError(null);
    setSubmitting(false);
  }, [visible]);

  const selected = products.find((product) => product.id === selectedId) ?? null;
  const unit = selected?.unit ?? "unité";
  const quantity = parseDecimal(qtyText);
  const validQuantity = Number.isFinite(quantity) && quantity > 0;
  const insufficient = Boolean(selected && validQuantity && quantity > selected.quantity);
  const total = selected && validQuantity ? Math.round(quantity * selected.salePrice * 100) / 100 : 0;

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products
      .filter((product) => product.quantity > 0)
      .filter(
        (product) =>
          !needle ||
          product.name.toLowerCase().includes(needle) ||
          product.sku.toLowerCase().includes(needle) ||
          (product.category ?? "").toLowerCase().includes(needle)
      )
      .slice(0, 20);
  }, [products, query]);

  const step = (delta: number) => {
    const current = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const next = Math.max(0.01, Math.round((current + delta) * 100) / 100);
    setQtyText(String(next).replace(".", ","));
    setError(null);
  };

  const submit = async () => {
    if (submitting) return;
    if (!selected) {
      setError("Choisis le produit concerné par la commande.");
      return;
    }
    if (!validQuantity) {
      setError("Indique une quantité supérieure à 0.");
      return;
    }
    if (quantity > selected.quantity) {
      setError(`Stock insuffisant : ${formatQuantity(selected.quantity)} ${unit} disponibles.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await ordersApi.createManual(token, {
        productId: selected.id,
        quantity,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        note: note.trim() || null,
      });
      await onDone();
      onClose();
      await dialog.alert({
        title: "Commande enregistrée",
        message: [
          `${formatQuantity(quantity)} ${unit} · ${selected.name}`,
          customerName.trim() ? `Client : ${customerName.trim()}` : "Client comptoir",
          "Tu peux maintenant la confirmer puis l'encaisser.",
        ].join("\n"),
        variant: "success",
        icon: "receipt-outline",
        confirmLabel: "OK",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : "Impossible d'enregistrer cette commande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="add-circle-outline"
      title="Nouvelle commande"
      subtitle="Enregistre une vente ou une réservation comptoir"
    >
      {!selected ? (
        <>
          <View style={styles.pickerIntro}>
            <Ionicons name="cube-outline" size={15} color={colors.primary} />
            <Text style={styles.pickerIntroText}>
              Choisis un produit de ton stock. Les produits en rupture ne sont pas proposés.
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={17} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un produit…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {results.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Ionicons name="cube-outline" size={24} color={colors.textMuted} />
              <Text style={styles.pickerEmptyText}>
                {products.some((product) => product.quantity > 0)
                  ? "Aucun produit ne correspond à cette recherche."
                  : "Aucun produit en stock. Ajoute d'abord un produit dans ton inventaire."}
              </Text>
            </View>
          ) : (
            results.map((product) => (
              <Pressable
                key={product.id}
                onPress={() => {
                  setSelectedId(product.id);
                  setQtyText("1");
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Choisir ${product.name}`}
                style={({ pressed }) => [styles.productOption, pressed && styles.pressed]}
              >
                <View style={styles.productOptionIcon}>
                  <Ionicons name="cube-outline" size={17} color={colors.primary} />
                </View>
                <View style={styles.productOptionText}>
                  <Text style={styles.productOptionName} numberOfLines={1}>{product.name}</Text>
                  <Text style={styles.productOptionMeta} numberOfLines={1}>
                    {product.sku} · {formatQuantity(product.quantity)} {product.unit} en stock
                  </Text>
                </View>
                <View style={styles.productOptionRight}>
                  <Text style={styles.productOptionPrice}>{formatFcfa(product.salePrice)}</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                </View>
              </Pressable>
            ))
          )}
        </>
      ) : (
        <>
          <View style={styles.selectedProduct}>
            <View style={styles.selectedProductIcon}>
              <Ionicons name="cube" size={18} color={colors.primary} />
            </View>
            <View style={styles.selectedProductText}>
              <Text style={styles.selectedProductName} numberOfLines={1}>{selected.name}</Text>
              <Text style={styles.selectedProductMeta} numberOfLines={1}>
                {selected.sku} · {formatFcfa(selected.salePrice)} / {selected.unit}
              </Text>
            </View>
            <Pressable
              onPress={() => setSelectedId(null)}
              accessibilityRole="button"
              accessibilityLabel="Changer de produit"
              hitSlop={8}
            >
              <Text style={styles.changeLink}>Changer</Text>
            </Pressable>
          </View>

          <View style={styles.stockHintRow}>
            <Ionicons name="layers-outline" size={14} color={colors.primary} />
            <Text style={styles.stockHintText}>
              Stock disponible : {formatQuantity(selected.quantity)} {selected.unit}
            </Text>
          </View>

          <Text style={styles.fieldLabel}>Quantité</Text>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => step(-1)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Diminuer la quantité"
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, submitting && styles.disabled]}
            >
              <Ionicons name="remove" size={20} color={colors.primary} />
            </Pressable>
            <View style={styles.qtyWrap}>
              <TextInput
                value={qtyText}
                onChangeText={(text) => {
                  setQtyText(text);
                  setError(null);
                }}
                keyboardType="decimal-pad"
                editable={!submitting}
                style={styles.qtyInput}
                selectTextOnFocus
                accessibilityLabel="Quantité commandée"
              />
              <Text style={styles.qtyUnit} numberOfLines={1}>{selected.unit}</Text>
            </View>
            <Pressable
              onPress={() => step(1)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Augmenter la quantité"
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, submitting && styles.disabled]}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </Pressable>
          </View>
          {insufficient ? (
            <Text style={styles.insufficientText}>
              La quantité dépasse le stock disponible.
            </Text>
          ) : null}

          <View style={styles.totalCard}>
            <View style={styles.totalCardText}>
              <Text style={styles.totalCardLabel}>Total de la commande</Text>
              <Text style={styles.totalCardHint}>
                {validQuantity ? `${formatQuantity(quantity)} ${selected.unit} × ${formatFcfa(selected.salePrice)}` : "Quantité à renseigner"}
              </Text>
            </View>
            <Text style={styles.totalCardValue}>{formatFcfa(total)}</Text>
          </View>

          <Text style={styles.fieldLabel}>Client (facultatif)</Text>
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Client comptoir"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            maxLength={120}
            editable={!submitting}
            style={styles.input}
          />
          <TextInput
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="Téléphone (facultatif)"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={40}
            editable={!submitting}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Note (facultatif)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ex. à retirer samedi matin"
            placeholderTextColor={colors.textMuted}
            maxLength={255}
            editable={!submitting}
            multiline
            style={styles.noteInput}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.stockOut} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void submit()}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer la commande"
            style={({ pressed }) => [styles.ctaPress, pressed && styles.pressed, submitting && styles.disabled]}
          >
            <LinearGradient
              colors={[colors.primaryLight, colors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name="receipt-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.ctaText}>Enregistrer la commande</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "rgba(6, 61, 41, 0.55)",
  },
  sheet: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "90%",
    backgroundColor: colors.surfaceWarm,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  band: { flexDirection: "row", height: 4 },
  bandPart: { flex: 1 },

  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 16, paddingBottom: 10 },
  headIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1 },
  headTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  headSub: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
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
  body: { paddingHorizontal: 16, paddingBottom: 8 },

  summary: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: 14,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  clientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  clientInitials: { fontSize: 12, fontWeight: "900", color: colors.primary },
  summaryTopText: { flex: 1 },
  clientName: { fontSize: 13, fontWeight: "900", color: colors.text },
  summaryMeta: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  summaryProduct: { fontSize: 13, fontWeight: "800", color: colors.text },
  summaryAmounts: { flexDirection: "row", alignItems: "flex-end", gap: 16, marginTop: 10 },
  amountLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  amountValue: { fontSize: 12, fontWeight: "800", color: colors.text, marginTop: 2 },
  summaryTotal: { marginLeft: "auto", alignItems: "flex-end" },
  summaryTotalValue: { fontSize: 16, fontWeight: "900", color: colors.goldDark, marginTop: 2 },
  clientNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clientNoteText: { flex: 1, fontSize: 10.5, fontWeight: "600", color: colors.textMuted, lineHeight: 15 },

  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(10,107,69,0.08)",
    borderRadius: 11,
    padding: 10,
    marginBottom: 12,
  },
  stockRowDanger: { backgroundColor: colors.stockOutBg },
  stockText: { flex: 1, fontSize: 11.5, fontWeight: "700", color: colors.primary },

  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyWrap: {
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  qtyInput: { fontSize: 17, fontWeight: "900", color: colors.text, padding: 0, minWidth: 54, textAlign: "center" },
  qtyUnit: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted, maxWidth: 100 },
  adjustHint: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 7, lineHeight: 15 },

  noteInput: {
    minHeight: 60,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.text,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  input: {
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },

  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodCard: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 9,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  methodCardActive: { borderColor: colors.primary, backgroundColor: colors.surfaceWarm },
  methodIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  methodText: { flex: 1 },
  methodName: { fontSize: 11, fontWeight: "900", color: colors.text },
  methodSub: { fontSize: 8.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  methodHint: { fontSize: 10.5, fontWeight: "600", color: colors.textMuted, marginTop: 8, lineHeight: 15 },

  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  totalCardText: { flex: 1 },
  totalCardLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primaryDeep,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  totalCardHint: { fontSize: 10, fontWeight: "600", color: colors.textMuted, marginTop: 2 },
  totalCardValue: { fontSize: 19, fontWeight: "900", color: colors.primaryDeep },

  stockOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(223,169,33,0.14)",
    borderRadius: 11,
    padding: 10,
    marginTop: 10,
  },
  stockOutText: { flex: 1, fontSize: 10.5, fontWeight: "700", color: colors.goldDark },

  declineWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: colors.stockOutBg,
    borderRadius: 11,
    padding: 10,
    marginBottom: 12,
  },
  declineWarningText: { flex: 1, fontSize: 10.5, fontWeight: "700", color: colors.stockOut, lineHeight: 15 },

  pickerIntro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "rgba(10,107,69,0.08)",
    borderRadius: 11,
    padding: 10,
    marginBottom: 10,
  },
  pickerIntroText: { flex: 1, fontSize: 10.5, fontWeight: "700", color: colors.primary, lineHeight: 15 },
  searchWrap: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text, padding: 0 },
  pickerEmpty: {
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 10,
  },
  pickerEmptyText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 16,
    textAlign: "center",
  },
  productOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 7,
  },
  productOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  productOptionText: { flex: 1 },
  productOptionName: { fontSize: 12, fontWeight: "800", color: colors.text },
  productOptionMeta: { fontSize: 9.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  productOptionRight: { alignItems: "flex-end", gap: 3 },
  productOptionPrice: { fontSize: 10.5, fontWeight: "900", color: colors.goldDark },

  selectedProduct: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    padding: 11,
    marginBottom: 10,
  },
  selectedProductIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedProductText: { flex: 1 },
  selectedProductName: { fontSize: 12.5, fontWeight: "900", color: colors.primaryDeep },
  selectedProductMeta: { fontSize: 9.5, fontWeight: "600", color: colors.textMuted, marginTop: 1 },
  changeLink: { fontSize: 10.5, fontWeight: "900", color: colors.primary, textDecorationLine: "underline" },
  stockHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  stockHintText: { fontSize: 10.5, fontWeight: "700", color: colors.primary },
  insufficientText: { fontSize: 10.5, fontWeight: "700", color: colors.stockOut, marginTop: 6 },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.stockOut, lineHeight: 16 },

  ctaPress: { marginTop: 14 },
  cta: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  ctaText: { color: colors.onPrimary, fontSize: 14, fontWeight: "900" },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
});

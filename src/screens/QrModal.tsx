/**
 * QR code d'un produit — affichage, partage d'image, copie du code interne,
 * régénération (étiquette perdue / code compromis).
 * Payload : « MALISTOCK:MSXXXXXXXX » scannable par l'écran Scanner.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { colors, spacing } from "../theme";
import { productsApi, type ApiProduct, type ProductQr } from "../api/products";
import { useAppDialog } from "../ui/AppDialog";

interface Props {
  visible: boolean;
  token: string;
  product: ApiProduct | null;
  onClose: () => void;
  onRegenerated: () => void;
}

export function QrModal({ visible, token, product, onClose, onRegenerated }: Props) {
  const dialog = useAppDialog();
  const [qr, setQr] = useState<ProductQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(
    async (productId: string, forceNew = false) => {
      setLoading(true);
      setQr(null);
      try {
        const data = forceNew
          ? await productsApi.regenerateQr(token, productId)
          : await productsApi.qr(token, productId);
        setQr(data);
      } catch (requestError) {
        await dialog.alert({
          title: "QR indisponible",
          message:
            requestError instanceof Error && requestError.message
              ? requestError.message
              : "Impossible de charger le QR code. Réessaie.",
          variant: "danger",
          icon: "warning-outline",
        });
      } finally {
        setLoading(false);
      }
    },
    [token, dialog]
  );

  useEffect(() => {
    if (visible && product) void load(product.id);
    if (!visible) setQr(null);
  }, [visible, product?.id, load]);

  const shareImage = async () => {
    if (!qr || sharing) return;
    setSharing(true);
    try {
      const base64 = qr.qrDataUrl.slice(qr.qrDataUrl.indexOf(",") + 1);
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const file = new File(Paths.cache, `mali-stock-qr-${qr.qrToken}.png`);
      file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType: "image/png",
        dialogTitle: "Étiquette QR Mali Stock",
      });
    } catch {
      await dialog.alert({
        title: "Partage impossible",
        message: "Le téléphone n'a pas permis de créer l'image. Utilise « Copier le code ».",
        variant: "warning",
      });
    } finally {
      setSharing(false);
    }
  };

  const copyCode = async () => {
    if (!qr) return;
    await Clipboard.setStringAsync(`MALISTOCK:${qr.qrToken}`);
    await dialog.alert({
      title: "Code copié",
      message: `Code interne « MALISTOCK:${qr.qrToken} » copié. Colle-le où tu veux.`,
      variant: "success",
      icon: "copy-outline",
      confirmLabel: "OK",
    });
  };

  const regenerate = async () => {
    if (!product) return;
    const confirmed = await dialog.confirm({
      title: "Régénérer le QR code ?",
      message:
        "L'ancienne étiquette ne fonctionnera plus. À faire si l'étiquette est perdue ou le code compromis.",
      variant: "warning",
      icon: "refresh-outline",
      confirmLabel: "Régénérer",
      cancelLabel: "Annuler",
    });
    if (confirmed) {
      await load(product.id, true);
      onRegenerated();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={styles.card}>
          <View style={styles.sheetHead}>
            <View style={styles.tile}>
              <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.sheetHeadText}>
              <Text style={styles.sheetTitle} numberOfLines={1}>QR du produit</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>{product?.name ?? ""}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.qrFrame}>
            {loading ? (
              <View style={styles.qrLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : qr ? (
              <Image source={{ uri: qr.qrDataUrl }} style={styles.qrImage} />
            ) : null}
          </View>

          {qr ? (
            <View style={styles.codeRow}>
              <Text style={styles.codeText} selectable>MALISTOCK:{qr.qrToken}</Text>
              <Pressable onPress={() => void copyCode()} accessibilityLabel="Copier le code interne" style={styles.copyBtn} hitSlop={8}>
                <Ionicons name="copy-outline" size={15} color={colors.primary} />
                <Text style={styles.copyText}>Copier</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.hint}>
            Colle-le sur le produit ou l'étiquette papier. Le scanner de l'app le reconnaît
            instantanément.
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => void shareImage()}
              disabled={!qr || sharing}
              accessibilityRole="button"
              accessibilityLabel="Partager le QR code"
              style={({ pressed }) => [pressed && styles.pressed, (!qr || sharing) && styles.disabled]}
            >
              <LinearGradient
                colors={[colors.primaryLight, colors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.btn, styles.btnPrimary]}
              >
                {sharing ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <>
                    <Ionicons name="share-social-outline" size={17} color={colors.onPrimary} />
                    <Text style={styles.btnPrimaryText}>Partager</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => void regenerate()}
              disabled={!product}
              accessibilityRole="button"
              accessibilityLabel="Régénérer le QR code"
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed, !product && styles.disabled]}
            >
              <Ionicons name="refresh-outline" size={17} color={colors.text} />
              <Text style={styles.btnGhostText}>Régénérer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26, backgroundColor: "rgba(6, 61, 41, 0.62)" },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },

  sheetHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 14 },
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

  qrFrame: {
    alignSelf: "center",
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrImage: { width: 216, height: 216 },
  qrLoading: { width: 216, height: 216, alignItems: "center", justifyContent: "center" },

  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  codeText: { flex: 1, fontSize: 12.5, fontWeight: "800", color: colors.text, letterSpacing: 0.6 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  copyText: { fontSize: 11.5, fontWeight: "800", color: colors.primary },

  hint: { fontSize: 11, fontWeight: "600", color: colors.textMuted, lineHeight: 15, marginTop: 12, textAlign: "center" },

  actions: { flexDirection: "row", gap: spacing.sm, marginTop: 16 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  btnPrimary: {},
  btnPrimaryText: { color: colors.onPrimary, fontSize: 13.5, fontWeight: "800" },
  btnGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  btnGhostText: { fontSize: 13.5, fontWeight: "800", color: colors.text },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});

/**
 * Scanner caméra partagé — QR codes Mali Stock et codes-barres.
 * Gère la permission, la torche, le cadre de visée, la saisie manuelle
 * et l'anti-doublon (un même code est détecté sur plusieurs frames).
 * Le traitement du code (produit interne, fiche publique…) est délégué au parent.
 */
import React, { useCallback, useRef, useState } from "react";
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
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadows, spacing } from "../theme";

interface Props {
  onCode: (code: string) => void | Promise<void>;
  busy?: boolean;
  legend?: string;
  hint?: string;
  busyHint?: string;
  manualPlaceholder?: string;
  permissionTitle?: string;
  permissionText?: string;
  permissionCta?: string;
}

const BARCODE_TYPES = ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e"] as const;

export function CameraScanner({
  onCode,
  busy = false,
  legend = "QR Mali Stock & codes-barres",
  hint = "Place le QR ou le code-barres dans le cadre",
  busyHint = "Recherche en cours…",
  manualPlaceholder = "Saisir un code manuellement",
  permissionTitle = "La caméra pour scanner",
  permissionText = "Autorise la caméra pour scanner les QR codes Mali Stock et les codes-barres. Aucune image n'est enregistrée.",
  permissionCta = "Autoriser la caméra",
}: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const lastScan = useRef<{ code: string; at: number } | null>(null);

  const handleCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (code === "" || busy) return;

      /* Anti-doublon : un scan reste détecté plusieurs frames. */
      const now = Date.now();
      if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < 2500) {
        return;
      }
      lastScan.current = { code, at: now };
      void onCode(code);
    },
    [busy, onCode]
  );

  /* ── Permission en cours de chargement ── */
  if (!permission) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  /* ── Permission refusée : écran d'explication + saisie manuelle ── */
  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={[styles.permissionBody, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.permissionIcon}>
              <Ionicons name="camera-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.permissionTitle}>{permissionTitle}</Text>
            <Text style={styles.permissionText}>{permissionText}</Text>
            <Pressable
              onPress={() => void requestPermission()}
              accessibilityRole="button"
              accessibilityLabel={permissionCta}
              style={({ pressed }) => [styles.permissionCta, pressed && styles.pressed]}
            >
              <Ionicons name="camera" size={17} color={colors.onPrimary} />
              <Text style={styles.permissionCtaText}>{permissionCta}</Text>
            </Pressable>
          </View>

          <ManualCodeInput
            manual={manual}
            onChange={setManual}
            onSubmit={() => handleCode(manual)}
            busy={busy}
            placeholder={manualPlaceholder}
          />
        </ScrollView>
      </View>
    );
  }

  /* ── Scanner actif ── */
  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        enableTorch={flashOn}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={({ data }) => handleCode(data)}
      />
      <View pointerEvents="none" style={[styles.frameWrap, StyleSheet.absoluteFill]}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <Text style={styles.frameHint}>{busy ? busyHint : hint}</Text>
      </View>

      <View style={[styles.overlayTop, { top: insets.top + 10 }]}>
        <View style={styles.legend}>
          <Ionicons name="qr-code" size={13} color="#FFFFFF" />
          <Text style={styles.legendText}>{legend}</Text>
        </View>
        <Pressable
          onPress={() => setFlashOn((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={flashOn ? "Éteindre la torche" : "Allumer la torche"}
          style={[styles.torchBtn, flashOn && styles.torchBtnOn]}
        >
          <Ionicons name={flashOn ? "flash" : "flash-off"} size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={[styles.manualWrap, { bottom: insets.bottom + 18 }]}>
        <ManualCodeInput
          manual={manual}
          onChange={setManual}
          onSubmit={() => handleCode(manual)}
          busy={busy}
          placeholder={manualPlaceholder}
          dark
        />
      </View>
    </View>
  );
}

function ManualCodeInput({
  manual,
  onChange,
  onSubmit,
  busy,
  placeholder,
  dark = false,
}: {
  manual: string;
  onChange: (t: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder: string;
  dark?: boolean;
}) {
  return (
    <View style={[styles.manual, dark && styles.manualDark]}>
      <View style={styles.manualInputWrap}>
        <Ionicons name="keypad-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.manualInput}
          value={manual}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
      </View>
      <Pressable
        onPress={onSubmit}
        disabled={busy || manual.trim() === ""}
        accessibilityRole="button"
        accessibilityLabel="Rechercher ce code"
        style={({ pressed }) => [
          styles.manualBtn,
          pressed && styles.pressed,
          (busy || manual.trim() === "") && styles.disabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Ionicons name="search" size={17} color={colors.onPrimary} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDeep, alignItems: "center", justifyContent: "center" },

  permissionBody: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: "center",
  },
  permissionIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "rgba(10,107,69,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  permissionTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  permissionText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
  permissionCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 22,
    marginTop: 18,
  },
  permissionCtaText: { color: colors.onPrimary, fontSize: 13.5, fontWeight: "800" },

  frameWrap: { alignItems: "center", justifyContent: "center" },
  frame: {
    width: 250,
    height: 250,
    borderRadius: 24,
    borderColor: "rgba(255,255,255,0.25)",
    borderWidth: 1.5,
  },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: colors.gold,
    borderWidth: 3.5,
  },
  cornerTopLeft: { top: -2, left: -2, borderTopLeftRadius: 22, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTopRight: { top: -2, right: -2, borderTopRightRadius: 22, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBottomLeft: { bottom: -2, left: -2, borderBottomLeftRadius: 22, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBottomRight: { bottom: -2, right: -2, borderBottomRightRadius: 22, borderLeftWidth: 0, borderTopWidth: 0 },
  frameHint: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 18,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },

  overlayTop: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(6,61,41,0.72)",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  legendText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  torchBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(6,61,41,0.72)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  torchBtnOn: { backgroundColor: colors.gold },

  manualWrap: { position: "absolute", left: 16, right: 16 },
  manual: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    alignItems: "center",
  },
  manualDark: { shadowColor: "#000000" },
  manualInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  manualInput: { flex: 1, fontSize: 13.5, fontWeight: "700", color: colors.text, padding: 0 },
  manualBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
});

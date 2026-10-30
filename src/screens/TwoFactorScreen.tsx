/**
 * Écran de double validation à la connexion :
 * code TOTP (6 chiffres) ou code de secours, avec option
 * « Appareil de confiance » (30 jours sans code sur cet appareil).
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { colors, shadows, tricoloreBand } from "../theme";
import { CodeInput } from "../ui/CodeInput";
import { useAppDialog } from "../ui/AppDialog";

export function TwoFactorScreen() {
  const insets = useSafeAreaInsets();
  const { twoFactor, clearTwoFactor, verifyTwoFactor, isSubmitting, error, clearError } = useAuth();
  const dialog = useAppDialog();

  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!twoFactor) return null;

  const message = localError || error;

  const submit = async () => {
    Keyboard.dismiss();
    setLocalError(null);
    clearError();

    if (mode === "totp" && code.length !== 6) {
      setLocalError("Entre le code à 6 chiffres de l'application d'authentification.");
      return;
    }
    if (mode === "backup" && backupCode.trim().length < 8) {
      setLocalError("Entre un code de secours (ex. A3F9-K2M7).");
      return;
    }

    const value = mode === "totp" ? code : backupCode.trim().toUpperCase();
    const ok = await verifyTwoFactor(value, mode === "totp" ? remember : false);
    if (ok && remember) {
      await dialog.alert({
        title: "Appareil de confiance",
        message: "Plus besoin de code sur cet appareil pendant 30 jours.",
        variant: "success",
        icon: "phone-portrait-outline",
        confirmLabel: "Continuer",
      });
    }
  };

  const switchMode = (next: "totp" | "backup") => {
    Keyboard.dismiss();
    setMode(next);
    setLocalError(null);
    clearError();
  };

  const disabled = isSubmitting;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.body, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.band}>
              {tricoloreBand.map((color) => (
                <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
              ))}
            </View>

            <View style={styles.content}>
              <View style={styles.iconWrap}>
                <Ionicons name="shield-checkmark-outline" size={26} color={colors.primary} />
              </View>

              <Text style={styles.title}>Double validation</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {mode === "totp"
                  ? "Ouvre ton application d'authentification et entre le code du moment."
                  : "Entre un de tes codes de secours (il ne pourra servir qu'une fois)."}
              </Text>

              {mode === "totp" ? (
                <CodeInput value={code} onChange={setCode} disabled={isSubmitting} />
              ) : (
                <View style={styles.inputWrap}>
                  <Ionicons name="key-outline" size={17} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={backupCode}
                    onChangeText={(text) => {
                      setBackupCode(text.toUpperCase());
                      setLocalError(null);
                      clearError();
                    }}
                    placeholder="A3F9-K2M7"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    returnKeyType="done"
                    onSubmitEditing={() => void submit()}
                  />
                </View>
              )}

              {mode === "totp" ? (
                <Pressable
                  onPress={() => setRemember((value) => !value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: remember }}
                  accessibilityLabel="Se souvenir de cet appareil pendant 30 jours"
                  style={styles.rememberRow}
                >
                  <Ionicons
                    name={remember ? "checkbox" : "square-outline"}
                    size={19}
                    color={remember ? colors.primary : colors.textMuted}
                  />
                  <Text style={styles.rememberText}>Se souvenir de cet appareil (30 jours)</Text>
                </Pressable>
              ) : null}

              {message ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => void submit()}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Valider le code"
                style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
              >
                <LinearGradient
                  colors={[colors.primaryLight, colors.primaryDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <>
                      <Ionicons name="lock-open-outline" size={18} color={colors.onPrimary} />
                      <Text style={styles.submitText}>Se connecter</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => switchMode(mode === "totp" ? "backup" : "totp")}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.modeText}>
                    {mode === "totp" ? "Utiliser un code de secours" : "Utiliser l'application d'authentification"}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  clearTwoFactor();
                  clearError();
                }}
                accessibilityRole="button"
                accessibilityLabel="Annuler et revenir à la connexion"
                hitSlop={8}
              >
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Ionicons name="shield-checkmark-outline" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.footerText}>Connexion sécurisée</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDeep },
  flex: { flex: 1 },
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  band: {
    flexDirection: "row",
    height: 4,
  },
  bandPart: { flex: 1 },
  content: {
    padding: 22,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 107, 69, 0.10)",
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 20,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 50,
    paddingHorizontal: 13,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    alignSelf: "stretch",
  },
  input: { flex: 1, fontSize: 15, fontWeight: "800", letterSpacing: 2, color: colors.text },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  rememberText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginTop: 14,
    alignSelf: "stretch",
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: colors.stockOut,
    lineHeight: 16,
  },

  submitBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    alignSelf: "stretch",
    marginTop: 18,
  },
  submitText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },

  modeRow: { marginTop: 16 },
  modeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  cancelText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 10,
    textDecorationLine: "underline",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  footerText: { color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: "700" },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});

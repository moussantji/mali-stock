/**
 * Écran de vérification email — code à 6 chiffres envoyé à l'inscription.
 * Compte bloqué tant que l'email n'est pas vérifié (le serveur refuse la connexion).
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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

const RESEND_SECONDS = 60;

export function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const { verification, user, clearVerification, verifyEmail, resendVerification, signOut, isSubmitting, error, clearError } =
    useAuth();
  const dialog = useAppDialog();

  const email = verification?.email ?? user?.email ?? "";
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(verification?.devCode ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (value.length !== 6 || isSubmitting) return;
    Keyboard.dismiss();
    const ok = await verifyEmail(email, value);
    if (ok) {
      await dialog.alert({
        title: "Email vérifié",
        message: "Ton compte est actif. Bienvenue dans Mali Stock !",
        variant: "success",
        icon: "checkmark-circle-outline",
        confirmLabel: "Continuer",
      });
    }
  };

  const handleChange = (next: string) => {
    setCode(next);
    setNotice(null);
    clearError();
    if (next.length === 6) void submit(next);
  };

  const resend = async () => {
    if (cooldown > 0 || isSubmitting || email.length === 0) return;
    setNotice(null);
    const result = await resendVerification(email);
    if (result) {
      setDevCode(result.devCode ?? null);
      setCooldown(RESEND_SECONDS);
      setNotice("Un nouveau code a été envoyé.");
    }
  };

  const useAnotherAccount = () => {
    Keyboard.dismiss();
    setCode("");
    setNotice(null);
    clearError();
    if (user) void signOut();
    else clearVerification();
  };

  const disabled = isSubmitting || code.length !== 6;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[styles.body, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        >
          <View style={[styles.card, shadows.card]}>
            <View style={styles.band}>
              {tricoloreBand.map((color) => (
                <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
              ))}
            </View>

            <View style={styles.content}>
              <View style={styles.iconWrap}>
                <Ionicons name="mail-outline" size={26} color={colors.primary} />
              </View>

              <Text style={styles.title}>Vérifie ton email</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                Un code à 6 chiffres a été envoyé à {email}. Il expire dans 10 minutes.
              </Text>

              <CodeInput value={code} onChange={handleChange} disabled={isSubmitting} />

              {notice ? (
                <View style={styles.noticeBox}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.stockOk} />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {devCode ? (
                <View style={styles.devBox}>
                  <Ionicons name="terminal-outline" size={14} color={colors.goldDark} />
                  <Text style={styles.devText} selectable>
                    Mode dev — ton code : {devCode}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => void submit(code)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Vérifier le code"
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
                      <Ionicons name="shield-checkmark-outline" size={18} color={colors.onPrimary} />
                      <Text style={styles.submitText}>Vérifier le code</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={() => void resend()}
                disabled={cooldown > 0 || isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Renvoyer le code"
                hitSlop={6}
                style={styles.resendBtn}
              >
                <Text
                  style={[
                    styles.resendText,
                    (cooldown > 0 || isSubmitting) && styles.resendDisabled,
                  ]}
                >
                  {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : "Renvoyer le code"}
                </Text>
              </Pressable>

              <Pressable
                onPress={useAnotherAccount}
                accessibilityRole="button"
                accessibilityLabel="Utiliser un autre compte"
                hitSlop={8}
              >
                <Text style={styles.otherAccount}>Utiliser un autre compte</Text>
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

  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.stockOkBg,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: colors.stockOk,
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

  devBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  devText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.goldDark,
  },

  submitBtn: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    alignSelf: "stretch",
    marginTop: 20,
  },
  submitText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },

  resendBtn: { marginTop: 14 },
  resendText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  resendDisabled: {
    color: colors.textMuted,
  },

  otherAccount: {
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

/**
 * Écran « Mot de passe oublié » — deux étapes :
 * 1. Saisie de l'email → envoi d'un code à 6 chiffres.
 * 2. Code + nouveau mot de passe → réinitialisation et connexion automatique.
 * La réinitialisation invalide toutes les sessions ouvertes (token_version).
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
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { passwordPolicyError } from "../auth/password";
import { colors, shadows, tricoloreBand } from "../theme";
import { CodeInput } from "../ui/CodeInput";
import { PasswordStrength } from "../ui/PasswordStrength";
import { useAppDialog } from "../ui/AppDialog";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { requestPasswordReset, resetPassword, isSubmitting, error, clearError } = useAuth();
  const dialog = useAppDialog();

  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const message = formError || error;

  const submitEmail = async () => {
    Keyboard.dismiss();
    setFormError(null);
    clearError();

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setFormError("Renseigne une adresse email valide.");
      return;
    }

    const result = await requestPasswordReset(cleanEmail);
    if (result) {
      setDevCode(result.devCode ?? null);
      setCode("");
      setPassword("");
      setStep("reset");
      setCooldown(RESEND_SECONDS);
    }
  };

  const submitReset = async () => {
    Keyboard.dismiss();
    setFormError(null);
    clearError();

    const cleanEmail = email.trim().toLowerCase();
    if (code.length !== 6) {
      setFormError("Entre le code à 6 chiffres reçu par email.");
      return;
    }
    const policy = passwordPolicyError(password, "", cleanEmail);
    if (policy) {
      setFormError(policy);
      return;
    }

    const ok = await resetPassword(cleanEmail, code, password);
    if (ok) {
      await dialog.alert({
        title: "Mot de passe modifié",
        message:
          "Ton nouveau mot de passe est actif. Les autres sessions ont été fermées par sécurité.",
        variant: "success",
        icon: "checkmark-circle-outline",
        confirmLabel: "Continuer",
      });
    }
  };

  const resendCode = async () => {
    if (cooldown > 0 || isSubmitting) return;
    setFormError(null);
    clearError();
    const result = await requestPasswordReset(email.trim().toLowerCase());
    if (result) {
      setDevCode(result.devCode ?? null);
      setCooldown(RESEND_SECONDS);
    }
  };

  const backToEmail = () => {
    Keyboard.dismiss();
    setStep("email");
    setCode("");
    setPassword("");
    setDevCode(null);
    setFormError(null);
    clearError();
  };

  const isReset = step === "reset";

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
                <Ionicons name={isReset ? "key-outline" : "lock-open-outline"} size={26} color={colors.goldDark} />
              </View>

              <Text style={styles.title}>
                {isReset ? "Nouveau mot de passe" : "Mot de passe oublié"}
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {isReset
                  ? `Entre le code envoyé à ${email.trim().toLowerCase()} puis choisis un nouveau mot de passe.`
                  : "Indique ton adresse email : un code à 6 chiffres valable 10 minutes te sera envoyé."}
              </Text>

              {isReset ? (
                <>
                  <CodeInput value={code} onChange={setCode} disabled={isSubmitting} />

                  <View style={styles.passwordField}>
                    <Text style={styles.label}>Nouveau mot de passe</Text>
                    <View style={styles.inputWrap}>
                      <Ionicons name="lock-closed-outline" size={17} color={colors.textMuted} />
                      <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={(text) => {
                          setPassword(text);
                          clearError();
                        }}
                        placeholder="8 caractères minimum (Aa1!)"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        editable={!isSubmitting}
                        returnKeyType="done"
                        onSubmitEditing={() => void submitReset()}
                      />
                      <Pressable
                        onPress={() => setShowPassword((visible) => !visible)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                        }
                      >
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.meterWrap}>
                      <PasswordStrength password={password} />
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.passwordField}>
                  <Text style={styles.label}>Adresse email</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="mail-outline" size={17} color={colors.textMuted} />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        clearError();
                      }}
                      placeholder="toi@exemple.ml"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      editable={!isSubmitting}
                      returnKeyType="done"
                      onSubmitEditing={() => void submitEmail()}
                    />
                  </View>
                </View>
              )}

              {message ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              ) : null}

              {isReset && devCode ? (
                <View style={styles.devBox}>
                  <Ionicons name="terminal-outline" size={14} color={colors.goldDark} />
                  <Text style={styles.devText} selectable>
                    Mode dev — ton code : {devCode}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => void (isReset ? submitReset() : submitEmail())}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel={isReset ? "Réinitialiser le mot de passe" : "Recevoir le code"}
                style={({ pressed }) => [pressed && styles.pressed, isSubmitting && styles.disabled]}
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
                      <Ionicons
                        name={isReset ? "checkmark-circle-outline" : "paper-plane-outline"}
                        size={18}
                        color={colors.onPrimary}
                      />
                      <Text style={styles.submitText}>
                        {isReset ? "Réinitialiser le mot de passe" : "Recevoir le code"}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              {isReset ? (
                <Pressable
                  onPress={() => void resendCode()}
                  disabled={cooldown > 0 || isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel="Renvoyer le code"
                  hitSlop={6}
                  style={styles.resendBtn}
                >
                  <Text
                    style={[styles.resendText, (cooldown > 0 || isSubmitting) && styles.resendDisabled]}
                  >
                    {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : "Renvoyer le code"}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={isReset ? backToEmail : onBack}
                accessibilityRole="button"
                accessibilityLabel="Retour à la connexion"
                hitSlop={8}
              >
                <Text style={styles.backText}>
                  {isReset ? "Modifier l'adresse email" : "Retour à la connexion"}
                </Text>
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
    backgroundColor: "rgba(240, 165, 0, 0.16)",
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

  passwordField: {
    alignSelf: "stretch",
    marginTop: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
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
  },
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, padding: 0 },
  meterWrap: { marginTop: 2 },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginTop: 10,
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
    marginTop: 10,
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
    marginTop: 16,
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

  backText: {
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

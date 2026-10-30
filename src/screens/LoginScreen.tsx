import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { passwordPolicyError } from "../auth/password";
import { colors, radius, shadows, spacing, tricoloreBand, typography } from "../theme";
import { PasswordStrength } from "../ui/PasswordStrength";
import { useAppDialog } from "../ui/AppDialog";

WebBrowser.maybeCompleteAuthSession();

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Mode = "login" | "register";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
const GOOGLE_CONFIGURED = Boolean(GOOGLE_WEB_CLIENT_ID);

interface FieldProps extends Omit<React.ComponentProps<typeof TextInput>, "style"> {
  label: string;
  icon: IconName;
  right?: React.ReactNode;
  dense?: boolean;
}

function Field({ label, icon, right, dense = false, ...inputProps }: FieldProps) {
  return (
    <View style={[styles.field, dense && styles.fieldDense]}>
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

function GoogleSignInButton({
  disabled,
  onIdToken,
}: {
  disabled: boolean;
  onIdToken: (idToken: string) => Promise<boolean>;
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
  });
  const dialog = useAppDialog();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      if (!idToken) {
        void dialog.alert({
          title: "Connexion Google",
          message: "Google n'a pas renvoyé de jeton d'identité. Réessaie.",
          variant: "danger",
          icon: "logo-google",
        });
        return;
      }
      setBusy(true);
      onIdToken(idToken).finally(() => setBusy(false));
    } else if (response?.type === "error") {
      void dialog.alert({
        title: "Connexion Google",
        message: "La connexion a échoué. Vérifie ta configuration Google OAuth.",
        variant: "danger",
        icon: "logo-google",
      });
    }
  }, [response, onIdToken, dialog]);

  const handlePress = async () => {
    if (!request || disabled || busy) return;

    // Google exige désormais une redirection HTTPS (politique « secure-response-handling »,
    // appliquée depuis 2025) : le schéma exp:// d'Expo Go est refusé par Google.
    // Tant que le tunnel sécurisé n'est pas branché, on explique au lieu d'ouvrir une
    // page d'erreur Google.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      void dialog.alert({
        title: "Connexion Google",
        message:
          "Google bloque désormais les redirections utilisées par Expo Go (nouvelle politique de sécurité). " +
          "On l'active dans la prochaine étape avec un tunnel HTTPS — l'email et le mot de passe fonctionnent déjà parfaitement.",
        variant: "info",
        icon: "logo-google",
        confirmLabel: "Compris",
      });
      return;
    }

    try {
      setBusy(true);
      await promptAsync();
    } catch {
      void dialog.alert({
        title: "Connexion Google",
        message: "Impossible d'ouvrir la page de connexion Google.",
        variant: "danger",
        icon: "logo-google",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!request || disabled || busy}
      accessibilityRole="button"
      accessibilityLabel="Continuer avec Google"
      style={({ pressed }) => [
        styles.googleBtn,
        pressed && styles.pressed,
        (!request || disabled) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color={colors.primary} />
          <Text style={styles.googleText}>Continuer avec Google</Text>
        </>
      )}
    </Pressable>
  );
}

function GooglePlaceholderButton() {
  const dialog = useAppDialog();

  const explain = () =>
    dialog.alert({
      title: "Google bientôt disponible",
      message:
        "La connexion Google est déjà codée, il reste à ajouter les identifiants OAuth.\n\n" +
        "1. Crée un Client ID « Web » dans Google Cloud Console.\n" +
        "2. Ajoute EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID dans le .env de l'app.\n" +
        "3. Ajoute le même ID dans GOOGLE_CLIENT_IDS (server/.env).\n" +
        "4. Redémarre Expo et l'API.",
      variant: "info",
      icon: "logo-google",
      confirmLabel: "Compris",
    });

  return (
    <Pressable
      onPress={explain}
      accessibilityRole="button"
      accessibilityLabel="Continuer avec Google — configuration requise"
      style={({ pressed }) => [styles.googleBtn, pressed && styles.pressed]}
    >
      <Ionicons name="logo-google" size={18} color={colors.primary} />
      <Text style={styles.googleText}>Continuer avec Google</Text>
      <View style={styles.soonBadge}>
        <Text style={styles.soonText}>à configurer</Text>
      </View>
    </Pressable>
  );
}

export function LoginScreen({ onForgotPassword }: { onForgotPassword: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const dense = screenHeight < 820;
  const { signIn, signUp, signInWithGoogle, isSubmitting, error, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopCategory, setShopCategory] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
    setFormError(null);
  }, [mode, clearError]);

  const message = formError || error;
  const isRegister = mode === "register";

  const submit = async () => {
    Keyboard.dismiss();
    setFormError(null);
    clearError();

    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanEmail = email.trim().toLowerCase();

    if (isRegister && cleanName.length < 2) {
      setFormError("Renseigne ton nom complet (2 caractères minimum).");
      return;
    }
    if (isRegister && shopName.trim().length < 2) {
      setFormError("Indique le nom de ta boutique (2 caractères minimum).");
      return;
    }
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setFormError("Renseigne une adresse email valide.");
      return;
    }
    if (isRegister) {
      const policy = passwordPolicyError(password, cleanName, cleanEmail);
      if (policy) {
        setFormError(policy);
        return;
      }
    } else if (password.length === 0) {
      setFormError("Renseigne ton mot de passe.");
      return;
    }

    if (isRegister) {
      // Inscription publique = compte vendeur avec sa boutique.
      await signUp(cleanName, cleanEmail, password, {
        shopName: shopName.trim(),
        shopCategory: shopCategory.trim(),
        shopCity: shopCity.trim(),
      });
    } else {
      await signIn(cleanEmail, password);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          bounces={false}
          overScrollMode="never"
        >
          <View
            style={[
              styles.hero,
              dense && styles.heroDense,
              { paddingTop: dense ? 8 : 12 },
            ]}
          >
            <Image
              source={require("../../assets/hero-tricolore.jpg")}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(6,61,41,0.97)", "rgba(10,107,69,0.78)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <Text style={[styles.heroTitle, dense && styles.heroTitleDense]}>
              {isRegister ? "Ouvre ta boutique Mali Stock" : "Bon retour parmi nous"}
            </Text>
            <Text style={[styles.heroSubtitle, dense && styles.heroSubtitleDense]}>
              {isRegister
                ? "Gère ton stock, tes produits et tes QR codes depuis ton téléphone."
                : "Connecte-toi pour suivre ton stock, où que tu sois au Mali."}
            </Text>
          </View>

          <View style={[styles.card, dense && styles.cardDense, shadows.card]}>
            <View style={styles.cardBand}>
              {tricoloreBand.map((color) => (
                <View key={color} style={[styles.cardBandPart, { backgroundColor: color }]} />
              ))}
            </View>
            <View style={[styles.switch, dense && styles.switchDense]}>
              <Pressable
                onPress={() => setMode("login")}
                style={[styles.switchItem, !isRegister && styles.switchItemActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: !isRegister }}
              >
                <Text style={[styles.switchText, !isRegister && styles.switchTextActive]}>
                  Connexion
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("register")}
                style={[styles.switchItem, isRegister && styles.switchItemActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isRegister }}
              >
                <Text style={[styles.switchText, isRegister && styles.switchTextActive]}>
                  Inscription
                </Text>
              </Pressable>
            </View>

            <Text style={styles.cardTitle}>{isRegister ? "Créer ma boutique" : "Se connecter"}</Text>
            <Text style={[styles.cardSubtitle, dense && styles.cardSubtitleDense]}>
              {isRegister
                ? "Quelques secondes suffisent — ton email sera vérifié par un code."
                : "Entre tes identifiants pour accéder à ton espace."}
            </Text>

            {isRegister ? (
              <View style={styles.infoBox}>
                <Ionicons name="storefront-outline" size={16} color={colors.goldDark} />
                <Text style={styles.infoText}>
                  Un compte vendeur sera créé avec ta boutique : gère ton stock, tes produits et
                  tes QR codes depuis ton téléphone.
                </Text>
              </View>
            ) : null}

            {isRegister ? (
              <Field
                dense={dense}
                label="Nom complet"
                icon="person-outline"
                value={name}
                onChangeText={setName}
                placeholder="Aminata Diallo"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                editable={!isSubmitting}
              />
            ) : null}

            {isRegister ? (
              <>
                <Field
                  dense={dense}
                  label="Nom de la boutique"
                  icon="storefront-outline"
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder="Boutique Bogolan"
                  autoCapitalize="words"
                  returnKeyType="next"
                  editable={!isSubmitting}
                />
                <Field
                  dense={dense}
                  label="Catégorie (facultatif)"
                  icon="grid-outline"
                  value={shopCategory}
                  onChangeText={setShopCategory}
                  placeholder="Artisanat, tissus, épicerie…"
                  autoCapitalize="sentences"
                  returnKeyType="next"
                  editable={!isSubmitting}
                />
                <Field
                  dense={dense}
                  label="Ville (facultatif)"
                  icon="location-outline"
                  value={shopCity}
                  onChangeText={setShopCity}
                  placeholder="Bamako"
                  autoCapitalize="words"
                  returnKeyType="next"
                  editable={!isSubmitting}
                />
              </>
            ) : null}

            <Field
              dense={dense}
              label="Adresse email"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="toi@exemple.ml"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!isSubmitting}
            />

            <Field
              dense={dense}
              label="Mot de passe"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="8 caractères minimum"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isRegister ? "new-password" : "current-password"}
              textContentType={isRegister ? "newPassword" : "password"}
              returnKeyType="done"
              onSubmitEditing={submit}
              editable={!isSubmitting}
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

            {isRegister ? (
              <PasswordStrength password={password} />
            ) : null}

            {!isRegister ? (
              <Pressable
                onPress={onForgotPassword}
                style={[styles.forgot, dense && styles.forgotDense]}
                hitSlop={8}
              >
                <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
              </Pressable>
            ) : null}

            {message ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
                <Text style={styles.errorText}>{message}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={submit}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={isRegister ? "Créer ma boutique" : "Se connecter"}
              style={({ pressed }) => [pressed && styles.pressed, isSubmitting && styles.disabled]}
            >
              <LinearGradient
                colors={[colors.primaryLight, colors.primaryDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.submitBtn, shadows.primaryButton]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <Ionicons
                      name={isRegister ? "person-add-outline" : "log-in-outline"}
                      size={18}
                      color={colors.onPrimary}
                    />
                    <Text style={styles.submitText}>
                      {isRegister ? "Créer ma boutique" : "Se connecter"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={[styles.divider, dense && styles.dividerDense]}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou continuer avec</Text>
              <View style={styles.dividerLine} />
            </View>

            {GOOGLE_CONFIGURED ? (
              <GoogleSignInButton disabled={isSubmitting} onIdToken={signInWithGoogle} />
            ) : (
              <GooglePlaceholderButton />
            )}

            <Text style={[styles.legal, dense && styles.legalDense]}>
              En continuant, tu acceptes les conditions d'utilisation et la politique de
              confidentialité de Mali Stock.
            </Text>
          </View>

          <View style={[styles.footer, dense && styles.footerDense]}>
            <Ionicons name="shield-checkmark-outline" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.footerText}>Connexion sécurisée</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDeep },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  hero: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 50,
    marginTop: "auto",
    overflow: "hidden",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroDense: {
    paddingBottom: 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginTop: 4,
  },
  heroTitleDense: { fontSize: 24, marginTop: 2 },
  heroSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 6,
    maxWidth: 310,
  },
  heroSubtitleDense: { fontSize: 12, lineHeight: 17, marginTop: 4 },

  card: {
    marginTop: -38,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardDense: { marginTop: -34, padding: 16 },
  cardBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    flexDirection: "row",
  },
  cardBandPart: { flex: 1 },

  switch: {
    flexDirection: "row",
    backgroundColor: "rgba(27,32,26,0.06)",
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 15,
  },
  switchDense: { marginBottom: 12 },
  switchItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.pill },
  switchItemActive: { backgroundColor: colors.surface, ...shadows.card },
  switchText: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  switchTextActive: { color: colors.primary },

  cardTitle: { ...typography.title, fontSize: 19, color: colors.text },
  cardSubtitle: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 13,
  },
  cardSubtitleDense: { marginBottom: 10 },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: 11,
    marginBottom: 13,
  },
  infoText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.primaryDeep,
    lineHeight: 15,
  },

  field: { marginBottom: 11 },
  fieldDense: { marginBottom: 9 },
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
    height: 50,
    paddingHorizontal: 13,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, padding: 0 },

  forgot: { alignSelf: "flex-end", marginTop: -2, marginBottom: 12 },
  forgotDense: { marginBottom: 10 },
  forgotText: { fontSize: 11, fontWeight: "700", color: colors.primary },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.stockOutBg,
    borderRadius: 12,
    padding: 11,
    marginBottom: 14,
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
  },
  submitText: { color: colors.onPrimary, fontSize: 14, fontWeight: "800" },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 13 },
  dividerDense: { marginVertical: 11 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  googleBtn: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  googleText: { fontSize: 13, fontWeight: "800", color: colors.text },
  soonBadge: {
    position: "absolute",
    right: 11,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  soonText: {
    fontSize: 7,
    fontWeight: "900",
    color: colors.goldDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  legal: {
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 13,
  },
  legalDense: { marginTop: 10 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 15,
    marginBottom: "auto",
  },
  footerDense: { marginTop: 11 },
  footerText: { color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: "700" },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});

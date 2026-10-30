/**
 * Écran « Sécurité » du compte :
 *  - Statut : email vérifié, double validation activée ou non.
 *  - Activation 2FA : QR code (Google Authenticator), vérification, codes de secours.
 *  - Désactivation : mot de passe + code obligatoires.
 *  - Appareils de confiance : liste et révocation via la désactivation.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAuth,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from "../auth/AuthContext";
import { colors, shadows, tricoloreBand } from "../theme";
import { CodeInput } from "../ui/CodeInput";
import { useAppDialog } from "../ui/AppDialog";

type SetupStep = "qr" | "confirm" | "backup-codes";

export function SecurityScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, getTwoFactorStatus, startTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor, error, clearError } =
    useAuth();
  const dialog = useAppDialog();

  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>("qr");
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  /* Désactivation */
  const [disabling, setDisabling] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getTwoFactorStatus();
    setStatus(result);
    setLoading(false);
  }, [getTwoFactorStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginSetup = async () => {
    const data = await startTwoFactorSetup();
    if (data) {
      setSetup(data);
      setSetupStep("qr");
      setConfirmCode("");
    }
  };

  const submitConfirm = async (value: string) => {
    if (value.length !== 6) return;
    Keyboard.dismiss();
    const codes = await confirmTwoFactorSetup(value);
    if (codes) {
      setBackupCodes(codes);
      setSetupStep("backup-codes");
      setSetup(null);
    }
  };

  const submitDisable = async () => {
    Keyboard.dismiss();
    if (!disablePassword) {
      await dialog.alert({
        title: "Désactivation",
        message: "Entre ton mot de passe pour confirmer.",
        variant: "info",
      });
      return;
    }
    if (disableCode.trim().length < 6) {
      await dialog.alert({
        title: "Désactivation",
        message: "Entre ton code d'authentification (ou un code de secours).",
        variant: "info",
      });
      return;
    }
    const ok = await disableTwoFactor(disablePassword, disableCode.trim());
    if (ok) {
      setDisabling(false);
      setDisablePassword("");
      setDisableCode("");
      await dialog.alert({
        title: "Double validation désactivée",
        message: "Ton compte est de nouveau protégé par ton seul mot de passe.",
        variant: "warning",
        icon: "shield-outline",
        confirmLabel: "Compris",
      });
      await refresh();
    }
  };

  const copyAll = async () => {
    await Clipboard.setStringAsync(backupCodes.join("\n"));
    await dialog.alert({
      title: "Copié",
      message: "Les 10 codes de secours sont dans le presse-papiers. Colle-les dans un endroit sûr.",
      variant: "success",
      icon: "copy-outline",
      confirmLabel: "OK",
    });
  };

  const finishSetup = async () => {
    setSetupStep("qr");
    setConfirmCode("");
    setBackupCodes([]);
    await dialog.alert({
      title: "Compte renforcé",
      message: "Ton compte exige maintenant un code à chaque connexion.",
      variant: "success",
      icon: "shield-checkmark-outline",
      confirmLabel: "Parfait",
    });
    await refresh();
  };

  const enabled = status?.enabled === true;
  const message = error;

  /* ── Rendu du flux d'activation ─────────────────────────── */

  if (setup) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={[
            styles.setupBody,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, shadows.card]}>
            <View style={styles.band}>
              {tricoloreBand.map((color) => (
                <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
              ))}
            </View>
            <View style={styles.content}>
              <View style={styles.iconWrap}>
                <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
              </View>
              <Text style={styles.title}>Scanne avec ton application</Text>
              <Text style={styles.subtitle}>
                Ouvre Google Authenticator (ou Authy) → « + » → Scanner un code QR.
              </Text>

              <View style={styles.qrFrame}>
                <Image source={{ uri: setup.qrDataUrl }} style={styles.qrImage} />
              </View>

              <Text style={styles.secretLabel}>Ou saisis ce code manuellement :</Text>
              <Text style={styles.secretValue} selectable>
                {setup.secret}
              </Text>

              {message ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => setSetupStep("confirm")}
                accessibilityRole="button"
                accessibilityLabel="J'ai scanné le QR code"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <LinearGradient
                  colors={[colors.primaryLight, colors.primaryDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  <Ionicons name="arrow-forward-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.submitText}>J'ai scanné le code QR</Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={onCancelSetup} hitSlop={8}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  function onCancelSetup() {
    setSetup(null);
    setSetupStep("qr");
    setConfirmCode("");
    clearError();
  }

  if (setupStep === "confirm") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={[styles.centerBody, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.card, shadows.card]}>
            <View style={styles.band}>
              {tricoloreBand.map((color) => (
                <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
              ))}
            </View>
            <View style={styles.content}>
              <View style={styles.iconWrap}>
                <Ionicons name="checkmark-circle-outline" size={26} color={colors.primary} />
              </View>
              <Text style={styles.title}>Confirme l'activation</Text>
              <Text style={styles.subtitle}>
                Entre le code à 6 chiffres affiché dans ton application d'authentification.
              </Text>

              <CodeInput value={confirmCode} onChange={submitConfirm} disabled={false} />

              {message ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={17} color={colors.stockOut} />
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => void submitConfirm(confirmCode)}
                disabled={confirmCode.length !== 6}
                accessibilityRole="button"
                accessibilityLabel="Activer la double validation"
                style={({ pressed }) => [pressed && styles.pressed, confirmCode.length !== 6 && styles.disabled]}
              >
                <LinearGradient
                  colors={[colors.primaryLight, colors.primaryDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.submitText}>Activer</Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={onCancelSetup} hitSlop={8}>
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (setupStep === "backup-codes") {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={[
            styles.setupBody,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, shadows.card]}>
            <View style={styles.band}>
              {tricoloreBand.map((color) => (
                <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
              ))}
            </View>
            <View style={styles.content}>
              <View style={[styles.iconWrap, styles.iconWrapGold]}>
                <Ionicons name="key-outline" size={26} color={colors.goldDark} />
              </View>
              <Text style={styles.title}>Codes de secours</Text>
              <Text style={styles.subtitle}>
                Chaque code ne sert qu'une fois. Note-les dans un endroit sûr : ils sont la seule
                façon de te connecter sans ton application.
              </Text>

              <View style={styles.codesGrid}>
                {backupCodes.map((code) => (
                  <View key={code} style={styles.codeCell}>
                    <Text style={styles.codeText}>{code}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => void copyAll()}
                accessibilityRole="button"
                accessibilityLabel="Copier tous les codes de secours"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <LinearGradient
                  colors={[colors.primaryLight, colors.primaryDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  <Ionicons name="copy-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.submitText}>Copier les 10 codes</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={() => void finishSetup()}
                accessibilityRole="button"
                accessibilityLabel="J'ai noté mes codes"
                hitSlop={8}
              >
                <Text style={styles.modeText}>J'ai bien noté mes codes — Continuer</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ── Écran principal Sécurité ───────────────────────────── */

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
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

        <Text style={styles.pageTitle}>Sécurité</Text>
        <Text style={styles.pageSubtitle}>Protège ton compte Mali Stock.</Text>

        {loading ? (
          <View style={[styles.card, styles.cardPad, shadows.card]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Statut */}
            <View style={[styles.card, styles.cardPad, shadows.card]}>
              <Text style={styles.sectionLabel}>Statut du compte</Text>

              <View style={styles.statusRow}>
                <Ionicons name="mail-outline" size={20} color={colors.stockOk} />
                <Text style={styles.statusLabel}>Email vérifié</Text>
                <View style={[styles.badge, styles.badgeOk]}>
                  <Text style={styles.badgeOkText}>OK</Text>
                </View>
              </View>

              <View style={styles.statusRow}>
                <Ionicons
                  name={enabled ? "shield-checkmark" : "shield-outline"}
                  size={20}
                  color={enabled ? colors.stockOk : colors.goldDark}
                />
                <Text style={styles.statusLabel}>Double validation</Text>
                <View style={[styles.badge, enabled ? styles.badgeOk : styles.badgeWarn]}>
                  <Text style={enabled ? styles.badgeOkText : styles.badgeWarnText}>
                    {enabled ? "Activée" : "Désactivée"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Activation ou gestion */}
            {enabled ? (
              <View style={[styles.card, styles.cardPad, shadows.card]}>
                <Text style={styles.sectionLabel}>Codes de secours</Text>
                <Text style={styles.bodyText}>
                  {status?.backupCodesLeft === 0
                    ? "Tous tes codes de secours ont été utilisés. Désactive puis réactive la 2FA pour en générer de nouveaux."
                    : `${status?.backupCodesLeft ?? 0} code(s) de secours encore utilisable(s).`}
                </Text>

                <Text style={styles.sectionLabel}>Appareils de confiance</Text>
                {(status?.trustedDevices ?? []).length === 0 ? (
                  <Text style={styles.bodyText}>Aucun appareil de confiance pour le moment.</Text>
                ) : (
                  (status?.trustedDevices ?? []).map((device, index) => (
                    <View key={`${device.label}-${index}`} style={styles.deviceRow}>
                      <Ionicons name="phone-portrait-outline" size={17} color={colors.primary} />
                      <Text style={styles.deviceLabel} numberOfLines={1}>
                        {device.label}
                      </Text>
                      <Text style={styles.deviceDate}>
                        {device.expiresAt ? new Date(device.expiresAt).toLocaleDateString("fr-FR") : ""}
                      </Text>
                    </View>
                  ))
                )}
                <Text style={styles.hint}>
                  Désactiver la double validation supprime aussi les appareils de confiance.
                </Text>
              </View>
            ) : null}

            {/* Action */}
            {!enabled && !disabling ? (
              <Pressable
                onPress={() => void beginSetup()}
                accessibilityRole="button"
                accessibilityLabel="Activer la double validation"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <LinearGradient
                  colors={[colors.primaryLight, colors.primaryDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.onPrimary} />
                  <Text style={styles.submitText}>Activer la double validation</Text>
                </LinearGradient>
              </Pressable>
            ) : null}

            {enabled && !disabling ? (
              <Pressable
                onPress={() => setDisabling(true)}
                accessibilityRole="button"
                accessibilityLabel="Désactiver la double validation"
                style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
              >
                <Ionicons name="warning-outline" size={17} color={colors.stockOut} />
                <Text style={styles.dangerText}>Désactiver la double validation</Text>
              </Pressable>
            ) : null}

            {disabling ? (
              <View style={[styles.card, styles.cardPad, shadows.card]}>
                <Text style={styles.sectionLabel}>Confirmer la désactivation</Text>

                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={17} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={disablePassword}
                    onChangeText={setDisablePassword}
                    placeholder="Ton mot de passe"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>

                <View style={styles.inputWrap}>
                  <Ionicons name="key-outline" size={17} color={colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={disableCode}
                    onChangeText={(text) => setDisableCode(text.toUpperCase())}
                    placeholder="Code actuel ou code de secours"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => void submitDisable()}
                  />
                </View>

                <Pressable
                  onPress={() => void submitDisable()}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmer la désactivation"
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <LinearGradient
                    colors={[colors.stockOut, colors.stockOut]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.submitBtn}
                  >
                    <Ionicons name="lock-open-outline" size={18} color={colors.onPrimary} />
                    <Text style={styles.submitText}>Désactiver</Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setDisabling(false);
                    setDisablePassword("");
                    setDisableCode("");
                    clearError();
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.cancelText}>Annuler</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDeep },
  page: {
    flexGrow: 1,
    paddingHorizontal: 20,
    gap: 14,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  backLabel: { fontSize: 13, fontWeight: "800", color: colors.text },
  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: -8,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardPad: { padding: 18 },
  band: { flexDirection: "row", height: 4 },
  bandPart: { flex: 1 },
  content: {
    padding: 22,
    alignItems: "center",
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
    color: colors.text,
    marginBottom: 12,
  },
  hint: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 8,
    lineHeight: 15,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  statusLabel: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeOk: { backgroundColor: colors.stockOkBg },
  badgeOkText: { fontSize: 10.5, fontWeight: "800", color: colors.stockOk },
  badgeWarn: { backgroundColor: colors.accentSoft },
  badgeWarnText: { fontSize: 10.5, fontWeight: "800", color: colors.goldDark },

  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deviceLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text },
  deviceDate: { fontSize: 11, fontWeight: "600", color: colors.textMuted },

  /* Flux d'activation */
  setupBody: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  centerBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
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
  iconWrapGold: {
    backgroundColor: "rgba(240, 165, 0, 0.16)",
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
    marginBottom: 18,
  },

  qrFrame: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrImage: { width: 216, height: 216 },
  secretLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 16,
  },
  secretValue: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2,
    color: colors.text,
    textAlign: "center",
    marginTop: 6,
  },

  codesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 6,
  },
  codeCell: {
    width: "31%",
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  codeText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.5,
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
    marginBottom: 10,
  },
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },

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

  dangerBtn: {
    height: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: colors.stockOutBg,
    borderWidth: 1.5,
    borderColor: "rgba(178, 58, 46, 0.35)",
  },
  dangerText: { color: colors.stockOut, fontSize: 13.5, fontWeight: "800" },

  modeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 14,
  },
  cancelText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 10,
    textDecorationLine: "underline",
  },

  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});

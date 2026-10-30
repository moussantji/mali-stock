/**
 * MALI STOCK — Boîtes de dialogue Bogolan
 * Remplace Alert.alert par une modale unique, cohérente dans toute l'application :
 * bandeau tricolore, icône contextuelle, actions vertes / or / rouge latérite.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tricoloreBand } from "../theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type DialogKind = "alert" | "confirm";

export type AppDialogVariant = "info" | "success" | "warning" | "danger";

export interface AppAlertOptions {
  title: string;
  message?: string;
  variant?: AppDialogVariant;
  icon?: IconName;
  confirmLabel?: string;
  dismissible?: boolean;
}

export interface AppConfirmOptions extends AppAlertOptions {
  cancelLabel?: string;
  destructive?: boolean;
}

export interface AppDialogApi {
  /** Message d'information avec un seul bouton de fermeture. */
  alert: (options: AppAlertOptions) => Promise<void>;
  /** Question avec « Annuler » / confirmation. Résout true si confirmé. */
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
}

interface VariantTheme {
  icon: IconName;
  color: string;
  background: string;
  gradient: [string, string];
  text: string;
}

const VARIANT_THEME: Record<AppDialogVariant, VariantTheme> = {
  info: {
    icon: "information-circle-outline",
    color: colors.primary,
    background: "rgba(10, 107, 69, 0.10)",
    gradient: [colors.primaryLight, colors.primary],
    text: colors.onPrimary,
  },
  success: {
    icon: "checkmark-circle-outline",
    color: colors.stockOk,
    background: colors.stockOkBg,
    gradient: [colors.primaryLight, colors.primary],
    text: colors.onPrimary,
  },
  warning: {
    icon: "alert-circle-outline",
    color: colors.goldDark,
    background: colors.accentSoft,
    gradient: [colors.goldLight, colors.gold],
    text: colors.onGold,
  },
  danger: {
    icon: "warning-outline",
    color: colors.red,
    background: "rgba(178, 58, 46, 0.12)",
    gradient: [colors.redLight, colors.red],
    text: colors.onPrimary,
  },
};

interface NormalizedDialogOptions {
  title: string;
  message?: string;
  variant: AppDialogVariant;
  icon: IconName;
  confirmLabel: string;
  cancelLabel: string;
  dismissible: boolean;
  destructive: boolean;
}

interface ActiveDialog {
  id: number;
  kind: DialogKind;
  options: NormalizedDialogOptions;
  resolve: (confirmed: boolean) => void;
}

function normalizeOptions(
  options: AppConfirmOptions,
  kind: DialogKind
): NormalizedDialogOptions {
  const variant = options.variant ?? "info";
  const defaultIcon: IconName =
    kind === "confirm"
      ? variant === "danger"
        ? "warning-outline"
        : "help-circle-outline"
      : VARIANT_THEME[variant].icon;

  return {
    title: options.title,
    message: options.message,
    variant,
    icon: options.icon ?? defaultIcon,
    confirmLabel: options.confirmLabel ?? (kind === "confirm" ? "Confirmer" : "Compris"),
    cancelLabel: options.cancelLabel ?? "Annuler",
    dismissible: options.dismissible ?? true,
    destructive: options.destructive ?? variant === "danger",
  };
}

const AppDialogContext = createContext<AppDialogApi | null>(null);

export function useAppDialog(): AppDialogApi {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog doit être utilisé dans <AppDialogProvider>.");
  }
  return context;
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const activeRef = useRef<ActiveDialog | null>(null);
  const queueRef = useRef<ActiveDialog[]>([]);
  const closingRef = useRef(false);
  const idRef = useRef(0);
  const progress = useRef(new Animated.Value(0)).current;

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      activeRef.current = null;
      setActive(null);
      return;
    }
    activeRef.current = next;
    setActive(next);
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 260,
      mass: 0.9,
    }).start();
  }, [progress]);

  const closeDialog = useCallback(
    (confirmed: boolean) => {
      const current = activeRef.current;
      if (!current || closingRef.current) return;
      closingRef.current = true;
      Animated.timing(progress, {
        toValue: 0,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        closingRef.current = false;
        current.resolve(confirmed);
        activeRef.current = null;
        showNext();
      });
    },
    [progress, showNext]
  );

  const dismiss = useCallback(() => {
    const current = activeRef.current;
    if (!current || !current.options.dismissible) return;
    closeDialog(false);
  }, [closeDialog]);

  const enqueue = useCallback(
    (entry: ActiveDialog) => {
      queueRef.current.push(entry);
      if (!activeRef.current) showNext();
    },
    [showNext]
  );

  const alert = useCallback(
    (options: AppAlertOptions) =>
      new Promise<void>((resolve) => {
        enqueue({
          id: ++idRef.current,
          kind: "alert",
          options: normalizeOptions(options, "alert"),
          resolve: () => resolve(),
        });
      }),
    [enqueue]
  );

  const confirm = useCallback(
    (options: AppConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          id: ++idRef.current,
          kind: "confirm",
          options: normalizeOptions(options, "confirm"),
          resolve,
        });
      }),
    [enqueue]
  );

  // Résout les promesses en attente si le provider est démonté.
  useEffect(
    () => () => {
      activeRef.current?.resolve(false);
      activeRef.current = null;
      queueRef.current.forEach((entry) => entry.resolve(false));
      queueRef.current = [];
    },
    []
  );

  const api = useMemo<AppDialogApi>(() => ({ alert, confirm }), [alert, confirm]);

  const options = active?.options;
  const theme = options ? VARIANT_THEME[options.variant] : VARIANT_THEME.info;
  const actionTheme = options?.destructive ? VARIANT_THEME.danger : theme;
  const maxMessageHeight = Math.min(300, Math.max(170, Math.round(windowHeight * 0.3)));

  const cardOpacity = progress;
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.62],
  });

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Modal
        visible={active !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <View
          style={[
            styles.overlay,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
          />

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Fermer la fenêtre"
          />

          {active && options ? (
            <Animated.View
              key={active.id}
              accessibilityRole="alert"
              accessibilityViewIsModal
              style={[
                styles.card,
                { opacity: cardOpacity, transform: [{ scale }, { translateY }] },
              ]}
            >
              <View style={styles.band}>
                {tricoloreBand.map((color) => (
                  <View key={color} style={[styles.bandPart, { backgroundColor: color }]} />
                ))}
              </View>

              <View style={styles.content}>
                <View style={[styles.iconWrap, { backgroundColor: theme.background }]}>
                  <Ionicons name={options.icon} size={26} color={theme.color} />
                </View>

                <Text style={styles.title}>{options.title}</Text>

                {options.message ? (
                  <ScrollView
                    style={[styles.messageScroll, { maxHeight: maxMessageHeight }]}
                    contentContainerStyle={styles.messageContent}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                  >
                    <Text style={styles.message}>{options.message}</Text>
                  </ScrollView>
                ) : null}

                <View style={styles.actions}>
                  {active.kind === "confirm" ? (
                    <Pressable
                      onPress={() => closeDialog(false)}
                      accessibilityRole="button"
                      accessibilityLabel={options.cancelLabel}
                      style={({ pressed }) => [
                        styles.cancelButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.cancelText}>{options.cancelLabel}</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => closeDialog(true)}
                    accessibilityRole="button"
                    accessibilityLabel={options.confirmLabel}
                    style={({ pressed }) => [
                      styles.confirmPressable,
                      pressed && styles.pressed,
                    ]}
                  >
                    <LinearGradient
                      colors={actionTheme.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.confirmGradient}
                    >
                      <Text style={[styles.confirmText, { color: actionTheme.text }]}>
                        {options.confirmLabel}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </AppDialogContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  backdrop: {
    backgroundColor: colors.primaryDeep,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: "#031F15",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 18,
  },
  band: { flexDirection: "row", height: 5 },
  bandPart: { flex: 1 },
  content: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(27, 32, 26, 0.06)",
  },
  title: {
    marginTop: 14,
    fontSize: 19,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    letterSpacing: 0.1,
  },
  messageScroll: {
    alignSelf: "stretch",
    marginTop: 7,
  },
  messageContent: { paddingBottom: 2 },
  message: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: "600",
    color: colors.textMuted,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 10,
    marginTop: 22,
  },
  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.textMuted,
  },
  confirmPressable: { flex: 1.2 },
  confirmGradient: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  confirmText: {
    fontSize: 12.5,
    fontWeight: "800",
    textAlign: "center",
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});

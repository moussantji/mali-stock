import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { TwoFactorScreen } from "./src/screens/TwoFactorScreen";
import { VerifyEmailScreen } from "./src/screens/VerifyEmailScreen";
import { colors } from "./src/theme";
import { AppDialogProvider } from "./src/ui/AppDialog";

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <StatusBar style="dark" />
      <View style={styles.logo}>
        <Text style={styles.logoText}>MS</Text>
      </View>
      <Text style={styles.title}>Mali Stock</Text>
      <Text style={styles.subtitle}>Bogolan · Tricolore</Text>
      <ActivityIndicator color={colors.primary} style={styles.loader} />
    </View>
  );
}

function Root() {
  const { user, isBootstrapping, verification, twoFactor } = useAuth();
  const [flow, setFlow] = useState<"login" | "forgot">("login");

  if (isBootstrapping) return <SplashScreen />;
  if (twoFactor) return <TwoFactorScreen />;
  if (user) {
    if (!user.emailVerified) return <VerifyEmailScreen />;
    /* Tous les comptes sont des comptes vendeurs ; l'admin est un vendeur
       avec des outils supplémentaires dans le tableau de bord. */
    return <DashboardScreen />;
  }
  if (verification) return <VerifyEmailScreen />;
  if (flow === "forgot") {
    return <ForgotPasswordScreen onBack={() => setFlow("login")} />;
  }
  return <LoginScreen onForgotPassword={() => setFlow("forgot")} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppDialogProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </AppDialogProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  logoText: { color: colors.gold, fontSize: 22, fontWeight: "900" },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 16 },
  subtitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginTop: 4,
  },
  loader: { marginTop: 22 },
});

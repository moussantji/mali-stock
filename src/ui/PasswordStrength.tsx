/**
 * Jauge de force du mot de passe — 6 segments, feedback instantané.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { getPasswordChecks, passwordStrength, type PasswordTone } from "../auth/password";

const TONE_COLOR: Record<PasswordTone, string> = {
  danger: colors.stockOut,
  warning: colors.gold,
  success: colors.stockOk,
};

export function PasswordStrength({ password }: { password: string }) {
  if (password.length === 0) return null;

  const checks = getPasswordChecks(password);
  const filled = checks.filter(Boolean).length;
  const { label, tone } = passwordStrength(password);
  const color = TONE_COLOR[tone];

  return (
    <View style={styles.row}>
      <View style={styles.segments}>
        {checks.map((_, index) => (
          <View
            key={index}
            style={[styles.segment, { backgroundColor: index < filled ? color : colors.border }]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color }]}>Mot de passe {label.toLowerCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: -4,
    marginBottom: 10,
  },
  segments: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

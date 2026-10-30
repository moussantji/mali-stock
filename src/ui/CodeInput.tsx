/**
 * Champ de code à 6 chiffres — une case par chiffre, avancement automatique,
 * retour arrière intelligent et collage d'un code complet.
 */
import React, { useRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from "react-native";
import { colors } from "../theme";

interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  disabled?: boolean;
}

export function CodeInput({ value, onChange, length = 6, disabled = false }: CodeInputProps) {
  const refs = useRef<Array<TextInputInstance | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);

  const focusAt = (index: number) => {
    const target = Math.max(0, Math.min(length - 1, index));
    refs.current[target]?.focus();
  };

  const handleChange = (index: number, text: string) => {
    const clean = text.replace(/[^0-9]/g, "");

    if (clean.length > 1) {
      // Collage d'un code entier (ou d'une suite de chiffres).
      const merged = (value.slice(0, index) + clean).replace(/[^0-9]/g, "").slice(0, length);
      onChange(merged);
      focusAt(merged.length);
      return;
    }

    let next: string;
    if (clean.length === 0) {
      next = index < value.length ? value.slice(0, index) + value.slice(index + 1) : value;
    } else if (value.length <= index) {
      next = value + clean;
    } else {
      next = value.slice(0, index) + clean + value.slice(index + 1);
    }
    next = next.slice(0, length);
    onChange(next);

    if (clean.length > 0) {
      focusAt(next.length);
    }
  };

  const handleKeyPress = (index: number, event: TextInputKeyPressEvent) => {
    if (event.nativeEvent.key !== "Backspace") return;
    if (value[index] === undefined && index > 0) {
      onChange(value.slice(0, index - 1));
      focusAt(index - 1);
    }
  };

  return (
    <View style={styles.row} accessibilityLabel="Code à 6 chiffres">
      {Array.from({ length }, (_, index) => {
        const digit = value[index] ?? "";
        const isFocused = focused === index;
        return (
          <TextInput
            key={index}
            ref={(instance) => {
              refs.current[index] = instance;
            }}
            style={[
              styles.box,
              digit ? styles.boxFilled : null,
              isFocused && styles.boxFocused,
              disabled && styles.boxDisabled,
            ]}
            value={digit}
            onChangeText={(text) => handleChange(index, text)}
            onKeyPress={(event) => handleKeyPress(index, event)}
            onFocus={() => setFocused(index)}
            onBlur={() => setFocused(null)}
            maxLength={1}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoCorrect={false}
            editable={!disabled}
            returnKeyType="done"
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  box: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceWarm,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  boxFilled: {
    borderColor: "rgba(10, 107, 69, 0.45)",
  },
  boxFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  boxDisabled: {
    opacity: 0.55,
  },
});

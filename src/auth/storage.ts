import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "maliStockToken";
const DEVICE_TOKEN_KEY = "maliStockDeviceToken";

export async function getStoredDeviceToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(DEVICE_TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeDeviceToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(DEVICE_TOKEN_KEY, token);
    } catch {
      // Stockage web indisponible : la confiance reste en mémoire pour la session.
    }
    return;
  }
  await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredDeviceToken(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(DEVICE_TOKEN_KEY);
    } catch {
      // Rien à faire.
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
  } catch {
    // Rien à faire.
  }
}

export async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(TOKEN_KEY, token);
    } catch {
      // Stockage web indisponible (navigation privée) : la session reste en mémoire.
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredToken(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(TOKEN_KEY);
    } catch {
      // Rien à faire.
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Le jeton reste peut-être présent, mais la session en mémoire est déjà fermée.
  }
}

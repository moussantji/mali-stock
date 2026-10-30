import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * En développement, l'API tourne sur le même PC que Metro.
 * On récupère donc automatiquement l'IP du PC depuis Expo Go.
 * En production, définir EXPO_PUBLIC_API_URL dans l'environnement.
 */
function resolveDevHost(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    "";
  const host = hostUri.split(":")[0];
  if (host) return host;
  return Platform.OS === "android" ? "10.0.2.2" : "localhost";
}

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL?.trim() || `http://${resolveDevHost()}:4000`
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Corps complet de la réponse (tickets, champs, etc.). */
  body?: { message?: string; code?: string; ticket?: string; [key: string]: unknown } | null;

  constructor(
    message: string,
    status: number,
    code?: string,
    body?: { message?: string; code?: string; ticket?: string; [key: string]: unknown } | null
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, timeoutMs = 15_000 } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data: { message?: string; code?: string; ticket?: string; [key: string]: unknown } | null = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw new ApiError(
        data?.message || "Une erreur est survenue. Réessaie dans un instant.",
        response.status,
        data?.code,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === "AbortError") {
      throw new ApiError("Le serveur met trop de temps à répondre. Réessaie.", 0);
    }
    throw new ApiError(
      `Impossible de joindre le serveur (${API_URL}). Vérifie que l'API est démarrée et que le téléphone est sur le même Wi-Fi.`,
      0
    );
  } finally {
    clearTimeout(timeout);
  }
}

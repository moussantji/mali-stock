import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { ApiError, apiRequest } from "./api";
import {
  clearStoredDeviceToken,
  clearStoredToken,
  getStoredDeviceToken,
  getStoredToken,
  storeDeviceToken,
  storeToken,
} from "./storage";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  totpEnabled?: boolean;
  accountType?: "standard" | "pro";
  isAdmin?: boolean;
  shopName?: string | null;
  shopCategory?: string | null;
  shopCity?: string | null;
  shopBio?: string | null;
  createdAt?: string;
}

/** Inscription d'un vendeur : sa boutique est créée en même temps que le compte. */
export interface SignUpOptions {
  shopName: string;
  shopCategory?: string;
  shopCity?: string;
}

interface SessionResponse {
  token: string;
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

/** Réponse de /register : session immédiate ou compte en attente de vérification. */
interface RegisterResponse extends Partial<SessionResponse> {
  email: string;
  emailSent?: boolean;
  devCode?: string;
  retryAfter?: number;
}

/** Réponse des endpoints qui émettent un code (renvoi, mot de passe oublié). */
export interface CodeSendResponse {
  sent?: boolean;
  emailSent?: boolean;
  devCode?: string;
  retryAfter?: number;
}

/** Connexion en attente d'un code 2FA. */
export interface TwoFactorPending {
  ticket: string;
  email: string;
}

interface TwoFactorSessionResponse extends SessionResponse {
  deviceToken?: string;
}

/** Statut 2FA renvoyé par GET /2fa/status. */
export interface TwoFactorStatus {
  enabled: boolean;
  backupCodesLeft: number;
  trustedDevices: Array<{
    label: string;
    createdAt?: string;
    lastUsedAt?: string | null;
    expiresAt?: string | null;
  }>;
}

/** Données de démarrage de l'activation 2FA. */
export interface TwoFactorSetup {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
  expiresInMinutes?: number;
}

/** Compte en attente de vérification email. */
export interface VerificationFlow {
  email: string;
  devCode?: string | null;
}

interface RunAuthOptions {
  onApiError?: (error: ApiError) => boolean;
  onSuccess?: () => void | Promise<void>;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isBootstrapping: boolean;
  isSubmitting: boolean;
  error: string | null;
  clearError: () => void;
  verification: VerificationFlow | null;
  clearVerification: () => void;
  twoFactor: TwoFactorPending | null;
  clearTwoFactor: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (
    name: string,
    email: string,
    password: string,
    options: SignUpOptions
  ) => Promise<boolean>;
  signInWithGoogle: (idToken: string) => Promise<boolean>;
  verifyEmail: (email: string, code: string) => Promise<boolean>;
  resendVerification: (email: string) => Promise<CodeSendResponse | null>;
  requestPasswordReset: (email: string) => Promise<CodeSendResponse | null>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  verifyTwoFactor: (code: string, rememberDevice?: boolean) => Promise<boolean>;
  getTwoFactorStatus: () => Promise<TwoFactorStatus | null>;
  startTwoFactorSetup: () => Promise<TwoFactorSetup | null>;
  confirmTwoFactorSetup: (code: string) => Promise<string[] | null>;
  disableTwoFactor: (password: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationFlow | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorPending | null>(null);
  const deviceTokenRef = useRef<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearVerification = useCallback(() => setVerification(null), []);
  const clearTwoFactor = useCallback(() => setTwoFactor(null), []);

  useEffect(() => {
    let active = true;

    (async () => {
      const [storedToken, storedDeviceToken] = await Promise.all([
        getStoredToken(),
        getStoredDeviceToken(),
      ]);
      deviceTokenRef.current = storedDeviceToken;
      if (!storedToken) {
        if (active) setIsBootstrapping(false);
        return;
      }

      try {
        const me = await apiRequest<MeResponse>("/api/auth/me", { token: storedToken });
        if (active) {
          setUser(me.user);
          setToken(storedToken);
        }
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          await clearStoredToken();
        }
        // Serveur injoignable : on garde le jeton pour la prochaine ouverture.
      } finally {
        if (active) setIsBootstrapping(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const applySession = useCallback(async (session: TwoFactorSessionResponse) => {
    if (session.deviceToken) {
      deviceTokenRef.current = session.deviceToken;
      await storeDeviceToken(session.deviceToken);
    }
    await storeToken(session.token);
    setToken(session.token);
    setUser(session.user);
    setError(null);
  }, []);

  const runAuth = useCallback(
    async (request: () => Promise<SessionResponse>, options: RunAuthOptions = {}): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const session = await request();
        await applySession(session);
        await options.onSuccess?.();
        return true;
      } catch (requestError) {
        if (
          requestError instanceof ApiError &&
          options.onApiError?.(requestError) === true
        ) {
          // Erreur absorbée : un écran dédié prend le relais.
          return false;
        }
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Une erreur inattendue est survenue. Réessaie."
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [applySession]
  );

  /** Endpoints qui émettent un code sans créer de session. */
  const runCodeAction = useCallback(
    async (path: string, body: Record<string, unknown>): Promise<CodeSendResponse | null> => {
      setIsSubmitting(true);
      setError(null);
      try {
        return await apiRequest<CodeSendResponse>(path, { method: "POST", body });
      } catch (requestError) {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Une erreur inattendue est survenue. Réessaie."
        );
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  const signIn = useCallback(
    (email: string, password: string) =>
      runAuth(
        () =>
          apiRequest<SessionResponse>("/api/auth/login", {
            method: "POST",
            body: { email, password, deviceToken: deviceTokenRef.current ?? undefined },
          }),
        {
          onApiError: (apiError) => {
            if (apiError.code === "EMAIL_NOT_VERIFIED") {
              setVerification({ email });
              return true;
            }
            if (apiError.code === "TOTP_REQUIRED" && apiError.body?.ticket) {
              setTwoFactor({ ticket: String(apiError.body.ticket), email });
              return true;
            }
            return false;
          },
          onSuccess: () => {
            setVerification(null);
            setTwoFactor(null);
          },
        }
      ),
    [runAuth]
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string, options: SignUpOptions) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const data = await apiRequest<RegisterResponse>("/api/auth/register", {
          method: "POST",
          body: {
            name,
            email,
            password,
            shopName: options.shopName,
            shopCategory: options.shopCategory || undefined,
            shopCity: options.shopCity || undefined,
          },
        });
        if (data.token && data.user) {
          await applySession({ token: data.token, user: data.user });
          setVerification(null);
        } else {
          // Compte créé : l'email doit être vérifié par code.
          setVerification({ email: data.email || email, devCode: data.devCode ?? null });
        }
        return true;
      } catch (requestError) {
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Une erreur inattendue est survenue. Réessaie."
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [applySession]
  );

  const signInWithGoogle = useCallback(
    (idToken: string) =>
      runAuth(
        () =>
          apiRequest<SessionResponse>("/api/auth/google", {
            method: "POST",
            body: { idToken },
          }),
        { onSuccess: () => setVerification(null) }
      ),
    [runAuth]
  );

  const verifyEmail = useCallback(
    (email: string, code: string) =>
      runAuth(
        () =>
          apiRequest<SessionResponse>("/api/auth/verify-email", {
            method: "POST",
            body: { email, code },
          }),
        { onSuccess: () => setVerification(null) }
      ),
    [runAuth]
  );

  const resendVerification = useCallback(
    async (email: string) => {
      const data = await runCodeAction("/api/auth/resend-verification", { email });
      if (data?.devCode) {
        setVerification((current) =>
          current && current.email === email ? { ...current, devCode: data.devCode } : current
        );
      }
      return data;
    },
    [runCodeAction]
  );

  const requestPasswordReset = useCallback(
    (email: string) => runCodeAction("/api/auth/forgot-password", { email }),
    [runCodeAction]
  );

  const resetPassword = useCallback(
    (email: string, code: string, newPassword: string) =>
      runAuth(
        () =>
          apiRequest<SessionResponse>("/api/auth/reset-password", {
            method: "POST",
            body: { email, code, password: newPassword },
          }),
        { onSuccess: () => setVerification(null) }
      ),
    [runAuth]
  );

  const verifyTwoFactor = useCallback(
    (code: string, rememberDevice = false) =>
      runAuth(
        () => {
          if (!twoFactor?.ticket) {
            throw new ApiError("Reconnecte-toi d'abord.", 401);
          }
          return apiRequest<TwoFactorSessionResponse>("/api/auth/login-2fa", {
            method: "POST",
            body: {
              ticket: twoFactor.ticket,
              code,
              rememberDevice,
              deviceLabel:
                Platform.OS === "android" ? "Android" : Platform.OS === "ios" ? "iPhone" : "Appareil",
            },
          });
        },
        {
          onSuccess: () => {
            setTwoFactor(null);
            setVerification(null);
          },
        }
      ),
    [runAuth, twoFactor?.ticket]
  );

  /* ── Gestion de la 2FA (écran Sécurité) ──────────────────── */

  const getTwoFactorStatus = useCallback(async (): Promise<TwoFactorStatus | null> => {
    try {
      return await apiRequest<TwoFactorStatus>("/api/auth/2fa/status", { token });
    } catch {
      return null;
    }
  }, [token]);

  const startTwoFactorSetup = useCallback(async (): Promise<TwoFactorSetup | null> => {
    if (!token) return null;
    try {
      setError(null);
      return await apiRequest<TwoFactorSetup>("/api/auth/2fa/setup", { method: "POST", token });
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Une erreur inattendue est survenue. Réessaie."
      );
      return null;
    }
  }, [token]);

  const confirmTwoFactorSetup = useCallback(async (code: string): Promise<string[] | null> => {
    if (!token) return null;
    try {
      setError(null);
      const data = await apiRequest<{ backupCodes: string[]; user: AuthUser }>("/api/auth/2fa/verify", {
        method: "POST",
        body: { code },
        token,
      });
      setUser(data.user);
      return data.backupCodes ?? [];
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Une erreur inattendue est survenue. Réessaie."
      );
      return null;
    }
  }, [token]);

  const disableTwoFactor = useCallback(async (password: string, code: string): Promise<boolean> => {
    if (!token) return false;
    try {
      setError(null);
      const data = await apiRequest<{ user: AuthUser }>("/api/auth/2fa/disable", {
        method: "POST",
        body: { password, code },
        token,
      });
      setUser(data.user);
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Une erreur inattendue est survenue. Réessaie."
      );
      return false;
    }
  }, [token]);

  const signOut = useCallback(async () => {
    const currentToken = token;
    setUser(null);
    setToken(null);
    setError(null);
    setVerification(null);
    setTwoFactor(null);
    deviceTokenRef.current = null;
    await Promise.all([clearStoredToken(), clearStoredDeviceToken()]);
    if (currentToken) {
      apiRequest("/api/auth/logout", { method: "POST", token: currentToken }).catch(() => {
        // Déconnexion locale déjà effective : le JWT expirera de lui-même.
      });
    }
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isBootstrapping,
      isSubmitting,
      error,
      clearError,
      verification,
      clearVerification,
      twoFactor,
      clearTwoFactor,
      signIn,
      signUp,
      signInWithGoogle,
      verifyEmail,
      resendVerification,
      requestPasswordReset,
      resetPassword,
      verifyTwoFactor,
      getTwoFactorStatus,
      startTwoFactorSetup,
      confirmTwoFactorSetup,
      disableTwoFactor,
      signOut,
    }),
    [
      user,
      token,
      isBootstrapping,
      isSubmitting,
      error,
      clearError,
      verification,
      clearVerification,
      twoFactor,
      clearTwoFactor,
      signIn,
      signUp,
      signInWithGoogle,
      verifyEmail,
      resendVerification,
      requestPasswordReset,
      resetPassword,
      verifyTwoFactor,
      getTwoFactorStatus,
      startTwoFactorSetup,
      confirmTwoFactorSetup,
      disableTwoFactor,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider.");
  }
  return context;
}

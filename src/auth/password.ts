/**
 * Politique de mot de passe Mali Stock — partagée par le formulaire
 * (validation instantanée + jauge de force) et alignée sur le serveur.
 */

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "12345678910",
  "password",
  "password1",
  "password123",
  "motdepasse",
  "motdepasse1",
  "mdp12345",
  "azerty123",
  "azertyuiop",
  "qwerty123",
  "qwerty12345",
  "admin123",
  "admin1234",
  "iloveyou",
  "welcome1",
  "bienvenue1",
  "soleil123",
  "mali12345",
  "malistock1",
  "abc12345",
  "1q2w3e4r",
  "qazwsx123",
]);

/** Les 6 critères évalués en direct : longueur 8, minuscule, majuscule, chiffre, spécial, longueur 12. */
export function getPasswordChecks(password: string): boolean[] {
  return [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
    password.length >= 12,
  ];
}

export function passwordScore(password: string): number {
  return getPasswordChecks(password).filter(Boolean).length;
}

export type PasswordTone = "danger" | "warning" | "success";

export function passwordStrength(password: string): { label: string; tone: PasswordTone } {
  const score = passwordScore(password);
  if (score <= 2) return { label: "Faible", tone: "danger" };
  if (score <= 3) return { label: "Moyen", tone: "warning" };
  if (score <= 4) return { label: "Bon", tone: "warning" };
  return { label: "Excellent", tone: "success" };
}

/**
 * Même règle que le serveur : renvoie un message d'erreur en français
 * ou null si le mot de passe est acceptable pour une inscription.
 */
export function passwordPolicyError(
  password: string,
  name = "",
  email = ""
): string | null {
  if (password.length === 0) {
    return "Le mot de passe est obligatoire.";
  }
  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (!/[a-z]/.test(password)) {
    return "Ajoute au moins une lettre minuscule au mot de passe.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Ajoute au moins une lettre majuscule au mot de passe.";
  }
  if (!/[0-9]/.test(password)) {
    return "Ajoute au moins un chiffre au mot de passe.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Ajoute au moins un caractère spécial (ex. ! ? #) au mot de passe.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "Ce mot de passe est trop courant. Choisis-en un plus personnel.";
  }

  const lowered = password.toLowerCase();
  const emailLocal = email.trim().toLowerCase().split("@")[0];
  if (emailLocal.length >= 3 && lowered.includes(emailLocal)) {
    return "Le mot de passe ne doit pas contenir ton adresse email.";
  }
  const nameToken = name.trim().toLowerCase();
  if (
    nameToken.length >= 3 &&
    nameToken
      .split(" ")
      .filter((part) => part.length >= 3)
      .some((part) => lowered.includes(part))
  ) {
    return "Le mot de passe ne doit pas contenir ton nom.";
  }
  return null;
}

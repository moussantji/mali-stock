/**
 * Politique de mot de passe Mali Stock.
 * Longueur minimale 8 + majuscule + minuscule + chiffre + caractère spécial,
 * refus des mots de passe trop courants et de ceux contenant nom/email.
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

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @returns {string|null} message d'erreur en français, ou null si le mot de passe est acceptable.
 */
function passwordError(password, { name = "", email = "" } = {}) {
  if (typeof password !== "string" || password.length === 0) {
    return "Le mot de passe est obligatoire.";
  }
  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "Le mot de passe ne doit pas dépasser 72 octets.";
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
  const emailLocal = cleanString(email).split("@")[0];
  const nameToken = cleanString(name).toLowerCase();

  if (emailLocal.length >= 3 && lowered.includes(emailLocal)) {
    return "Le mot de passe ne doit pas contenir ton adresse email.";
  }
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

module.exports = { passwordError, COMMON_PASSWORDS };

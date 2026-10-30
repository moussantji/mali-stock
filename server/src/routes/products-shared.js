/**
 * Helpers partagés entre les routes produits / commandes / public.
 */

/** Chiffre depuis n'importe quoi (nombre, string, "1 234,56") → number arrondi à 2 décimales. */
function toNumber(value, fallback = 0) {
  const n =
    typeof value === "number" ? value : parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 100) / 100;
}

/** Chaîne nettoyée (trim) ou "". */
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalise un code scanné en jeton produit « MSXXXXXXXX ».
 * Accepte « MALISTOCK:MSABCDEFGH », « malistock:msabcdefgh », « MSABCDEFGH ».
 */
function normalizeQrToken(value) {
  let token = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (token.startsWith("MALISTOCK")) token = token.slice("MALISTOCK".length);
  return token;
}

module.exports = { toNumber, cleanString, normalizeQrToken };

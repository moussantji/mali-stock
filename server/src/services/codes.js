/**
 * Codes à 6 chiffres pour la vérification email et la réinitialisation
 * du mot de passe. Le code est stocké hashé (SHA-256) avec une expiration
 * de 10 minutes, 5 tentatives maximum et 60 s entre deux envois.
 */
const crypto = require("crypto");
const pool = require("../db");

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function digitsOnly(value) {
  return typeof value === "string" ? value.replace(/[^0-9]/g, "") : "";
}

/**
 * Enregistre un nouveau code. Renvoie { ok, code } ou { ok:false, retryAfter }.
 */
async function issueCode(userId, purpose) {
  // Nettoyage des codes expirés ou consommés du même utilisateur.
  await pool.execute(
    "DELETE FROM auth_codes WHERE user_id = ? AND purpose = ? AND (expires_at < NOW() OR consumed_at IS NOT NULL)",
    [userId, purpose]
  );

  const [recent] = await pool.execute(
    `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS ageSeconds
     FROM auth_codes WHERE user_id = ? AND purpose = ?
     ORDER BY id DESC LIMIT 1`,
    [userId, purpose]
  );
  const age = recent[0]?.ageSeconds ?? Number.MAX_SAFE_INTEGER;
  if (age < RESEND_COOLDOWN_SECONDS) {
    return { ok: false, retryAfter: RESEND_COOLDOWN_SECONDS - age };
  }

  const code = generateCode();
  const [result] = await pool.execute(
    "INSERT INTO auth_codes (user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
    [userId, purpose, hashCode(code), CODE_TTL_MINUTES]
  );
  return { ok: true, code, id: result.insertId };
}

/** Supprime un code (utilisé quand l'email n'a pas pu partir). */
async function discardCode(codeId) {
  await pool.execute("DELETE FROM auth_codes WHERE id = ?", [codeId]);
}

/**
 * Vérifie le code le plus récent non consommé et non expiré.
 * @returns {{ ok: true } | { ok: false, reason: "none"|"expired"|"locked"|"invalid", attemptsLeft?: number }}
 */
async function verifyCode(userId, purpose, code) {
  const [rows] = await pool.execute(
    `SELECT * FROM auth_codes
     WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, purpose]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "none" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };

  if (row.code_hash !== hashCode(digitsOnly(code))) {
    await pool.execute("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - (row.attempts + 1));
    return {
      ok: false,
      reason: attemptsLeft === 0 ? "locked" : "invalid",
      attemptsLeft,
    };
  }

  await pool.execute("UPDATE auth_codes SET consumed_at = NOW() WHERE id = ?", [row.id]);
  return { ok: true };
}

module.exports = {
  issueCode,
  discardCode,
  verifyCode,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
};

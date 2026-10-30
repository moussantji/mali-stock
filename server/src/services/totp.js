/**
 * Double validation (2FA) TOTP — Google Authenticator / Authy.
 *
 * - Le secret TOTP est chiffré AES-256-GCM au repos (clé TOTP_KEY de server/.env).
 * - Activation en deux temps : secret « en attente » vérifié par un code,
 *   puis promu secret actif + 10 codes de secours à usage unique.
 * - Appareil de confiance : jeton opaque (hashé SHA-256) valable 30 jours,
 *   qui dispense du code TOTP à la connexion.
 */
const crypto = require("crypto");
const { generateSecret, generateURI, generate, verify } = require("otplib");
const config = require("../config");
const pool = require("../db");

const ISSUER = "Mali Stock";
const PENDING_TTL_MINUTES = 15;
const BACKUP_CODE_COUNT = 10;
const TRUSTED_DEVICE_DAYS = 30;
const TOTP_STEP_SECONDS = 30;
/* Alphabet sans caractères ambigus (pas de 0/O, 1/I/L). */
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/* ── Chiffrement du secret (AES-256-GCM) ───────────────────── */

function encryptionKey() {
  if (config.totp.key) {
    return Buffer.from(config.totp.key, "hex");
  }
  // Repli : clé dérivée du secret JWT (évite un échec au démarrage).
  return crypto.createHash("sha256").update(`${config.jwt.secret}::totp`).digest();
}

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(payload) {
  try {
    const [version, ivPart, tagPart, dataPart] = String(payload).split(".");
    if (version !== "v1" || !ivPart || !tagPart || !dataPart) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function hashCode(code) {
  return crypto
    .createHash("sha256")
    .update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}

/* ── Configuration / vérification TOTP ─────────────────────── */

/** Tolérance ±1 pas de temps (30 s) pour absorber la dérive d'horloge. */
async function verifyAgainstSecret(code, secret) {
  if (!/^[0-9]{6}$/.test(code)) return false;
  try {
    const result = await verify({ secret, token: code, epochTolerance: TOTP_STEP_SECONDS });
    return Boolean(result?.valid);
  } catch {
    return false;
  }
}

/**
 * Prépare un secret « en attente » (à confirmer par un code avant activation).
 * @returns {Promise<{ otpauthUri: string, qrDataUrl: string, secret: string }>}
 */
async function createPendingSetup(user, qrCodeModule) {
  const secret = generateSecret();
  const otpauthUri = generateURI({ issuer: ISSUER, label: user.email, secret });
  const qrDataUrl = await qrCodeModule.toDataURL(otpauthUri, {
    margin: 1,
    width: 440,
    color: { dark: "#063D29", light: "#F7F0DD" },
  });

  await pool.execute(
    "UPDATE users SET totp_pending_secret_enc = ?, totp_pending_at = NOW() WHERE id = ?",
    [encryptSecret(secret), user.id]
  );

  return { otpauthUri, qrDataUrl, secret };
}

/** Vérifie un code contre le secret en attente (valable 15 minutes). */
async function verifyPendingCode(userId, code) {
  const [rows] = await pool.execute(
    "SELECT totp_pending_secret_enc, totp_pending_at FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  const row = rows[0];
  if (!row?.totp_pending_secret_enc) return { ok: false, reason: "none" };

  const [ageRows] = await pool.execute(
    "SELECT TIMESTAMPDIFF(MINUTE, totp_pending_at, NOW()) AS ageMinutes FROM users WHERE id = ?",
    [userId]
  );
  if ((ageRows[0]?.ageMinutes ?? 999) >= PENDING_TTL_MINUTES) {
    return { ok: false, reason: "expired" };
  }

  const secret = decryptSecret(row.totp_pending_secret_enc);
  if (!secret) return { ok: false, reason: "none" };

  return (await verifyAgainstSecret(code, secret))
    ? { ok: true, secret }
    : { ok: false, reason: "invalid" };
}

/** Active la 2FA : promeut le secret en attente et génère les codes de secours. */
async function enableForUser(userId, secret) {
  await pool.execute(
    `UPDATE users
     SET totp_enabled = 1, totp_secret_enc = ?, totp_pending_secret_enc = NULL, totp_pending_at = NULL
     WHERE id = ?`,
    [encryptSecret(secret), userId]
  );
  return generateBackupCodes(userId);
}

/** Vérifie un code contre le secret actif. */
async function verifyActiveCode(userId, code) {
  const [rows] = await pool.execute("SELECT totp_secret_enc FROM users WHERE id = ? LIMIT 1", [userId]);
  const secret = rows[0] ? decryptSecret(rows[0].totp_secret_enc) : null;
  if (!secret) return false;
  return verifyAgainstSecret(code, secret);
}

/* ── Codes de secours ──────────────────────────────────────── */

async function generateBackupCodes(userId) {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    let code = "";
    for (let j = 0; j < 8; j += 1) {
      code += BACKUP_ALPHABET[crypto.randomInt(0, BACKUP_ALPHABET.length)];
    }
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  await pool.execute("DELETE FROM auth_backup_codes WHERE user_id = ? AND used_at IS NULL", [userId]);
  for (const code of codes) {
    await pool.execute("INSERT INTO auth_backup_codes (user_id, code_hash) VALUES (?, ?)", [
      userId,
      hashCode(code),
    ]);
  }
  return codes;
}

/** Consomme un code de secours à usage unique. Renvoie true si le code était valide. */
async function consumeBackupCode(userId, code) {
  const normalized = String(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 8) return false;
  const [rows] = await pool.execute(
    "SELECT id FROM auth_backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1",
    [userId, hashCode(normalized)]
  );
  if (!rows[0]) return false;
  await pool.execute("UPDATE auth_backup_codes SET used_at = NOW() WHERE id = ?", [rows[0].id]);
  return true;
}

async function countUnusedBackupCodes(userId) {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM auth_backup_codes WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
  return rows[0]?.total ?? 0;
}

/* ── Appareils de confiance ────────────────────────────────── */

/**
 * Enregistre un appareil de confiance et renvoie son jeton (affiché une seule fois).
 */
async function createTrustedDevice(userId, label = null) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.execute("DELETE FROM auth_trusted_devices WHERE user_id = ? AND expires_at < NOW()", [
    userId,
  ]);
  await pool.execute(
    `INSERT INTO auth_trusted_devices (user_id, token_hash, label, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [userId, crypto.createHash("sha256").update(token).digest("hex"), label, TRUSTED_DEVICE_DAYS]
  );
  return token;
}

/** Vérifie un jeton d'appareil et met à jour sa dernière utilisation. */
async function isTrustedDevice(userId, token) {
  if (!token || typeof token !== "string") return false;
  const [rows] = await pool.execute(
    `SELECT id FROM auth_trusted_devices
     WHERE user_id = ? AND token_hash = ? AND expires_at > NOW() LIMIT 1`,
    [userId, crypto.createHash("sha256").update(token).digest("hex")]
  );
  if (!rows[0]) return false;
  await pool.execute("UPDATE auth_trusted_devices SET last_used_at = NOW() WHERE id = ?", [rows[0].id]);
  return true;
}

async function listTrustedDevices(userId) {
  const [rows] = await pool.execute(
    `SELECT label, created_at, last_used_at, expires_at FROM auth_trusted_devices
     WHERE user_id = ? AND expires_at > NOW() ORDER BY last_used_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    label: row.label || "Appareil",
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  }));
}

/** Désactive la 2FA et purge tout ce qui s'y rapporte. */
async function disableForUser(userId) {
  await pool.execute(
    `UPDATE users
     SET totp_enabled = 0, totp_secret_enc = NULL, totp_pending_secret_enc = NULL, totp_pending_at = NULL
     WHERE id = ?`,
    [userId]
  );
  await pool.execute("DELETE FROM auth_backup_codes WHERE user_id = ?", [userId]);
  await pool.execute("DELETE FROM auth_trusted_devices WHERE user_id = ?", [userId]);
}

/** Nombre d'échecs 2FA sur les 10 dernières minutes (anti-bruteforce). */
async function countRecentTwoFactorFailures(userId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM auth_events
     WHERE user_id = ? AND type = '2fa_failed' AND created_at > NOW() - INTERVAL 10 MINUTE`,
    [userId]
  );
  return rows[0]?.total ?? 0;
}

module.exports = {
  PENDING_TTL_MINUTES,
  BACKUP_CODE_COUNT,
  TRUSTED_DEVICE_DAYS,
  createPendingSetup,
  verifyPendingCode,
  enableForUser,
  verifyActiveCode,
  generateBackupCodes,
  consumeBackupCode,
  countUnusedBackupCodes,
  createTrustedDevice,
  isTrustedDevice,
  listTrustedDevices,
  disableForUser,
  countRecentTwoFactorFailures,
};

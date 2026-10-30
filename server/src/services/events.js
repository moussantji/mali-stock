/**
 * Journalisation des événements d'authentification.
 * Best effort : une erreur d'écriture ne doit jamais faire échouer une requête.
 */
const pool = require("../db");

/**
 * @param {object} event
 * @param {number|null} event.userId
 * @param {string|null} event.email
 * @param {string} event.type
 * @param {string|null} event.ip
 * @param {string|null} event.userAgent
 */
async function logAuthEvent({ userId = null, email = null, type, ip = null, userAgent = null }) {
  try {
    await pool.execute(
      "INSERT INTO auth_events (user_id, email, type, ip, user_agent) VALUES (?, ?, ?, ?, ?)",
      [userId, email, type, ip ? String(ip).slice(0, 64) : null, userAgent ? String(userAgent).slice(0, 255) : null]
    );
  } catch (error) {
    console.error("[events] Journalisation impossible :", error.message);
  }
}

/** Nombre d'échecs de connexion pour un email sur les 10 dernières minutes. */
async function countRecentFailures(email) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM auth_events
     WHERE email = ? AND type = 'login_failed' AND created_at > NOW() - INTERVAL 10 MINUTE`,
    [email]
  );
  return rows[0]?.total ?? 0;
}

module.exports = { logAuthEvent, countRecentFailures };

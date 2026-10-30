/* eslint-disable no-console */
/**
 * Migration 002 — 2FA TOTP
 * 1. Colonnes users : totp_secret_enc / totp_enabled / totp_pending_secret_enc / totp_pending_at
 * 2. Tables auth_backup_codes et auth_trusted_devices
 * 3. Extension du type ENUM de auth_events (événements 2FA)
 *
 * Idempotent : peut être relancé sans risque.
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const dbName = process.env.DB_NAME || "mali_stock";
const rootUser = process.env.DB_ROOT_USER || "root";
const rootPassword = process.env.DB_ROOT_PASSWORD || "";
const host = process.env.DB_HOST || "127.0.0.1";
const port = Number(process.env.DB_PORT || 3306);

const USER_COLUMNS = [
  ["totp_secret_enc", "TEXT NULL AFTER `token_version`"],
  ["totp_enabled", "TINYINT(1) NOT NULL DEFAULT 0 AFTER `totp_secret_enc`"],
  ["totp_pending_secret_enc", "TEXT NULL AFTER `totp_enabled`"],
  ["totp_pending_at", "DATETIME NULL AFTER `totp_pending_secret_enc`"],
];

const EVENT_TYPES = [
  "register",
  "login",
  "login_failed",
  "login_blocked_unverified",
  "verify_email",
  "verify_email_failed",
  "resend_code",
  "forgot_password",
  "reset_password",
  "register_rate_limited",
  "2fa_required",
  "2fa_login",
  "2fa_failed",
  "2fa_backup_used",
  "2fa_enabled",
  "2fa_disabled",
  "2fa_blocked",
];

async function main() {
  const admin = await mysql.createConnection({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  // 1. Colonnes users
  for (const [column, definition] of USER_COLUMNS) {
    const [cols] = await admin.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [dbName, column]
    );
    if (cols[0].total === 0) {
      await admin.query(`ALTER TABLE \`${dbName}\`.\`users\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`[db:migrate] users.${column} ajoutée.`);
    } else {
      console.log(`[db:migrate] users.${column} déjà présente.`);
    }
  }

  // 2 + 3. Tables dédiées + extension ENUM
  const sql = fs.readFileSync(path.join(__dirname, "migrate-002-totp.sql"), "utf8");
  const enumSql = `ALTER TABLE \`${dbName}\`.auth_events MODIFY COLUMN type ENUM(${EVENT_TYPES.map(
    (type) => `'${type}'`
  ).join(", ")}) NOT NULL;`;
  await admin.query(`USE \`${dbName}\`; ${sql} ${enumSql}`);
  await admin.end();
  console.log("[db:migrate] Migration 002 terminée.");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

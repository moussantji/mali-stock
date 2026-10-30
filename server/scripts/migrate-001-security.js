/* eslint-disable no-console */
/**
 * Migration 001 — Sécurité de la création de compte
 * 1. Colonne `users.token_version` (invalidation des sessions après reset)
 * 2. Table `auth_codes` (codes de vérification email / réinitialisation)
 * 3. Table `auth_events` (journalisation des événements d'authentification)
 *
 * Idempotent : peut être relancé sans risque.
 * Se connecte en root (ALTER requis) — mêmes variables que db:init.
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

async function main() {
  const admin = await mysql.createConnection({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  // 1. token_version sur users
  const [cols] = await admin.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version'`,
    [dbName]
  );
  if (cols[0].total === 0) {
    await admin.query(
      `ALTER TABLE \`${dbName}\`.\`users\`
       ADD COLUMN \`token_version\` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`email_verified\``
    );
    console.log("[db:migrate] users.token_version ajoutée.");
  } else {
    console.log("[db:migrate] users.token_version déjà présente.");
  }

  // 2 + 3. Tables dédiées
  const sql = fs.readFileSync(path.join(__dirname, "migrate-001-security.sql"), "utf8");
  await admin.query(`USE \`${dbName}\`; ${sql}`);
  await admin.end();
  console.log("[db:migrate] Migration terminée.");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

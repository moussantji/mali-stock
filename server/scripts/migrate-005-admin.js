/* eslint-disable no-console */
/**
 * Migration 005 — rôle administrateur
 * Ajoute users.is_admin : seuls les administrateurs peuvent créer des comptes vendeurs.
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

async function main() {
  const admin = await mysql.createConnection({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  const [cols] = await admin.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin'`,
    [dbName]
  );

  if (cols[0].total === 0) {
    await admin.query(
      `ALTER TABLE \`${dbName}\`.\`users\`
       ADD COLUMN \`is_admin\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`account_type\``
    );
    console.log("[db:migrate] users.is_admin ajoutée.");
  } else {
    console.log("[db:migrate] users.is_admin déjà présente.");
  }

  /* Index utilitaire pour lister rapidement les administrateurs. */
  const [indexes] = await admin.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_admin'`,
    [dbName]
  );
  if (indexes[0].total === 0) {
    await admin.query(`ALTER TABLE \`${dbName}\`.\`users\` ADD KEY \`idx_users_admin\` (\`is_admin\`)`);
    console.log("[db:migrate] Index idx_users_admin ajouté.");
  }

  await admin.end();
  console.log("[db:migrate] Migration 005 terminée (rôle administrateur).");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

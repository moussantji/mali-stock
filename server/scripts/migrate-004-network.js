/* eslint-disable no-console */
/**
 * Migration 004 — réseau de commerce
 * 1. users : account_type (standard/pro) + fiche boutique publique
 * 2. Les comptes existants deviennent « pro » (ce sont des vendeurs)
 * 3. Table orders (commandes comptoir + encaissement)
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
  ["account_type", "ENUM('standard', 'pro') NOT NULL DEFAULT 'standard' AFTER `email`"],
  ["shop_name", "VARCHAR(120) NULL AFTER `account_type`"],
  ["shop_category", "VARCHAR(60) NULL AFTER `shop_name`"],
  ["shop_city", "VARCHAR(80) NULL AFTER `shop_category`"],
  ["shop_bio", "VARCHAR(280) NULL AFTER `shop_city`"],
];

async function main() {
  const admin = await mysql.createConnection({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  /* 1. Colonnes users — l'UPDATE vers « pro » ne se fait qu'à la création des colonnes. */
  let added = false;
  for (const [column, definition] of USER_COLUMNS) {
    const [cols] = await admin.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [dbName, column]
    );
    if (cols[0].total === 0) {
      await admin.query(`ALTER TABLE \`${dbName}\`.\`users\` ADD COLUMN \`${column}\` ${definition}`);
      added = true;
      console.log(`[db:migrate] users.${column} ajoutée.`);
    } else {
      console.log(`[db:migrate] users.${column} déjà présente.`);
    }
  }
  if (added) {
    await admin.query(`UPDATE \`${dbName}\`.users SET account_type = 'pro'`);
    console.log("[db:migrate] Comptes existants marqués « pro » (vendeurs).");
  }

  /* 2. Table orders */
  const sql = fs.readFileSync(path.join(__dirname, "migrate-004-network.sql"), "utf8");
  const ordersOnly = sql.slice(sql.indexOf("CREATE TABLE"));
  await admin.query(`USE \`${dbName}\`; ${ordersOnly}`);
  await admin.end();
  console.log("[db:migrate] Migration 004 terminée (comptes + orders).");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

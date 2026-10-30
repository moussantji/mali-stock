/* eslint-disable no-console */
/**
 * Migration 006 — application 100 % gestion de stock
 * Tous les comptes deviennent des comptes vendeurs (pro). Les anciens comptes
 * acheteurs sont convertis ; un nom de boutique par défaut leur est donné
 * s'ils n'en ont pas encore.
 *
 * Idempotent : peut être relancé sans risque.
 */
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
  });

  const [result] = await admin.query(
    `UPDATE \`${dbName}\`.users
     SET account_type = 'pro'
     WHERE account_type <> 'pro'`
  );
  console.log(`[db:migrate] ${result.affectedRows} compte(s) converti(s) en vendeur.`);

  const [shops] = await admin.query(
    `UPDATE \`${dbName}\`.users
     SET shop_name = name
     WHERE (shop_name IS NULL OR shop_name = '') AND is_admin = 0`
  );
  console.log(`[db:migrate] ${shops.affectedRows} boutique(s) nommée(s) par défaut.`);

  await admin.query(
    `ALTER TABLE \`${dbName}\`.users
     ALTER COLUMN account_type SET DEFAULT 'pro'`
  );
  console.log("[db:migrate] Nouveau type de compte par défaut : vendeur (pro).");

  await admin.end();
  console.log("[db:migrate] Migration 006 terminée (tous les comptes sont vendeurs).");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

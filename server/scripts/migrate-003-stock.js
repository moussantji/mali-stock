/* eslint-disable no-console */
/**
 * Migration 003 — gestion de stock
 * 1. Table products (avec code interne qr_token pour les QR codes)
 * 2. Table stock_movements (entrées / sorties / ajustements — journalisation)
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

  const sql = fs.readFileSync(path.join(__dirname, "migrate-003-stock.sql"), "utf8");
  await admin.query(`USE \`${dbName}\`; ${sql}`);
  await admin.end();
  console.log("[db:migrate] Migration 003 terminée (products + stock_movements).");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

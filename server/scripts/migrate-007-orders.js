/* eslint-disable no-console */
/**
 * Migration 007 — commandes créées par le vendeur
 * Le vendeur peut enregistrer une commande sans compte client :
 *  - user_id devient nullable ;
 *  - customer_name / customer_phone conservent les coordonnées du client comptoir.
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

const COLUMNS = [
  ["customer_name", "VARCHAR(120) NULL AFTER `user_id`"],
  ["customer_phone", "VARCHAR(40) NULL AFTER `customer_name`"],
];

async function main() {
  const admin = await mysql.createConnection({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  for (const [column, definition] of COLUMNS) {
    const [rows] = await admin.query(
      `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
      [dbName, column]
    );
    if (rows[0].total === 0) {
      await admin.query(`ALTER TABLE \`${dbName}\`.orders ADD COLUMN \`${column}\` ${definition}`);
      console.log(`[db:migrate] orders.${column} ajoutée.`);
    } else {
      console.log(`[db:migrate] orders.${column} déjà présente.`);
    }
  }

  const [foreignKeys] = await admin.query(
    `SELECT DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_user'`,
    [dbName]
  );
  const needsForeignKey = foreignKeys.length === 0 || foreignKeys[0].DELETE_RULE !== "SET NULL";

  if (needsForeignKey) {
    const [exists] = await admin.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'orders' AND CONSTRAINT_NAME = 'fk_orders_user'`,
      [dbName]
    );
    if (exists.length > 0) {
      await admin.query(`ALTER TABLE \`${dbName}\`.orders DROP FOREIGN KEY fk_orders_user`);
      console.log("[db:migrate] Ancienne contrainte client supprimée.");
    }
  }

  await admin.query(
    `ALTER TABLE \`${dbName}\`.orders
     MODIFY COLUMN user_id BIGINT UNSIGNED NULL
     COMMENT 'Compte client historique (NULL = client comptoir)'`
  );

  if (needsForeignKey) {
    await admin.query(
      `ALTER TABLE \`${dbName}\`.orders
       ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id)
       REFERENCES \`${dbName}\`.users (id) ON DELETE SET NULL`
    );
    console.log("[db:migrate] Contrainte client recréée avec ON DELETE SET NULL.");
  }

  await admin.end();
  console.log("[db:migrate] Migration 007 terminée (commandes vendeur sans compte client).");
}

main().catch((error) => {
  console.error("[db:migrate] Échec :", error.message);
  process.exit(1);
});

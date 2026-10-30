/* eslint-disable no-console */
/**
 * Crée les comptes de démonstration de l'application de gestion de stock :
 *   - administrateur (vendeur + gestion des boutiques et des comptes)
 *   - vendeur (boutique et stock)
 *
 * Idempotent : les comptes existants sont conservés (mot de passe inchangé)
 * et leur rôle est réaligné.
 *
 * Usage : npm run seed:accounts
 */
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const { passwordError } = require("../src/services/password");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ACCOUNTS = [
  {
    key: "admin",
    name: "Administrateur Mali Stock",
    email: "admin@malistock.ml",
    password: "Sahel2026!Or",
    accountType: "pro",
    isAdmin: 1,
    shopName: "Direction Mali Stock",
    shopCategory: "Administration",
    shopCity: "Bamako",
  },
  {
    key: "vendeur",
    name: "Vendeur Démo",
    email: "vendeur@malistock.ml",
    password: "Bogolan2026!Vente",
    accountType: "pro",
    isAdmin: 0,
    shopName: "Boutique Bogolan",
    shopCategory: "Artisanat & tissus",
    shopCity: "Bamako",
  },
];

/* Comptes de l'ancien parcours acheteur, retirés du modèle « gestion de stock ». */
const OBSOLETE_EMAILS = ["acheteur@malistock.ml"];

async function ensureAccount(conn, account) {
  const invalid = passwordError(account.password, {
    name: account.name,
    email: account.email,
  });
  if (invalid) {
    throw new Error(`Mot de passe invalide pour ${account.email} : ${invalid}`);
  }

  const [rows] = await conn.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [
    account.email,
  ]);

  if (rows.length === 0) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const [result] = await conn.execute(
      `INSERT INTO users
         (name, email, password_hash, account_type, is_admin, shop_name, shop_category, shop_city, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        account.name,
        account.email,
        passwordHash,
        account.accountType,
        account.isAdmin,
        account.shopName,
        account.shopCategory,
        account.shopCity,
      ]
    );
    return { id: result.insertId, created: true };
  }

  const id = rows[0].id;
  await conn.execute(
    `UPDATE users
     SET name = ?, account_type = ?, is_admin = ?, shop_name = ?, shop_category = ?, shop_city = ?,
         email_verified = 1
     WHERE id = ?`,
    [
      account.name,
      account.accountType,
      account.isAdmin,
      account.shopName,
      account.shopCategory,
      account.shopCity,
      id,
    ]
  );
  return { id, created: false };
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "mali_stock",
    charset: "utf8mb4",
  });

  const [columns] = await conn.query(
    `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin'`
  );
  if (columns[0].total === 0) {
    console.error(
      "[seed:accounts] La colonne users.is_admin est absente. Lance d'abord npm run migrate:admin."
    );
    await conn.end();
    process.exit(1);
  }

  for (const email of OBSOLETE_EMAILS) {
    const [result] = await conn.execute("DELETE FROM users WHERE email = ?", [email]);
    if (result.affectedRows > 0) {
      console.log(`[seed:accounts] Ancien compte acheteur supprimé : ${email}`);
    }
  }

  console.log("[seed:accounts] Comptes de démonstration :");
  for (const account of ACCOUNTS) {
    const result = await ensureAccount(conn, account);
    const role = account.isAdmin ? "administrateur" : "vendeur";
    console.log(
      `  ${result.created ? "+" : "="} ${role.padEnd(14)} ${account.email} / ${account.password}`
    );
  }

  await conn.end();
  console.log("[seed:accounts] Terminé.");
}

main().catch((error) => {
  console.error("[seed:accounts] Échec :", error.message);
  process.exit(1);
});

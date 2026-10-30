/* eslint-disable no-console */
/**
 * Supprime les comptes de test créés pendant les vérifications
 * (les événements associés sont conservés sans utilisateur).
 * Usage : npm run clean:test
 */
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

/** Préfixes réservés aux comptes de test — jamais de vrais comptes. */
const TEST_PREFIXES = ["test.", "test.2fa", "real.mail", "weak", "inscription.test"];

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 2,
  });

  let removed = 0;
  for (const prefix of TEST_PREFIXES) {
    const [result] = await pool.execute(
      "DELETE FROM users WHERE email LIKE ? AND email <> 'demo@malistock.ml'",
      [`${prefix}%`]
    );
    removed += result.affectedRows;
  }

  console.log(`✔ ${removed} compte(s) de test supprimé(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error("Échec du nettoyage :", error.message);
  process.exit(1);
});


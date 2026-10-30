/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const dbName = process.env.DB_NAME || "mali_stock";
const appUser = process.env.DB_USER || "mali_app";
const appPassword = process.env.DB_PASSWORD;
const rootUser = process.env.DB_ROOT_USER || "root";
const rootPassword = process.env.DB_ROOT_PASSWORD || "";
const host = process.env.DB_HOST || "127.0.0.1";
const port = Number(process.env.DB_PORT || 3306);

if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  throw new Error("Nom de base invalide (lettres, chiffres et underscores uniquement).");
}
if (!appPassword) {
  throw new Error("DB_PASSWORD est requis dans server/.env.");
}

async function connectAsRoot() {
  try {
    return await mysql.createConnection({
      host,
      port,
      user: rootUser,
      password: rootPassword,
      multipleStatements: true,
    });
  } catch (error) {
    if (error.code !== "ER_ACCESS_DENIED_ERROR" || rootPassword === "") {
      throw error;
    }
    console.log("[db:init] Mot de passe root vide détecté, connexion initiale…");
    return mysql.createConnection({ host, port, user: rootUser, password: "", multipleStatements: true });
  }
}

async function main() {
  const admin = await connectAsRoot();

  // Première initialisation : le compte root est sans mot de passe.
  if (rootPassword) {
    const [[account]] = await admin.query(
      "SELECT plugin FROM mysql.user WHERE user = ? AND host = 'localhost' LIMIT 1",
      [rootUser]
    );
    if (!account) {
      throw new Error(`Le compte MySQL '${rootUser}'@'localhost' est introuvable.`);
    }
    const [authRows] = await admin.query(
      "SELECT COUNT(*) AS total FROM mysql.user WHERE user = ? AND host = 'localhost' AND (authentication_string = '' OR authentication_string IS NULL)",
      [rootUser]
    );
    if (authRows[0].total > 0) {
      await admin.query(`ALTER USER '${rootUser}'@'localhost' IDENTIFIED BY ${mysql.escape(rootPassword)}`);
      console.log("[db:init] Mot de passe root défini.");
    }
  }

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  for (const accountHost of ["localhost", "127.0.0.1"]) {
    await admin.query(
      `CREATE USER IF NOT EXISTS ${mysql.escape(appUser)}@${mysql.escape(accountHost)} IDENTIFIED BY ${mysql.escape(appPassword)}`
    );
    await admin.query(
      `ALTER USER ${mysql.escape(appUser)}@${mysql.escape(accountHost)} IDENTIFIED BY ${mysql.escape(appPassword)}`
    );
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${dbName}\`.* TO ${mysql.escape(appUser)}@${mysql.escape(accountHost)}`
    );
  }

  const schema = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await admin.query(schema);
  await admin.query("FLUSH PRIVILEGES");
  await admin.end();

  console.log(`[db:init] Base '${dbName}' prête.`);
  console.log(`[db:init] Utilisateur applicatif : '${appUser}' (localhost + 127.0.0.1)`);
}

main().catch((error) => {
  console.error("[db:init] Échec :", error.message);
  process.exit(1);
});

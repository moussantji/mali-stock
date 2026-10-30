const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir server/.env.example)`);
  }
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET doit contenir au moins 32 caractères.");
}

const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  corsOrigins:
    !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === "*"
      ? true
      : process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    issuer: "mali-stock-api",
    audience: "mali-stock-app",
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  googleClientIds,
  mailer: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Mali Stock <no-reply@malistock.ml>",
    // En dev uniquement : expose le code dans la réponse API quand SMTP est absent.
    devExposeCodes:
      (process.env.NODE_ENV || "development") !== "production" &&
      (process.env.DEV_EXPOSE_CODES || "1") !== "0",
  },
  totp: {
    // Clé AES-256 (64 caractères hexadécimaux) pour chiffrer les secrets au repos.
    key: /^[0-9a-fA-F]{64}$/.test(process.env.TOTP_KEY || "") ? process.env.TOTP_KEY : null,
  },
};

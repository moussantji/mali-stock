const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const config = require("./config");
const pool = require("./db");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const productRoutes = require("./routes/products");
const publicRoutes = require("./routes/public");
const orderRoutes = require("./routes/orders");
const asyncHandler = require("./middleware/async-handler");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "32kb" }));

app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "mali-stock-api", time: new Date().toISOString() });
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/orders", orderRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route introuvable." });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  console.error(`[API] ${req.method} ${req.originalUrl} —`, error);
  return res.status(500).json({ message: "Erreur interne du serveur." });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[API] Mali Stock écoute sur http://${config.host}:${config.port}`);
  if (config.googleClientIds.length === 0) {
    console.warn("[API] Google OAuth non configuré (GOOGLE_CLIENT_IDS vide).");
  }
});

async function shutdown(signal) {
  console.log(`[API] Arrêt (${signal})…`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = app;

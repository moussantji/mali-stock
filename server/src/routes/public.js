/**
 * Fiche produit publique — le cœur du réseau.
 * Un client scanne le QR d'un produit dans n'importe quelle boutique
 * et obtient : le vendeur public, le produit, le prix, la disponibilité.
 * Le QR interne (qr_token, unique au monde) identifie vendeur + produit.
 * Le stock exact n'est jamais exposé : le vendeur confirme à la commande.
 */
const express = require("express");
const pool = require("../db");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth } = require("../middleware/auth");
const { toNumber, normalizeQrToken, cleanString } = require("./products-shared");

const router = express.Router();
router.use(requireAuth);

function initialsOf(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "MS"
  );
}

/* Fiche publique du vendeur — jamais d'email ni de données privées. */
function publicVendor(row) {
  return {
    id: String(row.id),
    shopName: row.shop_name || `${row.owner_name}`,
    category: row.shop_category || null,
    city: row.shop_city || null,
    bio: row.shop_bio || null,
    ownerName: row.owner_name,
    initials: initialsOf(row.shop_name || row.owner_name),
  };
}

function publicProductCard(row) {
  const quantity = toNumber(row.quantity);
  return {
    name: row.name,
    unit: row.unit,
    category: row.category || null,
    price: toNumber(row.sale_price),
    available: quantity > 0,
    /* Statut public : le client commande, le vendeur confirme la quantité. */
    status: quantity > 0 ? "available" : "out",
  };
}

/* ── Fiche par QR interne (MALISTOCK:MSXXXXXXXX) ─────────── */router.get(
  "/products/:qrToken",
  asyncHandler(async (req, res) => {
    const token = normalizeQrToken(req.params.qrToken);

    if (!/^MS[A-Z2-9]{8}$/.test(token)) {
      return res.status(400).json({ code: "INVALID_CODE", message: "Ce QR n'est pas une étiquette Mali Stock." });
    }

    const [rows] = await pool.execute(
      `SELECT p.*, u.account_type, u.shop_name, u.shop_category, u.shop_city, u.shop_bio, u.name AS owner_name
       FROM products p JOIN users u ON u.id = p.user_id
       WHERE p.qr_token = ? LIMIT 1`,
      [token]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Produit inconnu. Vérifie l'étiquette." });
    }

    /* Le vendeur qui scanne son propre produit → l'app ouvre ses outils internes. */
    if (String(row.user_id) === req.user.id) {
      return res.json({ self: true, product: null });
    }

    return res.json({
      self: false,
      vendor: publicVendor(row),
      product: publicProductCard(row),
    });
  })
);

/* ── Annuaire des boutiques ──────────────────────────────── */

/** Échappe les jokers LIKE saisis par l'utilisateur. */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

router.get(
  "/shops",
  asyncHandler(async (req, res) => {
    const search = cleanString(req.query.search).slice(0, 60);
    const city = cleanString(req.query.city).slice(0, 60);
    const category = cleanString(req.query.category).slice(0, 60);

    const filters = [
      "u.account_type = 'pro'",
      "u.email_verified = 1",
      "u.shop_name IS NOT NULL",
      "u.shop_name <> ''",
    ];
    const params = [];

    if (search) {
      filters.push("(u.shop_name LIKE ? OR u.shop_city LIKE ? OR u.shop_category LIKE ?)");
      const pattern = `%${escapeLike(search)}%`;
      params.push(pattern, pattern, pattern);
    }
    if (city) {
      filters.push("u.shop_city = ?");
      params.push(city);
    }
    if (category) {
      filters.push("u.shop_category = ?");
      params.push(category);
    }

    const [rows] = await pool.execute(
      `SELECT u.id, u.shop_name, u.shop_category, u.shop_city, u.shop_bio,
              u.name AS owner_name,
              COUNT(p.id) AS product_count,
              SUM(CASE WHEN p.quantity > 0 THEN 1 ELSE 0 END) AS available_count,
              MIN(CASE WHEN p.quantity > 0 THEN p.sale_price END) AS min_price
       FROM users u
       LEFT JOIN products p ON p.user_id = u.id
       WHERE ${filters.join(" AND ")}
       GROUP BY u.id
       HAVING COUNT(p.id) > 0
       ORDER BY available_count DESC, product_count DESC, u.shop_name ASC
       LIMIT 100`,
      params
    );

    const shops = rows.map((row) => ({
      ...publicVendor(row),
      productCount: toNumber(row.product_count),
      availableCount: toNumber(row.available_count),
      minPrice: row.min_price === null ? null : toNumber(row.min_price),
    }));

    return res.json({ shops });
  })
);

/* ── Fiche boutique + catalogue public ───────────────────── */
router.get(
  "/shops/:shopId",
  asyncHandler(async (req, res) => {
    const shopId = Number.parseInt(req.params.shopId, 10);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ code: "INVALID_SHOP", message: "Boutique invalide." });
    }

    const [shops] = await pool.execute(
      `SELECT u.id, u.shop_name, u.shop_category, u.shop_city, u.shop_bio,
              u.name AS owner_name, u.created_at
       FROM users u
       WHERE u.id = ? AND u.account_type = 'pro' AND u.email_verified = 1
             AND u.shop_name IS NOT NULL AND u.shop_name <> ''
       LIMIT 1`,
      [shopId]
    );
    const shop = shops[0];
    if (!shop) {
      return res.status(404).json({ code: "SHOP_NOT_FOUND", message: "Boutique introuvable." });
    }

    const [products] = await pool.execute(
      `SELECT id, name, description, category, unit, sale_price, quantity
       FROM products
       WHERE user_id = ?
       ORDER BY (quantity > 0) DESC, name ASC`,
      [shopId]
    );

    const cards = products.map((row) => {
      const available = toNumber(row.quantity) > 0;
      return {
        id: String(row.id),
        name: row.name,
        description: row.description || null,
        category: row.category || null,
        unit: row.unit,
        price: toNumber(row.sale_price),
        available,
        status: available ? "available" : "out",
      };
    });

    return res.json({
      shop: {
        ...publicVendor(shop),
        since: shop.created_at,
        productCount: cards.length,
        availableCount: cards.filter((card) => card.available).length,
      },
      products: cards,
    });
  })
);

module.exports = router;

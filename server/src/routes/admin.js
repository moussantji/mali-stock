const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { passwordError } = require("../services/password");

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function adminUser(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    accountType: row.account_type || "pro",
    isAdmin: Boolean(row.is_admin),
    emailVerified: Boolean(row.email_verified),
    shopName: row.shop_name || null,
    shopCategory: row.shop_category || null,
    shopCity: row.shop_city || null,
    createdAt: row.created_at,
  };
}

router.use(requireAuth, requireAdmin);

/* ── Liste des comptes ─────────────────────────────────────── */
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, name, email, account_type, is_admin, shop_name, shop_category, shop_city,
              email_verified, created_at
       FROM users
       ORDER BY created_at DESC, id DESC
       LIMIT 200`
    );
    return res.json({ users: rows.map(adminUser) });
  })
);

/* ── Création d'un compte vendeur ──────────────────────────── */
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const role = cleanString(req.body?.role) || "seller";
    const name = cleanString(req.body?.name).replace(/\s+/g, " ");
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const shopName = cleanString(req.body?.shopName);
    const shopCategory = cleanString(req.body?.shopCategory);
    const shopCity = cleanString(req.body?.shopCity);

    if (role !== "seller") {
      return res.status(400).json({ message: "Seuls les comptes vendeurs peuvent être créés." });
    }
    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ message: "Le nom doit contenir entre 2 et 120 caractères." });
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 190) {
      return res.status(400).json({ message: "Adresse email invalide." });
    }
    if (shopName.length < 2 || shopName.length > 120) {
      return res.status(400).json({ message: "Indique le nom de la boutique (2 à 120 caractères)." });
    }
    if (shopCategory.length > 60 || shopCity.length > 80) {
      return res.status(400).json({ message: "Catégorie ou ville trop longue." });
    }

    const invalidPassword = passwordError(password, { name, email });
    if (invalidPassword) {
      return res.status(400).json({ message: invalidPassword });
    }

    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "Un compte existe déjà avec cet email." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const [result] = await pool.execute(
        `INSERT INTO users
           (name, email, password_hash, account_type, is_admin, shop_name, shop_category, shop_city, email_verified)
         VALUES (?, ?, ?, 'pro', 0, ?, ?, ?, 1)`,
        [name, email, passwordHash, shopName, shopCategory || null, shopCity || null]
      );

      const [rows] = await pool.execute(
        `SELECT id, name, email, account_type, is_admin, shop_name, shop_category, shop_city,
                email_verified, created_at
         FROM users WHERE id = ? LIMIT 1`,
        [result.insertId]
      );

      return res.status(201).json({ user: adminUser(rows[0]) });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Un compte existe déjà avec cet email." });
      }
      throw error;
    }
  })
);

/* ── Boutiques : liste, détail et mise à jour ──────────────── */

function adminShop(row) {
  return {
    id: String(row.id),
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    shopName: row.shop_name,
    category: row.shop_category || null,
    city: row.shop_city || null,
    bio: row.shop_bio || null,
    productCount: toNumber(row.product_count),
    totalUnits: toNumber(row.total_units),
    stockValue: toNumber(row.stock_value),
    outCount: toNumber(row.out_count),
    lowCount: toNumber(row.low_count),
    createdAt: row.created_at,
  };
}

const SHOP_SELECT = `
  SELECT u.id, u.name AS owner_name, u.email AS owner_email,
         u.shop_name, u.shop_category, u.shop_city, u.shop_bio, u.created_at,
         COUNT(p.id) AS product_count,
         COALESCE(SUM(p.quantity), 0) AS total_units,
         COALESCE(SUM(p.quantity * p.sale_price), 0) AS stock_value,
         SUM(CASE WHEN p.quantity = 0 THEN 1 ELSE 0 END) AS out_count,
         SUM(CASE WHEN p.quantity > 0 AND p.quantity <= p.min_quantity THEN 1 ELSE 0 END) AS low_count
  FROM users u
  LEFT JOIN products p ON p.user_id = u.id
  WHERE u.account_type = 'pro' AND u.is_admin = 0
`;

router.get(
  "/shops",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `${SHOP_SELECT}
       GROUP BY u.id
       ORDER BY (u.shop_name IS NULL OR u.shop_name = ''), u.shop_name ASC, u.name ASC
       LIMIT 200`
    );
    return res.json({ shops: rows.map(adminShop) });
  })
);

router.get(
  "/shops/:id",
  asyncHandler(async (req, res) => {
    const shopId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ message: "Boutique invalide." });
    }

    const [rows] = await pool.execute(
      `${SHOP_SELECT} AND u.id = ? GROUP BY u.id LIMIT 1`,
      [shopId]
    );
    const shop = rows[0];
    if (!shop) {
      return res.status(404).json({ message: "Boutique introuvable." });
    }

    const [products] = await pool.execute(
      `SELECT id, sku, name, description, category, unit, purchase_price, sale_price,
              quantity, min_quantity, created_at
       FROM products
       WHERE user_id = ?
       ORDER BY (quantity > 0) DESC, name ASC`,
      [shopId]
    );

    return res.json({
      shop: adminShop(shop),
      products: products.map((row) => {
        const quantity = toNumber(row.quantity);
        const minQuantity = toNumber(row.min_quantity);
        return {
          id: String(row.id),
          sku: row.sku,
          name: row.name,
          description: row.description || null,
          category: row.category || null,
          unit: row.unit,
          purchasePrice: toNumber(row.purchase_price),
          salePrice: toNumber(row.sale_price),
          quantity,
          minQuantity,
          status: quantity <= 0 ? "out" : quantity <= minQuantity ? "low" : "ok",
          createdAt: row.created_at,
        };
      }),
    });
  })
);

router.patch(
  "/shops/:id",
  asyncHandler(async (req, res) => {
    const shopId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ message: "Boutique invalide." });
    }

    const shopName = cleanString(req.body?.shopName);
    const shopCategory = cleanString(req.body?.shopCategory);
    const shopCity = cleanString(req.body?.shopCity);
    const shopBio = cleanString(req.body?.shopBio);

    if (shopName.length < 2 || shopName.length > 120) {
      return res.status(400).json({ message: "Le nom de la boutique doit contenir 2 à 120 caractères." });
    }
    if (shopCategory.length > 60 || shopCity.length > 80) {
      return res.status(400).json({ message: "Catégorie ou ville trop longue." });
    }
    if (shopBio.length > 280) {
      return res.status(400).json({ message: "La description ne doit pas dépasser 280 caractères." });
    }

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE id = ? AND account_type = 'pro' AND is_admin = 0 LIMIT 1",
      [shopId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: "Boutique introuvable." });
    }

    await pool.execute(
      `UPDATE users
       SET shop_name = ?, shop_category = ?, shop_city = ?, shop_bio = ?
       WHERE id = ?`,
      [shopName, shopCategory || null, shopCity || null, shopBio || null, shopId]
    );

    const [rows] = await pool.execute(
      `${SHOP_SELECT} AND u.id = ? GROUP BY u.id LIMIT 1`,
      [shopId]
    );
    return res.json({ shop: adminShop(rows[0]) });
  })
);

module.exports = router;

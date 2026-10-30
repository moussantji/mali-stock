/**
 * Commandes comptoir — gestion vendeur.
 *  - Le vendeur crée une commande sans compte client (client comptoir facultatif).
 *  - Il confirme/ajuste/refuse, encaisse (Espèces, Orange Money, Moov, Wave)
 *    et la sortie de stock est journalisée automatiquement.
 *  - L'ancienne route client reste disponible pour les commandes historiques,
 *    mais l'application mobile ne propose plus d'espace acheteur.
 */
const express = require("express");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { toNumber, cleanString, normalizeQrToken } = require("./products-shared");

const router = express.Router();
router.use(requireAuth);

/* Anti-spam : 30 commandes / 15 min par IP. */
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de commandes d'affilée. Réessaie dans quelques minutes." },
});

const PAYMENT_METHODS = ["cash", "orange_money", "moov", "wave"];
const QR_PATTERN = /^MS[A-Z2-9]{8}$/;

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

/** Fiche publique d'une personne (client pour le vendeur, vendeur pour le client). */
function publicCounterpart(row) {
  return {
    id: row.id ? String(row.id) : null,
    name: row.name || "Client comptoir",
    initials: initialsOf(row.shop_name || row.name),
    accountType: row.account_type || null,
    phone: row.phone || null,
    shopName: row.shop_name || null,
    category: row.shop_category || null,
    city: row.shop_city || null,
  };
}

function publicOrder(row, { vendorInfo, clientInfo, product }) {
  const quantity = toNumber(row.quantity);
  const confirmedQuantity = row.confirmed_quantity === null ? null : toNumber(row.confirmed_quantity);
  return {
    id: String(row.id),
    /* Selon le côté : le client voit sa commande côté vendeur, et inversement. */
    ...(vendorInfo ? { vendor: vendorInfo } : {}),
    ...(clientInfo ? { client: clientInfo } : {}),
    product: {
      id: String(row.product_id),
      name: product?.name ?? row.product_name ?? null,
      sku: product?.sku ?? row.product_sku ?? null,
      unit: product?.unit ?? row.product_unit ?? null,
      shopName: product?.shop_name ?? null,
    },
    quantity,
    confirmedQuantity,
    unitPrice: toNumber(row.unit_price),
    total: toNumber(row.total),
    status: row.status,
    paymentMethod: row.payment_method || null,
    paymentReference: row.payment_reference || null,
    note: row.note || null,
    vendorNote: row.vendor_note || null,
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
  };
}

const ORDER_SELECT = `
  SELECT o.*,
         p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit,
         u_vendor.account_type AS vendor_account_type, u_vendor.shop_name AS vendor_shop_name,
         u_vendor.name AS vendor_name, u_vendor.shop_category AS vendor_shop_category,
         u_vendor.shop_city AS vendor_shop_city,
         u_client.account_type AS client_account_type, u_client.name AS client_name
  FROM orders o
  JOIN products p ON p.id = o.product_id
  JOIN users u_vendor ON u_vendor.id = o.vendor_id
  LEFT JOIN users u_client ON u_client.id = o.user_id`;

function mapJoinedOrder(row, viewer) {
  const vendorInfo = publicCounterpart({
    id: row.vendor_id,
    name: row.vendor_name,
    account_type: "pro",
    shop_name: row.vendor_shop_name,
    shop_category: row.vendor_shop_category,
    shop_city: row.vendor_shop_city,
  });
  const clientInfo = publicCounterpart({
    id: row.user_id,
    name: row.customer_name || row.client_name,
    account_type: row.customer_name ? null : row.client_account_type,
    phone: row.customer_phone,
  });
  const base = {
    product_name: row.product_name,
    product_sku: row.product_sku,
    product_unit: row.product_unit,
  };
  if (viewer === "pro") {
    /* Le vendeur voit le client ; pas besoin de se re-décrire. */
    return publicOrder(row, { clientInfo, product: base });
  }
  return publicOrder(row, { vendorInfo, product: base });
}

/* ── Client : crée une commande après un scan ─────────────── */
router.post(
  "/",
  orderLimiter,
  requireRole("standard"),
  asyncHandler(async (req, res) => {
    const qrToken = normalizeQrToken(req.body?.qrToken);
    const quantity = toNumber(req.body?.quantity, NaN);
    const note = cleanString(req.body?.note).slice(0, 255) || null;

    if (!QR_PATTERN.test(qrToken)) {
      return res.status(400).json({ code: "INVALID_CODE", message: "Scanne le QR Mali Stock du produit." });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) {
      return res.status(400).json({ message: "Indique une quantité valide." });
    }

    const [rows] = await pool.execute(
      `SELECT p.*, u.account_type FROM products p JOIN users u ON u.id = p.user_id WHERE p.qr_token = ? LIMIT 1`,
      [qrToken]
    );
    const product = rows[0];
    if (!product) {
      return res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Produit inconnu. Vérifie l'étiquette." });
    }
    if (toNumber(product.quantity) <= 0) {
      return res.status(409).json({ code: "OUT_OF_STOCK", message: "Produit en rupture : préviens le vendeur." });
    }

    const unitPrice = toNumber(product.sale_price);
    const total = Math.round(quantity * unitPrice * 100) / 100;

    const [result] = await pool.execute(
      `INSERT INTO orders (user_id, vendor_id, product_id, quantity, unit_price, total, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, product.user_id, product.id, quantity, unitPrice, total, note]
    );

    const [created] = await pool.execute(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [result.insertId]);
    return res.status(201).json({ order: mapJoinedOrder(created[0], "standard") });
  })
);

/* ── Vendeur : crée une commande sans compte client ───────── */
router.post(
  "/manual",
  orderLimiter,
  requireRole("pro"),
  asyncHandler(async (req, res) => {
    const productId = Number.parseInt(req.body?.productId, 10);
    const quantity = toNumber(req.body?.quantity, NaN);
    const customerName = cleanString(req.body?.customerName).replace(/\s+/g, " ").slice(0, 120);
    const customerPhone = cleanString(req.body?.customerPhone).slice(0, 40);
    const note = cleanString(req.body?.note).slice(0, 255) || null;

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "Choisis un produit." });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) {
      return res.status(400).json({ message: "Indique une quantité valide." });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM products WHERE id = ? AND user_id = ? LIMIT 1",
      [productId, req.user.id]
    );
    const product = rows[0];
    if (!product) {
      return res.status(404).json({ message: "Produit introuvable dans ton stock." });
    }
    if (toNumber(product.quantity) < quantity) {
      return res.status(409).json({
        code: "INSUFFICIENT_STOCK",
        message: `Stock insuffisant : ${toNumber(product.quantity)} ${product.unit} disponibles.`,
      });
    }

    const unitPrice = toNumber(product.sale_price);
    const total = Math.round(quantity * unitPrice * 100) / 100;

    const [result] = await pool.execute(
      `INSERT INTO orders
         (user_id, vendor_id, product_id, customer_name, customer_phone, quantity,
          unit_price, total, note)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        product.id,
        customerName || null,
        customerPhone || null,
        quantity,
        unitPrice,
        total,
        note,
      ]
    );

    const [created] = await pool.execute(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [result.insertId]);
    return res.status(201).json({ order: mapJoinedOrder(created[0], "pro") });
  })
);

/* ── Boîte de réception (rôle-aware) ──────────────────────── */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const isVendor = req.userRow.account_type === "pro";
    const column = isVendor ? "o.vendor_id" : "o.user_id";
    const select = ORDER_SELECT.replace(
      "o.*",
      "o.*, CASE o.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END AS priority"
    );
    const [list] = await pool.execute(
      `${select} WHERE ${column} = ?
       ORDER BY priority ASC, o.created_at DESC
       LIMIT 120`,
      [req.user.id]
    );
    return res.json({
      role: isVendor ? "pro" : "standard",
      orders: list.map((row) => mapJoinedOrder(row, isVendor ? "pro" : "standard")),
    });
  })
);

/* ── Actions sur une commande ─────────────────────────────── */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const action = cleanString(req.body?.action);
    const vendorNote = cleanString(req.body?.vendorNote).slice(0, 255) || null;
    const paymentMethod = cleanString(req.body?.paymentMethod);
    const paymentReference = cleanString(req.body?.paymentReference).slice(0, 80) || null;
    const confirmedQuantity =
      typeof req.body?.confirmedQuantity !== "undefined" ? toNumber(req.body.confirmedQuantity, NaN) : null;

    if (!["confirm", "decline", "complete", "cancel"].includes(action)) {
      return res.status(400).json({ message: "Action invalide." });
    }

    const [rows] = await pool.execute(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Commande introuvable." });

    const isVendorOwner = req.userRow.account_type === "pro" && String(order.vendor_id) === req.user.id;
    const isClientOwner = req.userRow.account_type === "standard" && String(order.user_id) === req.user.id;

    if (action === "cancel") {
      /* Le client annule une commande encore en attente. */
      if (!isClientOwner) {
        return res.status(String(order.vendor_id) === req.user.id ? 400 : 403).json({
          message: isVendorOwner ? "Le vendeur doit refuser la commande, pas l'annuler." : "Ce n'est pas ta commande.",
        });
      }
      if (order.status !== "pending") {
        return res.status(409).json({ message: "Cette commande n'est plus modifiable." });
      }
      await pool.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
      const [fresh] = await pool.execute(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [order.id]);
      return res.json({ order: mapJoinedOrder(fresh[0], "standard") });
    }

    /* Les trois autres actions appartiennent au vendeur. */
    if (!isVendorOwner) {
      return res.status(isClientOwner ? 403 : 404).json({
        message: isClientOwner
          ? "Seul le vendeur peut traiter la commande."
          : "Commande introuvable.",
      });
    }

    if (action === "confirm") {
      if (order.status !== "pending") {
        return res.status(409).json({ message: "Commande déjà traitée." });
      }
      if (confirmedQuantity !== null && (!Number.isFinite(confirmedQuantity) || confirmedQuantity <= 0)) {
        return res.status(400).json({ message: "Quantité ajustée invalide." });
      }
      const qty = confirmedQuantity !== null ? confirmedQuantity : toNumber(order.quantity);
      const [stock] = await pool.execute("SELECT quantity FROM products WHERE id = ? LIMIT 1", [order.product_id]);
      if (toNumber(stock[0]?.quantity) < qty) {
        return res.status(409).json({
          code: "INSUFFICIENT_STOCK",
          message: `Stock insuffisant : ${toNumber(stock[0]?.quantity)} ${order.product_unit} disponibles.`,
        });
      }
      const adjustedTotal = Math.round(qty * toNumber(order.unit_price) * 100) / 100;
      await pool.execute(
        "UPDATE orders SET status = 'confirmed', confirmed_quantity = ?, total = ?, vendor_note = ? WHERE id = ?",
        [qty, adjustedTotal, vendorNote, order.id]
      );
    } else if (action === "decline") {
      if (order.status !== "pending") {
        return res.status(409).json({ message: "Commande déjà traitée." });
      }
      await pool.execute(
        "UPDATE orders SET status = 'declined', vendor_note = ? WHERE id = ?",
        [vendorNote, order.id]
      );
    } else if (action === "complete") {
      if (!["pending", "confirmed"].includes(order.status)) {
        return res.status(409).json({ message: "Commande déjà clôturée." });
      }
      if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ message: "Choisis le mode de paiement (espèces ou mobile money)." });
      }

      const qty = confirmedQuantity !== null ? confirmedQuantity : toNumber(order.confirmed_quantity ?? order.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: "Quantité invalide." });
      }

      /* Encaissement = sortie de stock transactionnelle. */
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [productRows] = await conn.execute(
          "SELECT * FROM products WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
          [order.product_id, req.user.id]
        );
        const product = productRows[0];
        if (!product) {
          await conn.rollback();
          return res.status(404).json({ message: "Produit introuvable." });
        }
        const currentStock = toNumber(product.quantity);
        if (currentStock < qty) {
          await conn.rollback();
          return res.status(409).json({
            code: "INSUFFICIENT_STOCK",
            message: `Stock insuffisant : ${currentStock} ${product.unit} disponibles pour ${qty} demandés.`,
          });
        }

        const newStock = Math.round((currentStock - qty) * 100) / 100;
        const finalTotal = Math.round(qty * toNumber(order.unit_price) * 100) / 100;
        await conn.execute("UPDATE products SET quantity = ? WHERE id = ?", [newStock, product.id]);
        await conn.execute(
          "INSERT INTO stock_movements (user_id, product_id, type, quantity, unit_price, note) VALUES (?, ?, 'exit', ?, ?, ?)",
          [req.user.id, product.id, -qty, order.unit_price, `Commande #${order.id}${order.note ? ` · ${order.note}` : ""}`]
        );
        await conn.execute(
          "UPDATE orders SET status = 'completed', confirmed_quantity = ?, total = ?, payment_method = ?, payment_reference = ?, vendor_note = COALESCE(?, vendor_note), completed_at = NOW() WHERE id = ?",
          [qty, finalTotal, paymentMethod, paymentMethod === "cash" ? null : paymentReference, vendorNote, order.id]
        );

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }

    const [fresh] = await pool.execute(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [order.id]);
    return res.json({ order: mapJoinedOrder(fresh[0], "pro") });
  })
);

module.exports = router;

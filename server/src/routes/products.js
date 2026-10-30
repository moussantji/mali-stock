/**
 * API de gestion de stock — produits et mouvements.
 * Tout est cloisonné par utilisateur (user_id). Les opérations de quantité
 * sont transactionnelles (SELECT ... FOR UPDATE) pour éviter les écrasements.
 */
const express = require("express");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const pool = require("../db");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth, requireRole } = require("../middleware/auth");
const { toNumber, cleanString } = require("./products-shared");

const router = express.Router();
/* Tout le module produits est réservé aux vendeurs (comptes pro). */
router.use(requireAuth, requireRole("pro"));

/* Chiffres/lettres sans ambiguïté pour les codes imprimés (pas de 0/O, 1/I/L). */
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const QR_PREFIX = "MALISTOCK";

function randomToken(length) {
  let token = "";
  for (let i = 0; i < length; i += 1) {
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return token;
}

function initialsOf(name) {
  const parts = cleanString(name)
    .split(/\s+/)
    .filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "MS"
  );
}

function publicProduct(row) {
  const quantity = toNumber(row.quantity);
  const min = toNumber(row.min_quantity);
  const capacity = Math.max(min * 2, quantity, 1);
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
    minQuantity: min,
    barcode: row.barcode || null,
    qrToken: row.qr_token,
    initials: initialsOf(row.name),
    level: Math.round(Math.min(100, (quantity / capacity) * 100)),
    status: quantity <= 0 ? "out" : quantity <= min ? "low" : "ok",
    createdAt: row.created_at,
  };
}

async function findProduct(userId, id) {
  const [rows] = await pool.execute(
    "SELECT * FROM products WHERE id = ? AND user_id = ? LIMIT 1",
    [id, userId]
  );
  return rows[0] || null;
}

function validateProductInput(body, { partial = false } = {}) {
  const data = {};

  const name = cleanString(body?.name).replace(/\s+/g, " ");
  if (!partial || name !== "") {
    if (name.length < 2 || name.length > 160) {
      return { error: "Le nom du produit doit contenir entre 2 et 160 caractères." };
    }
    data.name = name;
  }

  if (typeof body?.sku !== "undefined") {
    const sku = cleanString(body.sku).toUpperCase();
    if (sku !== "") {
      if (sku.length > 40 || !/^[A-Z0-9][A-Z0-9\-_.]*$/.test(sku)) {
        return { error: "Code produit invalide (lettres, chiffres, - _ . uniquement)." };
      }
      data.sku = sku;
    }
  }

  if (typeof body?.category !== "undefined") {
    const category = cleanString(body.category);
    if (category.length > 60) return { error: "Catégorie trop longue (60 caractères max)." };
    data.category = category || null;
  }

  if (typeof body?.description !== "undefined") {
    const description = cleanString(body.description);
    if (description.length > 500) return { error: "Description trop longue (500 caractères max)." };
    data.description = description || null;
  }

  if (typeof body?.unit !== "undefined") {
    const unit = cleanString(body.unit).slice(0, 24);
    if (unit === "") return { error: "Indique l'unité (rouleau, balle, litre…)." };
    data.unit = unit;
  }

  for (const [key, label, max] of [
    ["purchasePrice", "Prix d'achat", 1e9],
    ["salePrice", "Prix de vente", 1e9],
    ["quantity", "Quantité", 1e9],
    ["minQuantity", "Seuil d'alerte", 1e9],
  ]) {
    if (typeof body?.[key] !== "undefined") {
      const n = toNumber(body[key], NaN);
      if (!Number.isFinite(n) || n < 0 || n > max) {
        return { error: `${label} invalide.` };
      }
      data[key] = n;
    }
  }

  if (typeof body?.barcode !== "undefined") {
    const barcode = cleanString(body.barcode).replace(/\s+/g, "");
    if (barcode !== "" && (barcode.length > 64 || !/^[A-Za-z0-9\-_]+$/.test(barcode))) {
      return { error: "Code-barres invalide." };
    }
    data.barcode = barcode || null;
  }

  return { data };
}

/* ── Liste ─────────────────────────────────────────────────── */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      "SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({ products: rows.map(publicProduct) });
  })
);

/* ── Résumé (KPI, valeur, alertes, graphique 7 jours) ──────── */
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const [agg] = await pool.execute(
      `SELECT
         COUNT(*) AS totalProducts,
         COALESCE(SUM(quantity), 0) AS totalUnits,
         COALESCE(SUM(quantity * purchase_price), 0) AS stockValue,
         COALESCE(SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END), 0) AS outCount,
         COALESCE(SUM(CASE WHEN quantity > 0 AND quantity <= min_quantity THEN 1 ELSE 0 END), 0) AS lowCount
       FROM products WHERE user_id = ?`,
      [req.user.id]
    );

    const [today] = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity ELSE 0 END), 0) AS entriesToday,
         COALESCE(SUM(CASE WHEN type = 'exit' THEN ABS(quantity) ELSE 0 END), 0) AS exitsToday
       FROM stock_movements
       WHERE user_id = ? AND created_at >= CURDATE()`,
      [req.user.id]
    );

    const [week] = await pool.execute(
      `SELECT DATE(created_at) AS day, SUM(ABS(quantity)) AS value
       FROM stock_movements
       WHERE user_id = ? AND created_at >= NOW() - INTERVAL 7 DAY
       GROUP BY DATE(created_at)`,
      [req.user.id]
    );

    const byDay = new Map(week.map((row) => [new Date(row.day).toDateString(), Number(row.value)]));
    const labels = ["L", "M", "M", "J", "V", "S", "D"];
    const now = new Date();
    const weekly = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const jsDay = (date.getDay() + 6) % 7; // lundi = 0
      weekly.push({ day: labels[jsDay], value: byDay.get(date.toDateString()) ?? 0 });
    }

    const netThisMonth = await pool.execute(
      `SELECT COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity WHEN type = 'exit' THEN -ABS(quantity) ELSE quantity END), 0) AS net
       FROM stock_movements WHERE user_id = ? AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
      [req.user.id]
    );

    const net = toNumber(netThisMonth[0][0]?.net);
    const trend = net > 0 ? `+${net.toLocaleString("fr-FR")} unités ce mois` : net < 0 ? `${net.toLocaleString("fr-FR")} unités ce mois` : "Stable ce mois";

    const lowCount = toNumber(agg[0].lowCount);
    const outCount = toNumber(agg[0].outCount);

    return res.json({
      totalProducts: toNumber(agg[0].totalProducts),
      totalUnits: toNumber(agg[0].totalUnits),
      stockValue: toNumber(agg[0].stockValue),
      alerts: lowCount + outCount,
      outCount,
      lowCount,
      entriesToday: toNumber(today[0]?.entriesToday),
      exitsToday: toNumber(today[0]?.exitsToday),
      weekly,
      trend,
    });
  })
);

/* ── Recherche par QR interne ou code-barres (scan) ────────── */
router.get(
  "/lookup",
  asyncHandler(async (req, res) => {
    const given = cleanString(req.query.code).toUpperCase();

    /* Payload QR interne « MALISTOCK:MSXXXXXXXX » → on garde le token. */
    let normalized = given;
    if (normalized.startsWith(`${QR_PREFIX}:`)) {
      normalized = normalized.slice(QR_PREFIX.length + 1);
    } else if (normalized.startsWith(QR_PREFIX)) {
      normalized = normalized.slice(QR_PREFIX.length);
    }
    const raw = normalized.replace(/[^A-Z0-9]/g, "");
    const barcode = cleanString(req.query.code);

    if (raw.length < 4) {
      return res.status(400).json({ message: "Code illisible. Réessaie le scan." });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM products WHERE user_id = ? AND (qr_token = ? OR barcode = ?) LIMIT 1",
      [req.user.id, raw, barcode]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Produit inconnu pour ce code." });
    }
    return res.json({ product: publicProduct(row) });
  })
);

/* ── Création ──────────────────────────────────────────────── */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const validation = validateProductInput(req.body);
    if (validation.error) return res.status(400).json({ message: validation.error });
    const data = validation.data;

    if (!data.name) return res.status(400).json({ message: "Le nom du produit est obligatoire." });
    if (!data.unit) data.unit = "unité";
    if (typeof data.quantity === "undefined") data.quantity = 0;
    if (typeof data.minQuantity === "undefined") data.minQuantity = 0;
    if (typeof data.purchasePrice === "undefined") data.purchasePrice = 0;
    if (typeof data.salePrice === "undefined") data.salePrice = 0;

    let sku = data.sku;
    if (!sku) {
      sku = `MALI-${randomToken(4)}`;
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO products
           (user_id, sku, name, description, category, unit, purchase_price, sale_price, quantity, min_quantity, barcode, qr_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          sku,
          data.name,
          data.description ?? null,
          data.category ?? null,
          data.unit,
          data.purchasePrice,
          data.salePrice,
          data.quantity,
          data.minQuantity,
          data.barcode ?? null,
          `MS${randomToken(8)}`,
        ]
      );

      /* Quantité initiale != 0 → mouvement d'entrée journalisé. */
      if (data.quantity > 0) {
        await pool.execute(
          "INSERT INTO stock_movements (user_id, product_id, type, quantity, note) VALUES (?, ?, 'entry', ?, 'Stock initial')",
          [req.user.id, result.insertId, data.quantity]
        );
      }

      const [rows] = await pool.execute("SELECT * FROM products WHERE id = ? LIMIT 1", [result.insertId]);
      return res.status(201).json({ product: publicProduct(rows[0]) });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: `Le code « ${sku} » est déjà utilisé.` });
      }
      throw error;
    }
  })
);

/* ── Modification ──────────────────────────────────────────── */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await findProduct(req.user.id, req.params.id);
    if (!product) return res.status(404).json({ message: "Produit introuvable." });

    const validation = validateProductInput(req.body, { partial: true });
    if (validation.error) return res.status(400).json({ message: validation.error });
    const data = validation.data;

    const fields = Object.keys(data);
    if (fields.length === 0) {
      return res.json({ product: publicProduct(product) });
    }

    const assignments = fields
      .map((field) => `${field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)} = ?`)
      .join(", ");
    const values = fields.map((field) => data[field]);

    try {
      await pool.execute(`UPDATE products SET ${assignments} WHERE id = ? AND user_id = ?`, [
        ...values,
        product.id,
        req.user.id,
      ]);
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Ce code produit est déjà utilisé." });
      }
      throw error;
    }

    const [rows] = await pool.execute("SELECT * FROM products WHERE id = ? LIMIT 1", [product.id]);
    return res.json({ product: publicProduct(rows[0]) });
  })
);

/* ── Suppression ───────────────────────────────────────────── */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const [result] = await pool.execute("DELETE FROM products WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.user.id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Produit introuvable." });
    }
    return res.status(204).end();
  })
);

/* ── Mouvement de stock (entrée / sortie / ajustement) ─────── */
router.post(
  "/:id/movements",
  asyncHandler(async (req, res) => {
    const type = cleanString(req.body?.type);
    const note = cleanString(req.body?.note).slice(0, 255) || null;
    const unitPrice = typeof req.body?.unitPrice !== "undefined" ? toNumber(req.body.unitPrice) : null;
    let quantity = toNumber(req.body?.quantity, NaN);

    if (!["entry", "exit", "adjustment"].includes(type)) {
      return res.status(400).json({ message: "Type de mouvement invalide." });
    }
    if (!Number.isFinite(quantity) || quantity === 0) {
      return res.status(400).json({ message: "Indique une quantité non nulle." });
    }
    if (type !== "adjustment" && quantity < 0) {
      return res.status(400).json({ message: "La quantité doit être positive." });
    }
    if (unitPrice !== null && (unitPrice < 0 || unitPrice > 1e9)) {
      return res.status(400).json({ message: "Prix invalide." });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        "SELECT * FROM products WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE",
        [req.params.id, req.user.id]
      );
      const product = rows[0];
      if (!product) {
        await conn.rollback();
        return res.status(404).json({ message: "Produit introuvable." });
      }

      /* En base, le mouvement est signé : entrée +, sortie −. */
      const delta = type === "exit" ? -Math.abs(quantity) : type === "adjustment" ? quantity : quantity;
      const newQuantity = toNumber(Number(product.quantity) + delta);

      if (newQuantity < 0) {
        await conn.rollback();
        return res.status(400).json({
          message: `Quantité insuffisante : ${toNumber(product.quantity)} ${product.unit} en stock.`,
        });
      }

      await conn.execute("UPDATE products SET quantity = ? WHERE id = ?", [newQuantity, product.id]);
      await conn.execute(
        "INSERT INTO stock_movements (user_id, product_id, type, quantity, unit_price, note) VALUES (?, ?, ?, ?, ?, ?)",
        [req.user.id, product.id, type, delta, unitPrice, note]
      );

      await conn.commit();

      const [fresh] = await pool.execute("SELECT * FROM products WHERE id = ? LIMIT 1", [product.id]);
      return res.json({ product: publicProduct(fresh[0]), movement: { type, quantity: delta } });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  })
);

/* ── Historique des mouvements (tous produits) ─────────────── */
router.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT m.*, p.name AS product_name, p.sku AS product_sku, p.unit AS product_unit
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       WHERE m.user_id = ?
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    return res.json({
      movements: rows.map((row) => ({
        id: String(row.id),
        productId: String(row.product_id),
        productName: row.product_name,
        productSku: row.product_sku,
        unit: row.product_unit,
        type: row.type,
        quantity: toNumber(row.quantity),
        unitPrice: row.unit_price === null ? null : toNumber(row.unit_price),
        note: row.note || null,
        createdAt: row.created_at,
      })),
    });
  })
);

/* ── QR code d'un produit ──────────────────────────────────── */
router.get(
  "/:id/qr",
  asyncHandler(async (req, res) => {
    const product = await findProduct(req.user.id, req.params.id);
    if (!product) return res.status(404).json({ message: "Produit introuvable." });

    const qrDataUrl = await QRCode.toDataURL(`${QR_PREFIX}:${product.qr_token}`, {
      margin: 1,
      width: 440,
      color: { dark: "#063D29", light: "#F7F0DD" },
    });
    return res.json({ qrDataUrl, qrToken: product.qr_token });
  })
);

/** Régénère le code interne (étiquette perdue, code compromis). */
router.post(
  "/:id/qr/regenerate",
  asyncHandler(async (req, res) => {
    const product = await findProduct(req.user.id, req.params.id);
    if (!product) return res.status(404).json({ message: "Produit introuvable." });

    const qrToken = `MS${randomToken(8)}`;
    await pool.execute("UPDATE products SET qr_token = ? WHERE id = ? AND user_id = ?", [
      qrToken,
      product.id,
      req.user.id,
    ]);
    const qrDataUrl = await QRCode.toDataURL(`${QR_PREFIX}:${qrToken}`, {
      margin: 1,
      width: 440,
      color: { dark: "#063D29", light: "#F7F0DD" },
    });
    return res.json({ qrDataUrl, qrToken });
  })
);

/* ── Feuille d'étiquettes PDF (impression en lot) ──────────── */
router.get(
  "/labels.pdf",
  asyncHandler(async (req, res) => {
    let products;
    const ids = cleanString(req.query.ids)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const [rows] = await pool.execute(
        `SELECT * FROM products WHERE user_id = ? AND id IN (${placeholders}) ORDER BY name`,
        [req.user.id, ...ids]
      );
      products = rows;
    } else {
      const [rows] = await pool.execute(
        "SELECT * FROM products WHERE user_id = ? ORDER BY name",
        [req.user.id]
      );
      products = rows;
    }

    if (products.length === 0) {
      return res.status(404).json({ message: "Aucun produit à étiqueter." });
    }

    const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="etiquettes-mali-stock.pdf"`
    );
    doc.pipe(res);

    const LABEL_W = 170;
    const LABEL_H = 96;
    const GAP = 12;
    const MARGIN = 40;
    const PER_ROW = 3;
    const QR_SIZE = 62;

    let x = MARGIN;
    let y = MARGIN;

    for (const product of products) {
      if (y + LABEL_H > 842 - MARGIN) {
        doc.addPage();
        x = MARGIN;
        y = MARGIN;
      }

      /* Cadre de l'étiquette */
      doc.roundedRect(x, y, LABEL_W, LABEL_H, 6).lineWidth(0.8).strokeColor("#EAE2CE").stroke();

      /* QR code */
      const png = await QRCode.toBuffer(`${QR_PREFIX}:${product.qr_token}`, { margin: 0, width: 240 });
      doc.image(png, x + 8, y + 10, { width: QR_SIZE, height: QR_SIZE });

      /* Textes */
      const textX = x + QR_SIZE + 16;
      const textW = LABEL_W - QR_SIZE - 24;
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#DFA921")
        .text("MALI STOCK", textX, y + 10, { width: textW });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1B201A").text(
        String(product.name).slice(0, 60),
        textX,
        y + 22,
        { width: textW, height: 26, ellipsis: true }
      );
      doc.font("Helvetica").fontSize(7.5).fillColor("#5B564A").text(
        `${product.sku} · ${toNumber(product.quantity)} ${product.unit} · ${toNumber(product.sale_price).toLocaleString("fr-FR")} FCFA`,
        textX,
        y + LABEL_H - 34,
        { width: textW, height: 18 }
      );
      doc.font("Helvetica").fontSize(6.5).fillColor("#8B8471").text(
        `Code interne : ${QR_PREFIX}:${product.qr_token}`,
        textX,
        y + LABEL_H - 20,
        { width: textW }
      );

      x += LABEL_W + GAP;
      if (x + LABEL_W > 595 - MARGIN) {
        x = MARGIN;
        y += LABEL_H + GAP;
      }
    }

    doc.end();
  })
);

module.exports = router;

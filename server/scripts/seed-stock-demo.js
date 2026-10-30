/* eslint-disable no-console */
/**
 * Données de stock de démonstration pour demo@malistock.ml.
 * Idempotent : ne fait rien si le compte possède déjà des produits.
 * Usage : npm run seed:stock
 */
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DEMO_EMAIL = "demo@malistock.ml";

/** Produits : [nom, catégorie, unité, prix achat, prix vente, quantité finale, seuil, code-barres] */
const PRODUCTS = [
  ["Bogolan tissé main · rouleau 10 m", "Tissu", "rouleau", 12000, 18000, 148, 20, null],
  ["Coton du Mali · balle 20 kg", "Matière première", "balle", 15000, 22000, 34, 40, "4006381333931"],
  ["Teinture végétale rouge · 1 L", "Teinture", "litre", 2500, 4000, 54, 15, null],
  ["Teinture végétale jaune · 1 L", "Teinture", "litre", 2500, 4000, 8, 15, null],
  ["Savon de karité · 250 g", "Cosmétique", "pièce", 900, 1500, 210, 40, null],
  ["Beurre de karité brut · 1 kg", "Cosmétique", "kilo", 3200, 5000, 0, 10, null],
  ["Bande bogolan brodée · 2 m", "Tissu", "pièce", 5000, 8500, 62, 12, null],
  ["Panier vannerie tressée", "Artisanat", "pièce", 4500, 7500, 96, 20, null],
  ["Indigo naturel en poudre · 500 g", "Teinture", "sachet", 1800, 3000, 41, 10, null],
];

/** Sorties sur la semaine passée : index produit → [quantité, il y a N jours] */
const WEEKLY_EXITS = {
  0: [[12, 1], [8, 3], [15, 5], [6, 6]],
  1: [[5, 2], [3, 4]],
  2: [[4, 1], [7, 2], [2, 5]],
  3: [[3, 3]],
  4: [[18, 1], [22, 3], [14, 6]],
  6: [[6, 2], [4, 4]],
  7: [[9, 1], [7, 3], [11, 5]],
  8: [[5, 2], [3, 6]],
};

/** Entrées supplémentaires : index produit → [quantité, il y a N jours] */
const WEEKLY_ENTRIES = {
  0: [[30, 2]],
  2: [[10, 4]],
  4: [[40, 4]],
  7: [[20, 5]],
};

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomToken(length) {
  let token = "";
  for (let i = 0; i < length; i += 1) {
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return token;
}

function autoSku(index) {
  return `MALI-${randomToken(4)}${index}`;
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

  const [users] = await conn.execute(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [DEMO_EMAIL]
  );
  const demo = users[0];
  if (!demo) {
    console.error(`[seed:stock] Compte ${DEMO_EMAIL} introuvable. Lance d'abord npm run db:seed.`);
    await conn.end();
    process.exit(1);
  }

  /* Fiche boutique du compte démo (vendeur pro). */
  await conn.execute(
    `UPDATE users SET account_type = 'pro', shop_name = ?, shop_category = ?, shop_city = ?, shop_bio = ? WHERE id = ?`,
    [
      "Bogolan Boutique",
      "Artisanat & cosmétiques",
      "Bamako",
      "Tissus bogolan tissés main, savons de karité et teintures végétales du Mali.",
      demo.id,
    ]
  );

  const [existing] = await conn.execute(
    "SELECT COUNT(*) AS count FROM products WHERE user_id = ?",
    [demo.id]
  );
  if (Number(existing[0].count) > 0) {
    console.log(`[seed:stock] Le compte démo a déjà ${Number(existing[0].count)} produit(s). Rien à faire.`);
    await conn.end();
    return;
  }

  const daysAgo = (n) => {
    const date = new Date();
    date.setDate(date.getDate() - n);
    date.setHours(10 + (n % 6), 30, 0, 0);
    return date.toISOString().slice(0, 19).replace("T", " ");
  };

  for (let i = 0; i < PRODUCTS.length; i += 1) {
    const [name, category, unit, purchase, sale, finalQty, min, barcode] = PRODUCTS[i];
    const exits = WEEKLY_EXITS[i] ?? [];
    const entries = WEEKLY_ENTRIES[i] ?? [];

    /* Quantité initiale = quantité finale + mouvements de la semaine. */
    const exited = exits.reduce((sum, [qty]) => sum + qty, 0);
    const entered = entries.reduce((sum, [qty]) => sum + qty, 0);
    const initial = finalQty + exited - entered;

    const sku = autoSku(i);
    const [result] = await conn.execute(
      `INSERT INTO products
         (user_id, sku, name, description, category, unit, purchase_price, sale_price,
          quantity, min_quantity, barcode, qr_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        demo.id,
        sku,
        name,
        null,
        category,
        unit,
        purchase,
        sale,
        initial,
        min,
        barcode,
        `MS${randomToken(8)}`,
        daysAgo(25),
      ]
    );
    const productId = result.insertId;

    /* Mouvement d'ouverture (il y a 25 jours). */
    await conn.execute(
      "INSERT INTO stock_movements (user_id, product_id, type, quantity, note, created_at) VALUES (?, ?, 'entry', ?, ?, ?)",
      [demo.id, productId, initial, "Stock initial", daysAgo(25)]
    );

    for (const [qty, ago] of entries) {
      await conn.execute(
        "INSERT INTO stock_movements (user_id, product_id, type, quantity, note, created_at) VALUES (?, ?, 'entry', ?, 'Réception atelier', ?)",
        [demo.id, productId, qty, daysAgo(ago)]
      );
    }
    for (const [qty, ago] of exits) {
      await conn.execute(
        "INSERT INTO stock_movements (user_id, product_id, type, quantity, unit_price, note, created_at) VALUES (?, ?, 'exit', ?, ?, ?, ?)",
        [demo.id, productId, -qty, sale, "Vente boutique", daysAgo(ago)]
      );
    }

    await conn.execute("UPDATE products SET quantity = ? WHERE id = ?", [finalQty, productId]);
    console.log(`  + ${name} (${sku}) → ${finalQty} ${unit}`);
  }

  await conn.end();
  console.log("[seed:stock] Données de démonstration créées pour demo@malistock.ml.");
}

main().catch((error) => {
  console.error("[seed:stock] Échec :", error.message);
  process.exit(1);
});

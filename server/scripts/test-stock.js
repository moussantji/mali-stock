/* eslint-disable no-console */
/**
 * Test de bout en bout du module stock.
 * Usage : npm run test:stock  (API démarrée + compte vérifié via le mode dev)
 * Scénario : création, doublon, modification, mouvements (entrée/sortie/ajustement),
 * résumé, lookup QR/barcode, QR régénéré, PDF d'étiquettes.
 */
const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;
const PASSWORD = "MotDePasse2026!";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✘ ${label} ${detail}`);
  }
}

async function call(method, path, body, token, raw = false) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: response.status, buffer: await response.arrayBuffer() };
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function main() {
  const stamp = Date.now();
  const email = `test.stock${stamp}@malistock.ml`;

  console.log(`Compte de test : ${email}\n`);

  const reg = await call("POST", "/api/auth/register", { name: "Bourama Stock", email, password: PASSWORD, shopName: "Boutique Stock" });
  check("inscription", reg.status === 201 && !!reg.data?.devCode, JSON.stringify(reg.data));
  const verified = await call("POST", "/api/auth/verify-email", { email, code: reg.data.devCode });
  check("vérification email", verified.status === 200);
  const token = verified.data?.token ?? "";

  console.log("1. Création de produits");
  const p1 = await call(
    "POST",
    "/api/products",
    {
      name: "Bogolan tissé main · rouleau 10 m",
      category: "Tissu",
      unit: "rouleau",
      purchasePrice: 12000,
      salePrice: 18000,
      quantity: 100,
      minQuantity: 20,
      barcode: "4006381333931",
    },
    token
  );
  check("produit 1 créé (201)", p1.status === 201, `reçu ${p1.status} ${JSON.stringify(p1.data)}`);
  check("quantité initiale 100", p1.data?.product?.quantity === 100);
  check("statut ok", p1.data?.product?.status === "ok");
  check("qrToken MS…", /^MS[A-Z2-9]{8}$/.test(p1.data?.product?.qrToken ?? ""));
  const id1 = p1.data?.product?.id;

  const p2 = await call(
    "POST",
    "/api/products",
    { name: "Teinture végétale rouge · 1 L", unit: "litre", purchasePrice: 2500, salePrice: 4000, quantity: 6, minQuantity: 10 },
    token
  );
  check("produit 2 créé (statut low attendu)", p2.data?.product?.status === "low", JSON.stringify(p2.data?.product));
  const id2 = p2.data?.product?.id;

  const noSku = await call("POST", "/api/products", { name: "Savon de karité", unit: "unité" }, token);
  check("sku auto-généré quand absent", /^MALI-[A-Z2-9]{4}$/.test(noSku.data?.product?.sku ?? ""), JSON.stringify(noSku.data?.product?.sku));

  console.log("2. Validations");
  const dup = await call("POST", "/api/products", { name: "Doublon", sku: "MALI-TEST", unit: "unité" }, token);
  const dup2 = await call("POST", "/api/products", { name: "Doublon 2", sku: noSku.data?.product?.sku, unit: "unité" }, token);
  check("sku dupliqué → 409", dup2.status === 409, `reçu ${dup2.status}`);
  const badPrice = await call("POST", "/api/products", { name: "Prix fou", unit: "unité", salePrice: -5 }, token);
  check("prix négatif → 400", badPrice.status === 400);
  const dupSku1 = await call("PATCH", `/api/products/${id1}`, { sku: "MALI-TEST" }, token);
  await call("POST", "/api/products", { name: "Premier", sku: "MALI-TEST", unit: "unité" }, token);
  const dupSku3 = await call("PATCH", `/api/products/${id1}`, { sku: "MALI-TEST" }, token);
  check("modification en doublon → 409", dupSku3.status === 409, `reçu ${dupSku3.status}`);
  void dup; void dupSku1;

  console.log("3. Modification");
  const patch = await call("PATCH", `/api/products/${id2}`, { salePrice: 4500, minQuantity: 8 }, token);
  check("prix de vente modifié", patch.data?.product?.salePrice === 4500);
  check("seuil modifié", patch.data?.product?.minQuantity === 8);

  console.log("4. Mouvements");
  const entry = await call("POST", `/api/products/${id1}/movements`, { type: "entry", quantity: 50, note: "Réception atelier" }, token);
  check("entrée +50 → 150", entry.data?.product?.quantity === 150, JSON.stringify(entry.data));
  const exit = await call("POST", `/api/products/${id1}/movements`, { type: "exit", quantity: 30, unitPrice: 18000, note: "Vente marché" }, token);
  check("sortie -30 → 120", exit.data?.product?.quantity === 120);
  const adjust = await call("POST", `/api/products/${id1}/movements`, { type: "adjustment", quantity: -5, note: "Casse" }, token);
  check("ajustement -5 → 115", adjust.data?.product?.quantity === 115);
  const tooMuch = await call("POST", `/api/products/${id1}/movements`, { type: "exit", quantity: 99999 }, token);
  check("sortie excessive refusée (400)", tooMuch.status === 400, `reçu ${tooMuch.status}`);
  const invalidType = await call("POST", `/api/products/${id1}/movements`, { type: "vol", quantity: 1 }, token);
  check("type invalide refusé", invalidType.status === 400);
  const history = await call("GET", "/api/products/movements", null, token);
  check("historique journalisé (4+ mouvements)", (history.data?.movements ?? []).length >= 4, `reçu ${(history.data?.movements ?? []).length}`);
  check("sortie enregistrée en négatif", (history.data?.movements ?? []).some((m) => m.type === "exit" && m.quantity === -30));

  console.log("5. Résumé");
  const summary = await call("GET", "/api/products/summary", null, token);
  check("4 produits (Savon et Doublon créés à 0, Premier refusé)", summary.data?.totalProducts === 4, JSON.stringify(summary.data));
  check("valeur du stock > 0", (summary.data?.stockValue ?? 0) > 0);
  check("alertes = 3 (1 faible + 2 ruptures)", summary.data?.alerts === 3, `reçu ${summary.data?.alerts}`);
  check("graphique 7 jours (7 points)", (summary.data?.weekly ?? []).length === 7);
  check("trend non vide", typeof summary.data?.trend === "string" && summary.data.trend.length > 0);

  console.log("6. Lookup QR / barcode");
  const token1 = p1.data?.product?.qrToken;
  const byQr = await call("GET", `/api/products/lookup?code=${encodeURIComponent(`MALISTOCK:${token1}`)}`, null, token);
  check("scan du QR interne → produit 1", byQr.data?.product?.id === id1, JSON.stringify(byQr.data));
  const byBarcode = await call("GET", "/api/products/lookup?code=4006381333931", null, token);
  check("scan code-barres réel → produit 1", byBarcode.data?.product?.id === id1);
  const unknown = await call("GET", "/api/products/lookup?code=MALISTOCK:MSINCONNU1", null, token);
  check("code inconnu → 404", unknown.status === 404);

  console.log("7. QR d'un produit + régénération");
  const qr = await call("GET", `/api/products/${id1}/qr`, null, token);
  check("QR en data URL", (qr.data?.qrDataUrl ?? "").startsWith("data:image/png;base64,"));
  const regen = await call("POST", `/api/products/${id1}/qr/regenerate`, {}, token);
  check("qr_token régénéré différent", regen.data?.qrToken !== token1);
  const oldQr = await call("GET", `/api/products/lookup?code=${encodeURIComponent(`MALISTOCK:${token1}`)}`, null, token);
  check("ancien QR invalide après régénération", oldQr.status === 404);

  console.log("8. PDF d'étiquettes");
  const pdf = await call("GET", "/api/products/labels.pdf", null, token, true);
  const magic = Buffer.from(pdf.buffer.slice(0, 5)).toString("latin1");
  check("statut 200 + PDF signé %PDF-", pdf.status === 200 && magic === "%PDF-", `reçu ${pdf.status} ${magic}`);
  check("PDF non vide (> 1 ko)", pdf.buffer.byteLength > 1024, `${pdf.buffer.byteLength} octets`);

  console.log("9. Cloisonnement par utilisateur (autre compte)");
  const emailB = `test.stock2${stamp}@malistock.ml`;
  const regB = await call("POST", "/api/auth/register", { name: "Autre Vendeur", email: emailB, password: PASSWORD, shopName: "Boutique Autre" });
  const tokenB = (await call("POST", "/api/auth/verify-email", { email: emailB, code: regB.data.devCode })).data?.token;
  const otherList = await call("GET", "/api/products", null, tokenB);
  check("liste vide pour un autre compte", (otherList.data?.products ?? []).length === 0, JSON.stringify(otherList.data?.products));
  const foreignGet = await call("PATCH", `/api/products/${id1}`, { salePrice: 1 }, tokenB);
  check("accès au produit d'autrui refusé (404)", foreignGet.status === 404, `reçu ${foreignGet.status}`);

  console.log("10. Sans authentification");
  const anon = await call("GET", "/api/products");
  check("401 sans jeton", anon.status === 401, `reçu ${anon.status}`);

  console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});

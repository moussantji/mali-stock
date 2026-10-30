/* eslint-disable no-console */
/**
 * Test de bout en bout du réseau commerce.
 * Usage : npm run test:network (API démarrée)
 * Scénario : compte pro + compte acheteur, fiche publique par QR, commande,
 * confirmation, encaissement (Orange Money), sortie de stock automatique,
 * refus, annulation, rôles stricts, cloisonnement.
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

async function call(method, path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function registerAndVerify(email, payload) {
  const reg = await call("POST", "/api/auth/register", { email, password: PASSWORD, ...payload });
  const verified = await call("POST", "/api/auth/verify-email", { email, code: reg.data?.devCode });
  return { reg, verified, token: verified.data?.token ?? "" };
}

async function main() {
  const stamp = Date.now();
  const proEmail = `test.pro${stamp}@malistock.ml`;
  const buyerEmail = `test.buyer${stamp}@malistock.ml`;

  console.log(`Vendeur : ${proEmail}\nAcheteur : ${buyerEmail}\n`);

  console.log("1. Inscriptions par rôle");
  const pro = await registerAndVerify(proEmail, {
    name: "Aïssata Traoré",
    accountType: "pro",
    shopName: "Bogolan Boutique",
    shopCategory: "Artisanat & cosmétiques",
    shopCity: "Bamako",
  });
  const shopId = pro.verified.data?.user?.id;
  check("compte pro créé et vérifié", pro.verified.status === 200 && !!pro.token, JSON.stringify(pro.reg.data));
  check("accountType = pro", pro.verified.data?.user?.accountType === "pro");
  check("fiche boutique renvoyée", pro.verified.data?.user?.shopName === "Bogolan Boutique");

  const missingShop = await call("POST", "/api/auth/register", {
    name: "Sans Boutique",
    email: `test.noshop${stamp}@malistock.ml`,
    password: PASSWORD,
    accountType: "pro",
  });
  check("pro sans nom de boutique → 400", missingShop.status === 400, `reçu ${missingShop.status}`);

  const buyer = await registerAndVerify(buyerEmail, { name: "Moussa Diarra", accountType: "standard" });
  check("compte acheteur créé", buyer.verified.status === 200 && !!buyer.token);
  check("accountType = standard", buyer.verified.data?.user?.accountType === "standard");

  console.log("2. Produit du vendeur");
  const product = await call(
    "POST",
    "/api/products",
    {
      name: "Bogolan tissé main · rouleau 10 m",
      unit: "rouleau",
      purchasePrice: 12000,
      salePrice: 18000,
      quantity: 100,
      minQuantity: 10,
    },
    pro.token
  );
  check("produit créé", product.status === 201, JSON.stringify(product.data));
  const qrToken = product.data?.product?.qrToken ?? "";
  const productId = product.data?.product?.id;

  console.log("3. Rôles stricts");
  const buyerProducts = await call("GET", "/api/products", null, buyer.token);
  check("acheteur interdit sur /api/products (403)", buyerProducts.status === 403, `reçu ${buyerProducts.status}`);
  const proOrdersCreate = await call("POST", "/api/orders", { qrToken, quantity: 1 }, pro.token);
  check("pro interdit de commander (403)", proOrdersCreate.status === 403, `reçu ${proOrdersCreate.status}`);

  console.log("4. Fiche publique par QR");
  const fiche = await call("GET", `/api/public/products/${qrToken}`, null, buyer.token);
  check("fiche publique accessible à l'acheteur", fiche.status === 200, JSON.stringify(fiche.data));
  check("nom boutique public", fiche.data?.vendor?.shopName === "Bogolan Boutique");
  check("ville publique", fiche.data?.vendor?.city === "Bamako");
  check("nom du gérant public", fiche.data?.vendor?.ownerName === "Aïssata Traoré");
  check("prix public 18 000", fiche.data?.product?.price === 18000);
  check("disponibilité publique (sans quantité exacte)", fiche.data?.product?.available === true && !("quantity" in (fiche.data?.product ?? {})), JSON.stringify(fiche.data?.product));
  check("pas d'email vendeur exposé", !("email" in (fiche.data?.vendor ?? {})));

  const payloadFiche = await call(
    "GET",
    `/api/public/products/${encodeURIComponent(`MALISTOCK:${qrToken}`)}`,
    null,
    buyer.token
  );
  check(
    "fiche publique avec le payload QR complet (MALISTOCK:MS…)",
    payloadFiche.status === 200 && payloadFiche.data?.product?.price === 18000,
    JSON.stringify(payloadFiche.data)
  );

  const self = await call("GET", `/api/public/products/${qrToken}`, null, pro.token);
  check("le vendeur scanne son propre QR → self", self.data?.self === true);
  const unknown = await call("GET", "/api/public/products/MSZZZZZZZZ", null, buyer.token);
  check("QR inconnu → 404", unknown.status === 404, `reçu ${unknown.status}`);
  const invalid = await call("GET", "/api/public/products/ABC", null, buyer.token);
  check("QR invalide → 400", invalid.status === 400);

  console.log("4 bis. Annuaire des boutiques");
  const shopList = await call("GET", "/api/public/shops", null, buyer.token);
  check("annuaire accessible à l'acheteur", shopList.status === 200, JSON.stringify(shopList.data));
  const listedShop = (shopList.data?.shops ?? []).find((s) => s.id === String(shopId));
  check("boutique du vendeur listée", !!listedShop);
  check("compteur produits public", listedShop?.productCount === 1, `reçu ${listedShop?.productCount}`);
  check("compteur disponibles public", listedShop?.availableCount === 1);
  check("prix minimum public", listedShop?.minPrice === 18000);
  check(
    "pas de quantité exacte dans l'annuaire",
    !!listedShop && !("quantity" in listedShop),
    JSON.stringify(listedShop)
  );

  const shopSearch = await call(
    "GET",
    `/api/public/shops?search=${encodeURIComponent("Bamako")}`,
    null,
    buyer.token
  );
  check(
    "recherche par ville",
    (shopSearch.data?.shops ?? []).some((s) => s.id === String(shopId))
  );
  const shopSearchNone = await call(
    "GET",
    `/api/public/shops?search=${encodeURIComponent("Inexistante-xyz")}`,
    null,
    buyer.token
  );
  check("recherche sans résultat", (shopSearchNone.data?.shops ?? []).length === 0);

  const shopDetail = await call("GET", `/api/public/shops/${shopId}`, null, buyer.token);
  check(
    "fiche boutique accessible",
    shopDetail.status === 200 && shopDetail.data?.shop?.shopName === "Bogolan Boutique",
    JSON.stringify(shopDetail.data)
  );
  const shopProduct = (shopDetail.data?.products ?? []).find(
    (p) => p.name === "Bogolan tissé main · rouleau 10 m"
  );
  check("catalogue boutique", !!shopProduct);
  check("prix du catalogue", shopProduct?.price === 18000);
  check("disponibilité du catalogue", shopProduct?.available === true);
  check(
    "pas de quantité exacte dans le catalogue",
    !!shopProduct && !("quantity" in shopProduct),
    JSON.stringify(shopProduct)
  );
  check("pas de jeton QR exposé", !!shopProduct && !("qrToken" in shopProduct));
  check("pas d'email boutique exposé", !("email" in (shopDetail.data?.shop ?? {})));

  const shopUnknown = await call("GET", "/api/public/shops/99999999", null, buyer.token);
  check("boutique inconnue → 404", shopUnknown.status === 404, `reçu ${shopUnknown.status}`);
  const shopInvalid = await call("GET", "/api/public/shops/abc", null, buyer.token);
  check("boutique invalide → 400", shopInvalid.status === 400, `reçu ${shopInvalid.status}`);
  const shopsNoAuth = await call("GET", "/api/public/shops");
  check("annuaire sans authentification → 401", shopsNoAuth.status === 401);

  console.log("5. Commande du client");
  const order = await call(
    "POST",
    "/api/orders",
    { qrToken, quantity: 5, note: "Je passe à la boutique" },
    buyer.token
  );
  check("commande créée (201)", order.status === 201, JSON.stringify(order.data));
  check("statut en attente", order.data?.order?.status === "pending");
  check("total = 90 000", order.data?.order?.total === 90000, `reçu ${order.data?.order?.total}`);
  check("vendeur public dans la commande", order.data?.order?.vendor?.shopName === "Bogolan Boutique");
  const orderId = order.data?.order?.id;

  const proInbox = await call("GET", "/api/orders", null, pro.token);
  check("le vendeur voit la commande", (proInbox.data?.orders ?? []).some((o) => o.id === orderId));
  const inboxOrder = (proInbox.data?.orders ?? []).find((o) => o.id === orderId);
  check("le vendeur voit le client public", inboxOrder?.client?.name === "Moussa Diarra");
  check("quantité demandée visible", inboxOrder?.quantity === 5);

  const buyerInbox = await call("GET", "/api/orders", null, buyer.token);
  check("le client voit sa commande", (buyerInbox.data?.orders ?? []).some((o) => o.id === orderId));
  check("rôle renvoyé = standard", buyerInbox.data?.role === "standard");

  console.log("6. Confirmation vendeur");
  const confirm = await call("PATCH", `/api/orders/${orderId}`, { action: "confirm" }, pro.token);
  check("commande confirmée", confirm.data?.order?.status === "confirmed", JSON.stringify(confirm.data));
  const buyerAfterConfirm = await call("GET", "/api/orders", null, buyer.token);
  check("le client voit « confirmée »", (buyerAfterConfirm.data?.orders ?? []).find((o) => o.id === orderId)?.status === "confirmed");

  console.log("7. Encaissement → sortie de stock");
  const complete = await call(
    "PATCH",
    `/api/orders/${orderId}`,
    { action: "complete", paymentMethod: "orange_money", paymentReference: "OM-12345" },
    pro.token
  );
  check("commande encaissée", complete.data?.order?.status === "completed", JSON.stringify(complete.data));
  check("mode de paiement enregistré", complete.data?.order?.paymentMethod === "orange_money");
  check("référence de paiement", complete.data?.order?.paymentReference === "OM-12345");

  const list = await call("GET", "/api/products", null, pro.token);
  const freshProduct = (list.data?.products ?? []).find((p) => p.id === productId);
  check("stock décrémenté 100 → 95", freshProduct?.quantity === 95, `reçu ${freshProduct?.quantity}`);
  const movements = await call("GET", "/api/products/movements", null, pro.token);
  const exitMovement = (movements.data?.movements ?? []).find(
    (m) => m.type === "exit" && m.quantity === -5 && (m.note ?? "").includes(`Commande #${orderId}`)
  );
  check("mouvement de sortie journalisé", !!exitMovement);

  const doubleComplete = await call("PATCH", `/api/orders/${orderId}`, { action: "complete", paymentMethod: "cash" }, pro.token);
  check("double encaissement refusé (409)", doubleComplete.status === 409, `reçu ${doubleComplete.status}`);

  console.log("7 bis. Ajustement de quantité et recalcul du total");
  const adjustedOrder = await call("POST", "/api/orders", { qrToken, quantity: 4 }, buyer.token);
  const adjust = await call(
    "PATCH",
    `/api/orders/${adjustedOrder.data?.order?.id}`,
    { action: "confirm", confirmedQuantity: 3 },
    pro.token
  );
  check("quantité confirmée ajustée à 3", adjust.data?.order?.confirmedQuantity === 3, JSON.stringify(adjust.data));
  check("total recalculé à 54 000", adjust.data?.order?.total === 54000, `reçu ${adjust.data?.order?.total}`);
  const completeAdjusted = await call(
    "PATCH",
    `/api/orders/${adjustedOrder.data?.order?.id}`,
    { action: "complete", paymentMethod: "cash" },
    pro.token
  );
  check("commande ajustée encaissée", completeAdjusted.data?.order?.status === "completed");
  const afterAdjusted = await call("GET", "/api/products", null, pro.token);
  const adjustedStock = (afterAdjusted.data?.products ?? []).find((p) => p.id === productId);
  check("stock décrémenté de 3 (95 → 92)", adjustedStock?.quantity === 92, `reçu ${adjustedStock?.quantity}`);

  console.log("8. Refus vendeur");
  const order2 = await call("POST", "/api/orders", { qrToken, quantity: 2 }, buyer.token);
  const decline = await call(
    "PATCH",
    `/api/orders/${order2.data?.order?.id}`,
    { action: "decline", vendorNote: "Stock réservé pour un client" },
    pro.token
  );
  check("commande refusée", decline.data?.order?.status === "declined");
  check("motif du vendeur visible", decline.data?.order?.vendorNote === "Stock réservé pour un client");

  console.log("9. Annulation client");
  const order3 = await call("POST", "/api/orders", { qrToken, quantity: 1 }, buyer.token);
  const cancel = await call("PATCH", `/api/orders/${order3.data?.order?.id}`, { action: "cancel" }, buyer.token);
  check("commande annulée par le client", cancel.data?.order?.status === "cancelled");
  const cancelCompleted = await call("PATCH", `/api/orders/${orderId}`, { action: "cancel" }, buyer.token);
  check("annulation d'une commande clôturée refusée (409)", cancelCompleted.status === 409, `reçu ${cancelCompleted.status}`);

  console.log("10. Garde-fous de stock et de rôle");
  const bigOrder = await call("POST", "/api/orders", { qrToken, quantity: 200 }, buyer.token);
  check("grosse quantité acceptée à la commande (vendeur confirmera)", bigOrder.status === 201);
  const bigComplete = await call(
    "PATCH",
    `/api/orders/${bigOrder.data?.order?.id}`,
    { action: "complete", paymentMethod: "cash" },
    pro.token
  );
  check("encaissement > stock refusé (409)", bigComplete.status === 409 && bigComplete.data?.code === "INSUFFICIENT_STOCK", JSON.stringify(bigComplete.data));

  const zero = await call(
    "POST",
    "/api/products",
    { name: "Beurre de karité · rupture", unit: "kilo", salePrice: 5000, quantity: 0, minQuantity: 5 },
    pro.token
  );
  const zeroOrder = await call("POST", "/api/orders", { qrToken: zero.data?.product?.qrToken, quantity: 1 }, buyer.token);
  check("commande sur rupture refusée (409)", zeroOrder.status === 409 && zeroOrder.data?.code === "OUT_OF_STOCK", JSON.stringify(zeroOrder.data));

  const order5 = await call("POST", "/api/orders", { qrToken, quantity: 1 }, buyer.token);
  const buyerConfirm = await call("PATCH", `/api/orders/${order5.data?.order?.id}`, { action: "confirm" }, buyer.token);
  check("client interdit de confirmer (403)", buyerConfirm.status === 403, `reçu ${buyerConfirm.status}`);
  const buyerComplete = await call("PATCH", `/api/orders/${order5.data?.order?.id}`, { action: "complete", paymentMethod: "cash" }, buyer.token);
  check("client interdit d'encaisser (403)", buyerComplete.status === 403, `reçu ${buyerComplete.status}`);

  console.log("11. Sans authentification");
  const anonOrders = await call("GET", "/api/orders");
  check("401 sans jeton sur les commandes", anonOrders.status === 401);
  const anonFiche = await call("GET", `/api/public/products/${qrToken}`);
  check("401 sans jeton sur la fiche publique", anonFiche.status === 401);

  console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});

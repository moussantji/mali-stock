/* eslint-disable no-console */
/**
 * Test de bout en bout du flux d'inscription sécurisée.
 * Usage : npm run test:auth  (nécessite l'API démarrée sur le port 4000)
 * Aucune dépendance : utilise fetch (Node 20+) et le mode dev (devCode).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}/api/auth`;
const PASSWORD = "MotDePasse2026!";
const NEW_PASSWORD = "NouveauTresor2026!";

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

async function main() {
  const stamp = Date.now();
  const email = `test.flow${stamp}@malistock.ml`;

  console.log(`Compte de test : ${email}\n`);

  console.log("1. Inscription (devCode attendu en mode dev)");
  const reg = await call("POST", "/register", { name: "Awa Testeur", email, password: PASSWORD, shopName: "Boutique Test Awa" });
  check("statut 201", reg.status === 201, `reçu ${reg.status} ${JSON.stringify(reg.data)}`);
  check("devCode présent (mode dev)", typeof reg.data?.devCode === "string");
  const devCode = reg.data?.devCode ?? "";

  console.log("2. Connexion avant vérification (403 EMAIL_NOT_VERIFIED attendu)");
  const blocked = await call("POST", "/login", { email, password: PASSWORD });
  check("statut 403", blocked.status === 403, `reçu ${blocked.status}`);
  check("code EMAIL_NOT_VERIFIED", blocked.data?.code === "EMAIL_NOT_VERIFIED");

  console.log("3. Renvoi immédiat du code (429 cooldown attendu)");
  const resend = await call("POST", "/resend-verification", { email });
  check("statut 429", resend.status === 429, `reçu ${resend.status}`);

  console.log("4. Vérification avec un code erroné (400 + essais restants)");
  const wrong = await call("POST", "/verify-email", { email, code: "000000" === devCode ? "111111" : "000000" });
  check("statut 400", wrong.status === 400, `reçu ${wrong.status}`);
  check("message avec essais restants", /essai/.test(wrong.data?.message ?? ""));

  console.log("5. Vérification avec le bon code (200 + session)");
  const verified = await call("POST", "/verify-email", { email, code: devCode });
  check("statut 200", verified.status === 200, `reçu ${verified.status} ${JSON.stringify(verified.data)}`);
  check("emailVerified true", verified.data?.user?.emailVerified === true);
  const token = verified.data?.token ?? "";

  console.log("6. /me avec le jeton");
  const me = await call("GET", "/me", null, token);
  check("statut 200", me.status === 200, `reçu ${me.status}`);
  check("email correspondant", me.data?.user?.email === email);

  console.log("7. Mot de passe oublié (devCode attendu)");
  const forgot = await call("POST", "/forgot-password", { email });
  check("statut 200", forgot.status === 200, `reçu ${forgot.status}`);
  const resetCode = forgot.data?.devCode ?? "";

  console.log("8. Réinitialisation avec code erroné (400 attendu)");
  const badReset = await call("POST", "/reset-password", { email, code: "999999" === resetCode ? "888888" : "999999", password: NEW_PASSWORD });
  check("statut 400", badReset.status === 400, `reçu ${badReset.status}`);

  console.log("9. Réinitialisation correcte (200 + nouvelle session)");
  const reset = await call("POST", "/reset-password", { email, code: resetCode, password: NEW_PASSWORD });
  check("statut 200", reset.status === 200, `reçu ${reset.status} ${JSON.stringify(reset.data)}`);

  console.log("10. Ancien jeton révoqué (401 attendu)");
  const oldMe = await call("GET", "/me", null, token);
  check("statut 401", oldMe.status === 401, `reçu ${oldMe.status}`);

  console.log("11. Connexion avec le NOUVEAU mot de passe (200 attendu)");
  const newLogin = await call("POST", "/login", { email, password: NEW_PASSWORD });
  check("statut 200", newLogin.status === 200, `reçu ${newLogin.status}`);

  console.log("12. Connexion avec l'ANCIEN mot de passe (401 attendu)");
  const oldLogin = await call("POST", "/login", { email, password: PASSWORD });
  check("statut 401", oldLogin.status === 401, `reçu ${oldLogin.status}`);

  console.log("13. Email déjà pris (409 attendu)");
  const dup = await call("POST", "/register", { name: "Awa Testeur", email, password: PASSWORD, shopName: "Boutique Test Awa" });
  check("statut 409", dup.status === 409, `reçu ${dup.status}`);

  console.log("14. Mot de passe trop faible (400 attendu)");
  const weak = await call("POST", "/register", { name: "Awa Testeur", email: `weak${stamp}@malistock.ml`, password: "azerty123", shopName: "Boutique Test Awa" });
  check("statut 400", weak.status === 400, `reçu ${weak.status}`);

  console.log("15. Email inconnu → mot de passe oublié (200 sans révélation)");
  const ghost = await call("POST", "/forgot-password", { email: `inconnu${stamp}@malistock.ml` });
  check("statut 200", ghost.status === 200, `reçu ${ghost.status}`);
  check("pas de devCode pour un compte inexistant", !ghost.data?.devCode);

  console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * Test du pipeline email RÉEL : inscription → lecture du code dans la boîte
 * Mailpit (http://127.0.0.1:8025) → vérification → session.
 * Usage : npm run test:email   (API et Mailpit doivent tourner)
 */
const BASE = `http://127.0.0.1:${process.env.PORT || 4000}/api/auth`;
const MAILPIT = process.env.MAILPIT_URL || "http://127.0.0.1:8025";
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

async function main() {
  const email = `real.mail${Date.now()}@malistock.ml`;
  console.log(`Compte de test : ${email}\n`);

  console.log("1. Inscription (email réel attendu dans Mailpit)");
  const reg = await call("POST", "/register", { name: "Awa Testeur", email, password: PASSWORD, shopName: "Boutique Test Awa" });
  check("statut 201", reg.status === 201, `reçu ${reg.status} ${JSON.stringify(reg.data)}`);
  check("emailSent true (SMTP actif)", reg.data?.emailSent === true, JSON.stringify(reg.data));

  console.log("2. Lecture du message dans la boîte Mailpit");
  await new Promise((resolve) => setTimeout(resolve, 800));
  const inbox = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  const message = (inbox.messages ?? []).find(
    (entry) => JSON.stringify(entry.To ?? []).includes(email) && /Mali Stock/.test(entry.Subject ?? "")
  );
  check("message présent", Boolean(message), "aucun email trouvé pour ce destinataire");
  if (!message) return finish();

  const detail = await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json();
  const match = (detail.Text ?? "").match(/Code\s*:\s*(\d{6})/);
  const code = match?.[1] ?? "";
  check("code à 6 chiffres extrait du texte", /^\d{6}$/.test(code));
  check("objet correct", /Mali Stock/.test(message.Subject ?? ""));

  console.log("3. Vérification avec le code reçu par email");
  const verified = await call("POST", "/verify-email", { email, code });
  check("statut 200", verified.status === 200, `reçu ${verified.status} ${JSON.stringify(verified.data)}`);
  check("emailVerified true", verified.data?.user?.emailVerified === true);

  console.log("4. Connexion avec le compte vérifié");
  const login = await call("POST", "/login", { email, password: PASSWORD });
  check("statut 200", login.status === 200, `reçu ${login.status}`);

  return finish();
}

function finish() {
  console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});

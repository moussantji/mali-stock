/* eslint-disable no-console */
/**
 * Test de bout en bout de la 2FA TOTP.
 * Usage : npm run test:2fa  (API démarrée)
 * Scénario : inscription → activation 2FA (QR + code) → codes de secours →
 * connexion protégée → code TOTP → code de secours → appareil de confiance → désactivation.
 */
const { generate } = require("otplib");

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}/api/auth`;
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

async function createVerifiedUser(email) {
  const reg = await call("POST", "/register", { name: "Test 2FA", email, password: PASSWORD, shopName: "Boutique Test 2FA" });
  if (reg.status !== 201 || !reg.data?.devCode) {
    throw new Error(`Inscription impossible (${reg.status}) — mode dev requis pour ce test.`);
  }
  await call("POST", "/verify-email", { email, code: reg.data.devCode });
}

async function main() {
  const email = `test.2fa${Date.now()}@malistock.ml`;
  console.log(`Compte de test : ${email}\n`);
  await createVerifiedUser(email);

  console.log("1. État initial (2FA désactivée)");
  const reg2 = await call("POST", "/login", { email, password: PASSWORD });
  const initialToken = reg2.data?.token ?? "";
  check("connexion directe sans 2FA", reg2.status === 200, `reçu ${reg2.status}`);
  const status0 = await call("GET", "/2fa/status", null, initialToken);
  check("status.enabled false", status0.data?.enabled === false);
  check("status.backupCodesLeft 0", status0.data?.backupCodesLeft === 0);

  console.log("2. Démarrage de l'activation (QR + secret)");
  const setup = await call("POST", "/2fa/setup", {}, initialToken);
  check("statut 200", setup.status === 200, `reçu ${setup.status}`);
  check("secret base32 présent", /^[A-Z2-7]{16,}$/.test(setup.data?.secret ?? ""));
  check("otpauth:// URI présente", (setup.data?.otpauthUri ?? "").startsWith("otpauth://totp/"));
  check("QR code PNG en data URL", (setup.data?.qrDataUrl ?? "").startsWith("data:image/png;base64,"));
  const secret = setup.data?.secret ?? "";

  console.log("3. Confirmation avec le code TOTP courant");
  const code = await generate({ secret });
  const verify = await call("POST", "/2fa/verify", { code }, initialToken);
  check("statut 200", verify.status === 200, `reçu ${verify.status} ${JSON.stringify(verify.data)}`);
  check("10 codes de secours générés", (verify.data?.backupCodes ?? []).length === 10);
  check("format des codes (XXXX-XXXX)", (verify.data?.backupCodes ?? []).every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)));
  const backupCodes = verify.data?.backupCodes ?? [];

  console.log("4. Connexion protégée (TOTP_REQUIRED attendu)");
  const login1 = await call("POST", "/login", { email, password: PASSWORD });
  check("statut 403", login1.status === 403, `reçu ${login1.status}`);
  check("code TOTP_REQUIRED", login1.data?.code === "TOTP_REQUIRED");
  const ticket = login1.data?.ticket ?? "";

  console.log("5. Mauvais code TOTP (401 attendu)");
  const badCode = await call("POST", "/login-2fa", { ticket, code: "000000" === code ? "111111" : "000000" });
  check("statut 401", badCode.status === 401, `reçu ${badCode.status}`);

  console.log("6. Bon code TOTP (200 + session)");
  const freshTicket = (await call("POST", "/login", { email, password: PASSWORD })).data?.ticket ?? "";
  const good = await call("POST", "/login-2fa", { ticket: freshTicket, code });
  check("statut 200", good.status === 200, `reçu ${good.status}`);
  check("totpEnabled true", good.data?.user?.totpEnabled === true);
  check("jeton de session présent", typeof good.data?.token === "string");

  console.log("7. Code de secours à usage unique");
  const ticket3 = (await call("POST", "/login", { email, password: PASSWORD })).data?.ticket ?? "";
  const badBackup = await call("POST", "/login-2fa", { ticket: ticket3, code: "ZZZZ-ZZZZ" });
  check("code de secours invalide → 401", badBackup.status === 401);
  const ticket4 = (await call("POST", "/login", { email, password: PASSWORD })).data?.ticket ?? "";
  const goodBackup = await call("POST", "/login-2fa", { ticket: ticket4, code: backupCodes[0] });
  check("code de secours valide → 200", goodBackup.status === 200, `reçu ${goodBackup.status}`);
  const ticket5 = (await call("POST", "/login", { email, password: PASSWORD })).data?.ticket ?? "";
  const reuse = await call("POST", "/login-2fa", { ticket: ticket5, code: backupCodes[0] });
  check("réutilisation refusée → 401", reuse.status === 401);
  const status1 = await call("GET", "/2fa/status", null, goodBackup.data?.token);
  check("9 codes restants", status1.data?.backupCodesLeft === 9, `reçu ${status1.data?.backupCodesLeft}`);

  console.log("8. Appareil de confiance (30 jours)");
  const ticket6 = (await call("POST", "/login", { email, password: PASSWORD })).data?.ticket ?? "";
  const remembered = await call("POST", "/login-2fa", {
    ticket: ticket6,
    code: backupCodes[1],
    rememberDevice: true,
    deviceLabel: "Téléphone de test",
  });
  check("deviceToken renvoyé", typeof remembered.data?.deviceToken === "string");
  const trustedLogin = await call("POST", "/login", {
    email,
    password: PASSWORD,
    deviceToken: remembered.data?.deviceToken ?? "",
  });
  check("connexion directe avec appareil de confiance", trustedLogin.status === 200, `reçu ${trustedLogin.status}`);
  const status2 = await call("GET", "/2fa/status", null, trustedLogin.data?.token);
  check("1 appareil de confiance listé", (status2.data?.trustedDevices ?? []).length === 1);

  console.log("9. Désactivation (mot de passe + code requis)");
  const badDisable = await call("POST", "/2fa/disable", { password: "FauxMotDePasse1!", code: "123456" }, trustedLogin.data?.token);
  check("mauvais mot de passe → 401", badDisable.status === 401);
  const code2 = await generate({ secret });
  const disable = await call("POST", "/2fa/disable", { password: PASSWORD, code: "000000" === code2 ? "111111" : code2 }, trustedLogin.data?.token);
  check("statut 200", disable.status === 200, `reçu ${disable.status}`);
  check("totpEnabled false", disable.data?.user?.totpEnabled === false);

  console.log("10. Après désactivation : connexion directe");
  const login2 = await call("POST", "/login", { email, password: PASSWORD });
  check("statut 200", login2.status === 200, `reçu ${login2.status}`);
  const status3 = await call("GET", "/2fa/status", null, login2.data?.token);
  check("enabled false", status3.data?.enabled === false);
  check("appareils de confiance purgés", (status3.data?.trustedDevices ?? []).length === 0);

  console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Échec du script :", error);
  process.exit(1);
});

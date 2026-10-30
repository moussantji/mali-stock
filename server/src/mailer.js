/**
 * Envoi des emails transactionnels Mali Stock (vérification, réinitialisation).
 *
 * Deux modes :
 *  - SMTP configuré (SMTP_HOST / SMTP_USER / SMTP_PASS) → emails réels.
 *  - SMTP absent + DEV_EXPOSE_CODES=1 → le code est journalisé dans la console
 *    et renvoyé à l'app dans `devCode` (jamais en production).
 */
const nodemailer = require("nodemailer");
const config = require("./config");

const BRAND_BG = "#063D29";
const BRAND_GREEN = "#0A6B45";
const BRAND_GOLD = "#DFA921";

function isConfigured() {
  // Il suffit que l'hôte soit défini (Mailpit local n'exige ni utilisateur ni mot de passe).
  return Boolean(config.mailer.host);
}

function createTransport() {
  return nodemailer.createTransport({
    host: config.mailer.host,
    port: config.mailer.port,
    secure: config.mailer.port === 465,
    auth: config.mailer.user ? { user: config.mailer.user, pass: config.mailer.pass } : undefined,  });
}

function page(title, intro, contentHtml, outro) {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F7F0DD;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:24px auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #EAE2CE;">
      <div style="display:flex;height:6px;">
        <div style="flex:1;background:${BRAND_GREEN};"></div>
        <div style="flex:1;background:${BRAND_GOLD};"></div>
        <div style="flex:1;background:#B23A2E;"></div>
      </div>
      <div style="padding:28px 30px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:2px;color:${BRAND_GOLD};">MALI STOCK</p>
        <h1 style="margin:0 0 12px;font-size:20px;color:#1B201A;">${title}</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:22px;color:#5B564A;">${intro}</p>
        ${contentHtml}
        <p style="margin:18px 0 0;font-size:12px;line-height:18px;color:#8B8471;">${outro}</p>
      </div>
      <div style="padding:14px 30px;background:${BRAND_BG};color:rgba(255,255,255,0.75);font-size:11px;">
        Mali Stock · Connexion sécurisée
      </div>
    </div>
  </body>
</html>`;
}

function codeBlock(code) {
  return `<div style="background:#F7F0DD;border:1px solid #EAE2CE;border-radius:12px;padding:18px;text-align:center;">
    <span style="font-size:34px;font-weight:bold;letter-spacing:12px;color:${BRAND_GREEN};">${code}</span>
  </div>`;
}

/**
 * Envoie un code à 6 chiffres.
 * @returns {Promise<{delivered: boolean}>} delivered=false si SMTP absent/indisponible.
 */
async function sendAuthCode({ to, purpose, code }) {
  const isVerify = purpose === "verify_email";
  const subject = isVerify
    ? "Mali Stock — Ton code de vérification"
    : "Mali Stock — Réinitialisation du mot de passe";
  const title = isVerify ? "Vérifie ton adresse email" : "Nouveau mot de passe";
  const intro = isVerify
    ? "Bienvenue dans Mali Stock ! Voici ton code de vérification à 6 chiffres :"
    : "Tu as demandé la réinitialisation de ton mot de passe. Voici ton code à 6 chiffres :";
  const outro = isVerify
    ? "Ce code expire dans 10 minutes. Ne le partage avec personne."
    : "Ce code expire dans 10 minutes et ne peut servir qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore cet email.";

  const html = page(title, intro, codeBlock(code), outro);
  const text = `${title}\n\n${intro}\n\nCode : ${code}\n\n${outro}\n`;

  if (!isConfigured()) {
    console.log(`[mailer][DEV] Email non configuré — code ${purpose} pour ${to} : ${code}`);
    return { delivered: false };
  }

  try {
    const transport = createTransport();
    await transport.sendMail({
      from: config.mailer.from,
      to,
      subject,
      html,
      text,
    });
    return { delivered: true };
  } catch (error) {
    console.error(`[mailer] Échec d'envoi vers ${to} :`, error.message);
    return { delivered: false };
  }
}

module.exports = { sendAuthCode, isConfigured };

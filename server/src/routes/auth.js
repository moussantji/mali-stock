const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const QRCode = require("qrcode");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../db");
const config = require("../config");
const asyncHandler = require("../middleware/async-handler");
const { requireAuth } = require("../middleware/auth");
const { sendAuthCode } = require("../mailer");
const { issueCode, discardCode, verifyCode } = require("../services/codes");
const { logAuthEvent, countRecentFailures } = require("../services/events");
const { passwordError } = require("../services/password");
const totpService = require("../services/totp");

const router = express.Router();
const googleClient = config.googleClientIds.length > 0 ? new OAuth2Client() : null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

/* Limites anti-abus : globale sur l'auth, plus stricte sur l'envoi de codes. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 80,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Réessaie dans quelques minutes." },
});

const codeIssueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Trop de codes demandés. Réessaie dans quelques minutes." },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Trop de tentatives de vérification. Réessaie dans quelques minutes." },
});

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function requestContext(req) {
  return { ip: req.ip, userAgent: req.headers["user-agent"] || null };
}

function publicUser(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url || null,
    emailVerified: Boolean(row.email_verified),
    totpEnabled: Boolean(row.totp_enabled),
    accountType: row.account_type || "pro",
    isAdmin: Boolean(row.is_admin),
    shopName: row.shop_name || null,
    shopCategory: row.shop_category || null,
    shopCity: row.shop_city || null,
    shopBio: row.shop_bio || null,
    createdAt: row.created_at,
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, tv: user.token_version ?? 0 },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
}

/** Ticket éphémère (5 min) autorisant à finaliser une connexion par code 2FA. */
function signTwoFactorTicket(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, purpose: "2fa-login" },
    config.jwt.secret,
    {
      expiresIn: "5m",
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
}

function verifyTwoFactorTicket(token) {
  const payload = jwt.verify(token, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
  if (payload.purpose !== "2fa-login") {
    throw new Error("Mauvais usage du ticket.");
  }
  return payload;
}

function sendSession(res, user, status = 200) {
  return res.status(status).json({ token: signToken(user), user: publicUser(user) });
}

/**
 * Émet, tente l'envoi et nettoie le code si l'email ne part pas.
 * Renvoie { code, delivered } ou lance rien (les erreurs SQL remontent).
 */
async function createAndSendCode(user, purpose) {
  const issued = await issueCode(user.id, purpose);
  if (!issued.ok) {
    return { cooldown: issued.retryAfter };
  }
  const { delivered } = await sendAuthCode({ to: user.email, purpose, code: issued.code });
  if (!delivered) {
    // L'app peut encore vérifier le code en mode dev : on garde le code,
    // mais un nouvel envoi reste possible (pas de cooldown injustifié).
    // → on supprime la ligne pour permettre un renvoi immédiat plus tard,
    //   sauf en mode dev (le code est exposé à l'app).
    if (!(config.mailer.devExposeCodes && !config.mailer.host)) {
      await discardCode(issued.id);
    }
  }
  return { code: issued.code, delivered };
}

function devCodePayload(code) {
  return config.mailer.devExposeCodes ? { devCode: code } : {};
}

async function findUserByEmail(email) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

/* ── Inscription par email ─────────────────────────────────── */
router.post(
  "/register",
  authLimiter,
  codeIssueLimiter,
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body?.name).replace(/\s+/g, " ");
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    /* Mali Stock est une application de gestion de stock :
       toute inscription publique crée un compte vendeur (pro) avec sa boutique. */
    const shopName = cleanString(req.body?.shopName);
    const shopCategory = cleanString(req.body?.shopCategory);
    const shopCity = cleanString(req.body?.shopCity);
    const context = requestContext(req);

    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ message: "Le nom doit contenir entre 2 et 120 caractères." });
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 190) {
      return res.status(400).json({ message: "Adresse email invalide." });
    }
    if (shopName.length < 2 || shopName.length > 120) {
      return res.status(400).json({ message: "Indique le nom de ta boutique (2 à 120 caractères)." });
    }
    if (shopCategory.length > 60 || shopCity.length > 80) {
      return res.status(400).json({ message: "Catégorie ou ville trop longue." });
    }
    const invalidPassword = passwordError(password, { name, email });
    if (invalidPassword) {
      return res.status(400).json({ message: invalidPassword });
    }

    if (await findUserByEmail(email)) {
      return res.status(409).json({ message: "Un compte existe déjà avec cet email." });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const [result] = await pool.execute(
        `INSERT INTO users
           (name, email, password_hash, account_type, shop_name, shop_category, shop_city, last_login_at)
         VALUES (?, ?, ?, 'pro', ?, ?, ?, NOW())`,
        [name, email, passwordHash, shopName, shopCategory || null, shopCity || null]
      );
      const user = await findUserById(result.insertId);

      const sent = await createAndSendCode(user, "verify_email");
      await logAuthEvent({ userId: user.id, email, type: "register", ...context });

      if (sent.cooldown) {
        return res.status(201).json({
          email,
          emailSent: false,
          retryAfter: sent.cooldown,
        });
      }
      return res.status(201).json({
        email,
        emailSent: sent.delivered,
        ...devCodePayload(sent.code),
      });
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Un compte existe déjà avec cet email." });
      }
      throw error;
    }
  })
);

/* ── Vérification de l'email par code ──────────────────────── */
router.post(
  "/verify-email",
  authLimiter,
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = cleanString(req.body?.code).replace(/\s+/g, "");
    const context = requestContext(req);

    if (!EMAIL_PATTERN.test(email) || code.length !== 6) {
      return res.status(400).json({ message: "Renseigne ton email et le code à 6 chiffres." });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ message: "Code invalide ou expiré." });
    }
    if (user.email_verified) {
      return sendSession(res, user);
    }

    const result = await verifyCode(user.id, "verify_email", code);
    if (!result.ok) {
      await logAuthEvent({ userId: user.id, email, type: "verify_email_failed", ...context });
      const messages = {
        none: "Code invalide ou expiré. Demande un nouveau code.",
        expired: "Code expiré. Demande un nouveau code.",
        locked: "Trop d'essais. Demande un nouveau code.",
        invalid: `Code incorrect. ${result.attemptsLeft} essai${result.attemptsLeft > 1 ? "s" : ""} restant${result.attemptsLeft > 1 ? "s" : ""}.`,
      };
      return res.status(400).json({ message: messages[result.reason] ?? messages.none });
    }

    await pool.execute("UPDATE users SET email_verified = 1, last_login_at = NOW() WHERE id = ?", [
      user.id,
    ]);
    await logAuthEvent({ userId: user.id, email, type: "verify_email", ...context });
    const freshUser = await findUserById(user.id);
    return sendSession(res, freshUser);
  })
);

/* ── Renvoi du code de vérification ────────────────────────── */
router.post(
  "/resend-verification",
  authLimiter,
  codeIssueLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const context = requestContext(req);

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: "Adresse email invalide." });
    }

    const user = await findUserByEmail(email);
    if (!user || user.email_verified) {
      // Ne révèle pas l'existence du compte.
      return res.json({ sent: true, emailSent: false });
    }

    const sent = await createAndSendCode(user, "verify_email");
    await logAuthEvent({ userId: user.id, email, type: "resend_code", ...context });

    if (sent.cooldown) {
      return res.status(429).json({
        message: `Un code vient déjà d'être envoyé. Réessaie dans ${sent.cooldown} s.`,
        retryAfter: sent.cooldown,
      });
    }
    return res.json({ sent: true, emailSent: sent.delivered, ...devCodePayload(sent.code) });
  })
);

/* ── Connexion par email ───────────────────────────────────── */
router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const context = requestContext(req);

    if (!EMAIL_PATTERN.test(email) || typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ message: "Renseigne ton email et ton mot de passe." });
    }

    const user = await findUserByEmail(email);
    const valid = user?.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!valid) {
      await logAuthEvent({
        userId: user?.id ?? null,
        email,
        type: "login_failed",
        ...context,
      });
      const failures = await countRecentFailures(email);
      if (failures >= 10) {
        return res.status(429).json({
          message: "Trop de tentatives pour ce compte. Réessaie dans quelques minutes.",
        });
      }
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    if (!user.email_verified) {
      await logAuthEvent({
        userId: user.id,
        email,
        type: "login_blocked_unverified",
        ...context,
      });
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Vérifie ton email pour activer ton compte.",
      });
    }

    /* Appareil de confiance : la 2FA est déjà passée sur cet appareil. */
    const deviceToken = cleanString(req.body?.deviceToken);
    if (user.totp_enabled && deviceToken) {
      const trusted = await totpService.isTrustedDevice(user.id, deviceToken);
      if (trusted) {
        await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
        await logAuthEvent({ userId: user.id, email, type: "login", ...context });
        return sendSession(res, user);
      }
    }

    /* Double validation : la connexion attend un code TOTP ou un code de secours. */
    if (user.totp_enabled) {
      await logAuthEvent({ userId: user.id, email, type: "2fa_required", ...context });
      return res.status(403).json({
        code: "TOTP_REQUIRED",
        message: "Entre le code de ton application d'authentification.",
        ticket: signTwoFactorTicket(user),
      });
    }

    await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    await logAuthEvent({ userId: user.id, email, type: "login", ...context });
    return sendSession(res, user);
  })
);

/* ── Mot de passe oublié : envoi du code ───────────────────── */
router.post(
  "/forgot-password",
  authLimiter,
  codeIssueLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const context = requestContext(req);

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: "Adresse email invalide." });
    }

    const user = await findUserByEmail(email);
    await logAuthEvent({ userId: user?.id ?? null, email, type: "forgot_password", ...context });

    if (!user) {
      // Ne révèle pas l'existence du compte.
      return res.json({ sent: true, emailSent: false });
    }

    const sent = await createAndSendCode(user, "reset_password");
    if (sent.cooldown) {
      return res.status(429).json({
        message: `Un code vient déjà d'être envoyé. Réessaie dans ${sent.cooldown} s.`,
        retryAfter: sent.cooldown,
      });
    }
    return res.json({ sent: true, emailSent: sent.delivered, ...devCodePayload(sent.code) });
  })
);

/* ── Réinitialisation du mot de passe ──────────────────────── */
router.post(
  "/reset-password",
  authLimiter,
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = cleanString(req.body?.code).replace(/\s+/g, "");
    const password = req.body?.password;
    const context = requestContext(req);

    if (!EMAIL_PATTERN.test(email) || code.length !== 6) {
      return res.status(400).json({ message: "Renseigne ton email et le code à 6 chiffres." });
    }
    const invalidPassword = passwordError(password, { email });
    if (invalidPassword) {
      return res.status(400).json({ message: invalidPassword });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ message: "Code invalide ou expiré." });
    }

    const result = await verifyCode(user.id, "reset_password", code);
    if (!result.ok) {
      await logAuthEvent({ userId: user.id, email, type: "verify_email_failed", ...context });
      const messages = {
        none: "Code invalide ou expiré. Demande un nouveau code.",
        expired: "Code expiré. Demande un nouveau code.",
        locked: "Trop d'essais. Demande un nouveau code.",
        invalid: `Code incorrect. ${result.attemptsLeft} essai${result.attemptsLeft > 1 ? "s" : ""} restant${result.attemptsLeft > 1 ? "s" : ""}.`,
      };
      return res.status(400).json({ message: messages[result.reason] ?? messages.none });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.execute(
      `UPDATE users
       SET password_hash = ?, token_version = token_version + 1, email_verified = 1, last_login_at = NOW()
       WHERE id = ?`,
      [passwordHash, user.id]
    );
    /* Le changement de mot de passe purge aussi la 2FA de secours et les appareils de confiance. */
    await pool.execute("DELETE FROM auth_backup_codes WHERE user_id = ?", [user.id]);
    await pool.execute("DELETE FROM auth_trusted_devices WHERE user_id = ?", [user.id]);
    await logAuthEvent({ userId: user.id, email, type: "reset_password", ...context });

    const freshUser = await findUserById(user.id);
    return sendSession(res, freshUser);
  })
);

/* ── Finalisation de connexion avec code 2FA ───────────────── */
router.post(
  "/login-2fa",
  authLimiter,
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const ticket = cleanString(req.body?.ticket);
    const code = cleanString(req.body?.code).replace(/[\s-]/g, "").toUpperCase();
    const rememberDevice = Boolean(req.body?.rememberDevice);
    const deviceLabel = cleanString(req.body?.deviceLabel).slice(0, 120) || null;
    const context = requestContext(req);

    if (!ticket) {
      return res.status(400).json({ message: "Session de connexion introuvable. Reconnecte-toi." });
    }

    let payload;
    try {
      payload = verifyTwoFactorTicket(ticket);
    } catch {
      return res
        .status(401)
        .json({ message: "Demande expirée. Reconnecte-toi avec ton mot de passe." });
    }

    const user = await findUserById(payload.sub);
    if (!user || !user.totp_enabled || !user.email_verified) {
      return res.status(401).json({ message: "Demande expirée. Reconnecte-toi." });
    }

    /* Anti-bruteforce spécifique à la 2FA. */
    if ((await totpService.countRecentTwoFactorFailures(user.id)) >= 5) {
      await logAuthEvent({ userId: user.id, email: user.email, type: "2fa_blocked", ...context });
      return res.status(429).json({
        message: "Trop de codes incorrects. Réessaie dans quelques minutes.",
      });
    }

    let usedBackup = false;
    let verified = false;
    if (/^[0-9]{6}$/.test(code)) {
      verified = await totpService.verifyActiveCode(user.id, code);
    } else {
      verified = await totpService.consumeBackupCode(user.id, code);
      usedBackup = verified;
    }

    if (!verified) {
      await logAuthEvent({ userId: user.id, email: user.email, type: "2fa_failed", ...context });
      return res.status(401).json({
        message: usedBackup
          ? "Code de secours invalide."
          : "Code incorrect. Vérifie l'heure de ton téléphone ou utilise un code de secours.",
      });
    }

    await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    await logAuthEvent({
      userId: user.id,
      email: user.email,
      type: usedBackup ? "2fa_backup_used" : "2fa_login",
      ...context,
    });

    const sessionUser = await findUserById(user.id);
    const session = { token: signToken(sessionUser), user: publicUser(sessionUser) };
    if (rememberDevice) {
      session.deviceToken = await totpService.createTrustedDevice(user.id, deviceLabel);
    }
    return res.json(session);
  })
);

/* ── État de la 2FA (écran Sécurité) ───────────────────────── */
router.get(
  "/2fa/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [backupCodesLeft, trustedDevices] = await Promise.all([
      totpService.countUnusedBackupCodes(req.user.id),
      totpService.listTrustedDevices(req.user.id),
    ]);
    return res.json({
      enabled: Boolean(req.userRow.totp_enabled),
      backupCodesLeft,
      trustedDevices,
    });
  })
);

/* ── Démarrage de l'activation 2FA (QR + secret) ───────────── */
router.post(
  "/2fa/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.userRow.totp_enabled) {
      return res
        .status(409)
        .json({ message: "La double validation est déjà activée. Désactive-la d'abord." });
    }
    const setup = await totpService.createPendingSetup(req.userRow, QRCode);
    return res.json({
      secret: setup.secret,
      otpauthUri: setup.otpauthUri,
      qrDataUrl: setup.qrDataUrl,
      expiresInMinutes: totpService.PENDING_TTL_MINUTES,
    });
  })
);

/* ── Confirmation de l'activation (code + codes de secours) ── */
router.post(
  "/2fa/verify",
  requireAuth,
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const code = cleanString(req.body?.code).replace(/\s+/g, "");
    const context = requestContext(req);

    if (!/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({ message: "Entre le code à 6 chiffres de l'application." });
    }

    const result = await totpService.verifyPendingCode(req.user.id, code);
    if (!result.ok) {
      const messages = {
        none: "Aucune activation en cours. Commence par scanner le QR code.",
        expired: "L'activation a expiré. Relance-la.",
        invalid: "Code incorrect. Réessaie.",
      };
      return res.status(400).json({ message: messages[result.reason] ?? messages.none });
    }

    const backupCodes = await totpService.enableForUser(req.user.id, result.secret);
    await logAuthEvent({ userId: req.user.id, email: req.user.email, type: "2fa_enabled", ...context });

    const freshUser = await findUserById(req.user.id);
    return res.json({
      backupCodes,
      user: publicUser(freshUser),
    });
  })
);

/* ── Désactivation (mot de passe + code requis) ────────────── */
router.post(
  "/2fa/disable",
  requireAuth,
  verifyLimiter,
  asyncHandler(async (req, res) => {
    const password = req.body?.password;
    const code = cleanString(req.body?.code).replace(/[\s-]/g, "").toUpperCase();
    const context = requestContext(req);

    if (!req.userRow.totp_enabled) {
      return res.status(409).json({ message: "La double validation est déjà désactivée." });
    }

    const passwordValid = req.userRow.password_hash
      ? await bcrypt.compare(password ?? "", req.userRow.password_hash)
      : false;
    if (!passwordValid) {
      return res.status(401).json({ message: "Mot de passe incorrect." });
    }

    const verified =
      /^[0-9]{6}$/.test(code)
        ? await totpService.verifyActiveCode(req.user.id, code)
        : await totpService.consumeBackupCode(req.user.id, code);
    if (!verified) {
      await logAuthEvent({ userId: req.user.id, email: req.user.email, type: "2fa_failed", ...context });
      return res.status(401).json({ message: "Code incorrect." });
    }

    await totpService.disableForUser(req.user.id);
    await logAuthEvent({
      userId: req.user.id,
      email: req.user.email,
      type: "2fa_disabled",
      ...context,
    });

    const freshUser = await findUserById(req.user.id);
    return res.json({ user: publicUser(freshUser) });
  })
);

/* ── Connexion Google (vérification du jeton côté serveur) ─── */
router.post(
  "/google",
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!googleClient) {
      return res.status(503).json({
        code: "GOOGLE_NOT_CONFIGURED",
        message:
          "La connexion Google n'est pas encore configurée. Ajoute GOOGLE_CLIENT_IDS dans server/.env.",
      });
    }

    const idToken = cleanString(req.body?.idToken);
    if (!idToken) {
      return res.status(400).json({ message: "Jeton Google manquant." });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: config.googleClientIds,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ message: "Jeton Google invalide ou expiré." });
    }

    if (!payload?.sub || !payload.email) {
      return res.status(401).json({ message: "Compte Google incomplet (email indisponible)." });
    }
    if (payload.email_verified === false) {
      return res.status(403).json({ message: "L'email Google doit être vérifié." });
    }

    const email = normalizeEmail(payload.email);
    const name = cleanString(payload.name) || email.split("@")[0];
    const avatarUrl = payload.picture || null;
    const context = requestContext(req);

    const [byGoogle] = await pool.execute("SELECT * FROM users WHERE google_sub = ? LIMIT 1", [
      payload.sub,
    ]);
    let user = byGoogle[0] || null;

    if (user) {
      await pool.execute(
        "UPDATE users SET name = ?, avatar_url = ?, email_verified = 1, last_login_at = NOW() WHERE id = ?",
        [name, avatarUrl, user.id]
      );
    } else {
      const existing = await findUserByEmail(email);
      if (existing) {
        await pool.execute(
          "UPDATE users SET google_sub = ?, avatar_url = ?, email_verified = 1, last_login_at = NOW() WHERE id = ?",
          [payload.sub, avatarUrl, existing.id]
        );
        user = existing;
      } else {
        /* Toute nouvelle inscription est un vendeur : le nom du compte sert
           de nom de boutique par défaut, modifiable ensuite par l'admin. */
        const [result] = await pool.execute(
          `INSERT INTO users
             (name, email, google_sub, avatar_url, email_verified, account_type, shop_name, last_login_at)
           VALUES (?, ?, ?, ?, 1, 'pro', ?, NOW())`,
          [name, email, payload.sub, avatarUrl, name.slice(0, 120)]
        );
        user = await findUserById(result.insertId);
      }
    }

    await logAuthEvent({ userId: user.id, email, type: "login", ...context });
    const freshUser = await findUserById(user.id);
    return sendSession(res, freshUser);
  })
);

/* ── Session courante ──────────────────────────────────────── */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({ user: publicUser(req.userRow) });
  })
);

/* JWT sans état : la déconnexion consiste à supprimer le jeton côté client. */
router.post("/logout", requireAuth, (req, res) => {
  return res.status(204).end();
});

module.exports = router;

const jwt = require("jsonwebtoken");
const config = require("../config");
const pool = require("../db");

/**
 * Vérifie le JWT ET la version du jeton en base :
 * un changement de mot de passe (token_version + 1) invalide
 * immédiatement toutes les sessions existantes.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentification requise." });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  } catch {
    return res.status(401).json({ message: "Session expirée ou invalide. Reconnecte-toi." });
  }

  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ? LIMIT 1", [payload.sub]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: "Compte introuvable." });
    }
    if ((user.token_version ?? 0) !== (payload.tv ?? 0)) {
      return res
        .status(401)
        .json({ message: "Session révoquée. Reconnecte-toi avec ton nouveau mot de passe." });
    }
    req.user = { id: String(user.id), email: user.email };
    req.userRow = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Garde-fou de rôle : « standard » (acheteur) ou « pro » (vendeur).
 * Le compte est déjà chargé par requireAuth (req.userRow).
 */
function requireRole(accountType) {
  return (req, res, next) => {
    if (req.userRow?.account_type !== accountType) {
      const expected = accountType === "pro" ? "un compte professionnel" : "un compte acheteur";
      return res.status(403).json({
        code: "ROLE_REQUIRED",
        message: `Réservé à ${expected}.`,
      });
    }
    return next();
  };
}

/**
 * Garde-fou administrateur : la création des comptes vendeurs
 * est réservée aux comptes marqués is_admin.
 */
function requireAdmin(req, res, next) {
  if (!req.userRow?.is_admin) {
    return res.status(403).json({
      code: "ADMIN_REQUIRED",
      message: "Réservé aux administrateurs.",
    });
  }
  return next();
}

module.exports = { requireAuth, requireRole, requireAdmin };

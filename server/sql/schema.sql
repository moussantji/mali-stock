-- Mali Stock — schéma MySQL (état final)
-- Exécuté automatiquement par `npm run db:init`.
-- Les migrations complémentaires vivent dans scripts/migrate-*.js.

CREATE DATABASE IF NOT EXISTS `mali_stock`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `mali_stock`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `google_sub` VARCHAR(255) NULL,
  `avatar_url` VARCHAR(500) NULL,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `token_version` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `last_login_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_google_sub` (`google_sub`),
  KEY `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `purpose` ENUM('verify_email','reset_password') NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `consumed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_codes_user_purpose` (`user_id`, `purpose`, `created_at`),
  KEY `idx_codes_expires` (`expires_at`),
  CONSTRAINT `fk_codes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `email` VARCHAR(190) NULL,
  `type` ENUM(
    'register', 'login', 'login_failed', 'login_blocked_unverified',
    'verify_email', 'verify_email_failed', 'resend_code',
    'forgot_password', 'reset_password', 'register_rate_limited'
  ) NOT NULL,
  `ip` VARCHAR(64) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_events_user` (`user_id`, `created_at`),
  KEY `idx_events_email` (`email`, `type`, `created_at`),
  CONSTRAINT `fk_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

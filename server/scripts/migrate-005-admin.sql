-- Migration 005 — rôle administrateur
-- Exécutée par migrate-005-admin.js (ajout conditionnel + index).
ALTER TABLE `users`
  ADD COLUMN `is_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `account_type`;

ALTER TABLE `users`
  ADD KEY `idx_users_admin` (`is_admin`);

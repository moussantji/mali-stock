-- Mali Stock — migration 004 : réseau de commerce
-- 1. Types de comptes (standard = acheteur, pro = vendeur) + fiche boutique publique
-- 2. Table orders : commandes comptoir client → vendeur, encaissement, sortie de stock
-- Exécutée par scripts/migrate-004-network.js (idempotent).

ALTER TABLE `users`
  ADD COLUMN `account_type` ENUM('standard', 'pro') NOT NULL DEFAULT 'standard' AFTER `email`,
  ADD COLUMN `shop_name` VARCHAR(120) NULL AFTER `account_type`,
  ADD COLUMN `shop_category` VARCHAR(60) NULL AFTER `shop_name`,
  ADD COLUMN `shop_city` VARCHAR(80) NULL AFTER `shop_category`,
  ADD COLUMN `shop_bio` VARCHAR(280) NULL AFTER `shop_city`;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Client (acheteur)',
  `vendor_id` BIGINT UNSIGNED NOT NULL COMMENT 'Vendeur (pro)',
  `product_id` BIGINT UNSIGNED NOT NULL,
  `quantity` DECIMAL(14, 2) NOT NULL COMMENT 'Quantité demandée par le client',
  `unit_price` DECIMAL(14, 2) NOT NULL COMMENT 'Prix unitaire affiché au moment de la commande',
  `total` DECIMAL(14, 2) NOT NULL,
  `status` ENUM('pending', 'confirmed', 'declined', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `confirmed_quantity` DECIMAL(14, 2) NULL COMMENT 'Quantité ajustée par le vendeur',
  `payment_method` ENUM('cash', 'orange_money', 'moov', 'wave') NULL,
  `payment_reference` VARCHAR(80) NULL,
  `note` VARCHAR(255) NULL COMMENT 'Note du client',
  `vendor_note` VARCHAR(255) NULL COMMENT 'Réponse du vendeur',
  `completed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_orders_vendor_status` (`vendor_id`, `status`, `created_at`),
  KEY `idx_orders_user_created` (`user_id`, `created_at`),
  KEY `idx_orders_product` (`product_id`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

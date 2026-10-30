-- Mali Stock — migration 003 : produits, mouvements de stock
-- Exécutée par scripts/migrate-003-stock.js (idempotent).

CREATE TABLE IF NOT EXISTS `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `sku` VARCHAR(40) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `description` VARCHAR(500) NULL,
  `category` VARCHAR(60) NULL,
  `unit` VARCHAR(24) NOT NULL DEFAULT 'unité',
  `purchase_price` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `sale_price` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `quantity` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `min_quantity` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `barcode` VARCHAR(64) NULL,
  `qr_token` VARCHAR(24) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_user_sku` (`user_id`, `sku`),
  UNIQUE KEY `uq_products_qr_token` (`qr_token`),
  KEY `idx_products_user_created` (`user_id`, `created_at`),
  KEY `idx_products_barcode` (`barcode`),
  CONSTRAINT `fk_products_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('entry', 'exit', 'adjustment') NOT NULL,
  `quantity` DECIMAL(14, 2) NOT NULL,
  `unit_price` DECIMAL(14, 2) NULL,
  `note` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_movements_user_date` (`user_id`, `created_at`),
  KEY `idx_movements_product_date` (`product_id`, `created_at`),
  CONSTRAINT `fk_movements_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_movements_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

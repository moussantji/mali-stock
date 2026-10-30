-- Migration 007 — commandes créées par le vendeur
-- Une commande peut viser un client sans compte (client comptoir).
ALTER TABLE `orders`
  ADD COLUMN `customer_name` VARCHAR(120) NULL AFTER `user_id`,
  ADD COLUMN `customer_phone` VARCHAR(40) NULL AFTER `customer_name`;

ALTER TABLE `orders`
  MODIFY COLUMN `user_id` BIGINT UNSIGNED NULL COMMENT 'Compte client historique (NULL = client comptoir)';

ALTER TABLE `orders`
  DROP FOREIGN KEY `fk_orders_user`;

ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

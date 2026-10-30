-- Migration 006 — application 100 % gestion de stock
-- Tous les comptes deviennent des vendeurs ; les anciens acheteurs sont convertis.
UPDATE `users`
  SET `account_type` = 'pro'
  WHERE `account_type` <> 'pro';

UPDATE `users`
  SET `shop_name` = `name`
  WHERE (`shop_name` IS NULL OR `shop_name` = '') AND `is_admin` = 0;

-- Tout nouveau compte est vendeur par défaut.
ALTER TABLE `users`
  ALTER COLUMN `account_type` SET DEFAULT 'pro';

ALTER TABLE `exercises` ADD `display_order` integer DEFAULT 999 NOT NULL;--> statement-breakpoint
-- これまでの並びは「セット数の多い順」だったので、分割ごとの順位に焼き直す。
-- 移行直後の並びが今までと大きく変わらないようにするため。
-- 10 刻みなのは、あとから間に挟めるようにするため（11 を使えば2番目に入る）。
UPDATE `exercises` SET `display_order` = (
  SELECT `rank` FROM (
    SELECT
      `e`.`id` AS `id`,
      ROW_NUMBER() OVER (
        PARTITION BY `e`.`category`
        ORDER BY count(`s`.`id`) DESC, `e`.`name`
      ) * 10 AS `rank`
    FROM `exercises` `e`
    LEFT JOIN `sets` `s` ON `s`.`exercise_id` = `e`.`id`
    GROUP BY `e`.`id`
  ) `t` WHERE `t`.`id` = `exercises`.`id`
);

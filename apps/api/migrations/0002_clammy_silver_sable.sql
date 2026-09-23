ALTER TABLE `sets` ADD `is_main_set` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- 既存データの初期値。ユーザーと確定した規則（28章）:
--   (ワークアウト, 種目) ごとの**ラスト3セット** ∪ **reps<=1 のセット**（max測定）
-- ここから下は手書き（drizzle-kit は DML を生成しない）。
UPDATE `sets` SET `is_main_set` = true
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `workout_id`, `exercise_id` ORDER BY `set_order` DESC, `id` DESC
    ) AS rn
    FROM `sets`
  ) WHERE rn <= 3
);--> statement-breakpoint
UPDATE `sets` SET `is_main_set` = true WHERE `reps` <= 1;

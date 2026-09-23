CREATE UNIQUE INDEX `workouts_performed_on_unique` ON `workouts` (`performed_on`);--> statement-breakpoint
-- 部位「腹(abs)」を廃止して「その他(other)」に寄せる。
-- 腹筋・アブローラーしか該当せず、分割(category)が既に other なので
-- 部位まで独立させる意味が無かった。ここから下は手書き（drizzle-kit の生成物ではない）。
UPDATE `exercises` SET `muscle_group` = 'other' WHERE `muscle_group` = 'abs';

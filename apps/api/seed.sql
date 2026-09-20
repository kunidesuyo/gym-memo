-- 初期データ。種目はユーザーが追加・編集できるので、これは「最初の中身」に過ぎない。
-- id は固定値にしてある（SQLite に UUID 生成関数が無く、再実行を冪等にしたいため）。
-- 再実行しても安全なように OR IGNORE を使う（id と name に UNIQUE 制約がある）。
INSERT OR IGNORE INTO exercises (id, name, category, muscle_group) VALUES
  ('01a0bf17-b376-7779-828a-c36eec5b701c', 'ベンチプレス', 'push', 'chest'),
  ('01a0bf17-b376-7779-828a-c41694748852', 'インクラインベンチ', 'push', 'chest'),
  ('01a0bf17-b376-7779-828a-c9c44fbd334b', 'ショルダープレス', 'push', 'shoulders'),
  ('01a0bf17-b376-7779-828a-cfc19ecd203a', 'サイドレイズ', 'push', 'shoulders'),
  ('01a0bf17-b376-7779-828a-d2b6b4d790a1', 'ケーブルプッシュダウン', 'push', 'triceps'),
  ('01a0bf17-b376-7779-828a-d5553167fabc', 'デッドリフト', 'pull', 'back'),
  ('01a0bf17-b376-7779-828a-d949a49d6cf3', 'ラットプルダウン', 'pull', 'back'),
  ('01a0bf17-b376-7779-828a-dc41b7a56da9', 'シーテッドロウ', 'pull', 'back'),
  ('01a0bf17-b376-7779-828a-e15dbadf3125', 'バーベルカール', 'pull', 'biceps'),
  ('01a0bf17-b376-7779-828a-e549812ce3c5', 'スクワット', 'legs', 'quads'),
  ('01a0bf17-b376-7779-828a-e8cb61f5b280', 'レッグプレス', 'legs', 'quads'),
  ('01a0bf17-b376-7779-828a-eca9d8f5e8ea', 'レッグカール', 'legs', 'hamstrings'),
  ('01a0bf17-b376-7779-828a-f3f65239a1b2', 'カーフレイズ', 'legs', 'calves');

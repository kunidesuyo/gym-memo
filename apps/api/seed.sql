-- 初期データ。種目はユーザーが追加・編集できるので、これは「最初の中身」に過ぎない。
-- 再実行しても安全なように OR IGNORE を使う（name に UNIQUE 制約がある）。
INSERT OR IGNORE INTO exercises (name, category, muscle_group) VALUES
  ('ベンチプレス',         'push', 'chest'),
  ('インクラインベンチ',   'push', 'chest'),
  ('ショルダープレス',     'push', 'shoulders'),
  ('サイドレイズ',         'push', 'shoulders'),
  ('ケーブルプッシュダウン','push', 'triceps'),
  ('デッドリフト',         'pull', 'back'),
  ('ラットプルダウン',     'pull', 'back'),
  ('シーテッドロウ',       'pull', 'back'),
  ('バーベルカール',       'pull', 'biceps'),
  ('スクワット',           'legs', 'quads'),
  ('レッグプレス',         'legs', 'quads'),
  ('レッグカール',         'legs', 'hamstrings'),
  ('カーフレイズ',         'legs', 'calves');

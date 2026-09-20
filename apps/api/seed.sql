-- 種目マスタの固定シード。フェーズ1では CRUD を作らない方針のため、ここで与える。
-- 再実行しても安全なように OR IGNORE を使う（name に UNIQUE 制約がある）。
INSERT OR IGNORE INTO exercises (name, muscle_group) VALUES
  ('ベンチプレス',       'chest'),
  ('インクラインベンチ', 'chest'),
  ('スクワット',         'legs'),
  ('レッグプレス',       'legs'),
  ('デッドリフト',       'back'),
  ('ラットプルダウン',   'back'),
  ('ショルダープレス',   'shoulders'),
  ('バーベルカール',     'arms');

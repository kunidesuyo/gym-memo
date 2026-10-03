# 17. ID の方式 —— 【決定 2026-09-20】UUIDv7 / 接頭辞なし / API 側発行

### 決定

- **UUIDv7**（`uuid` パッケージの `v7()`）
- **接頭辞なし**（Stripe 風の `wk_...` は採用しない）
- **発行は API 側**（Drizzle の `$defaultFn`）

### なぜアプリ側発行にしたいのか（動機の整理）

1. **オフライン対応**（バックログ6番）— 電波の悪いジムで記録して後から同期するには、
   サーバーに問い合わせずに ID が決まっている必要がある
2. **楽観的更新の仮 ID が要らなくなる** — 1-c では `id: -Date.now()` という負数の仮 ID を使っていた

⚠️ **ただし今回は API 側発行を選んだため、上の2つはまだ実現していない。**
ID の形式が UUID になったので、後からクライアント発行に移すのは小さな変更で済む。
仮 ID は `optimistic-<timestamp>-<random>` という形に変えて残してある。

### 検討した選択肢

| 方式 | 長さ | 時系列順 | 生成 |
|---|---|---|---|
| UUIDv4 | 36 | ❌ | `crypto.randomUUID()` 標準 |
| **UUIDv7** | 36 | ✅ 先頭が時刻 | `uuid` パッケージ。RFC 9562 |
| ULID | 26 | ✅ | `ulid`。Crockford base32 |
| NanoID | 21 | ❌ | `nanoid`。最短 |
| CUID2 | 24前後 | ❌ 意図的に非順序 | `@paralleldrive/cuid2` |
| KSUID | 27 | ✅ | 採用例は少なめ |

### v4 ではなく v7 を選んだ決め手

**既存クエリが `id` をタイブレーカーに使っていた。**

```ts
.orderBy(sets.exerciseId, sets.setOrder, sets.id)          // 同一 setOrder の並び
.orderBy(desc(workouts.performedOn), desc(workouts.id))    // 同日に複数セッションがある場合
```

ランダム ID（v4 / NanoID）にすると**この順序が壊れる**。
`createdAt` で代替する手もあるが、`current_timestamp` は**秒精度**なので同一秒の並びが不定になる。
→ **時系列順の ID を選べばこの問題自体が消える。**

ULID（26文字）と迷ったが、RFC 標準であることを優先して UUIDv7 にした。

### SQLite / D1 固有の話（今回は判断材料にしていない）

`INTEGER PRIMARY KEY` は SQLite では `rowid` の別名で、テーブル本体の B-tree キーそのもの。
TEXT を主キーにすると内部 rowid とは別に主キー索引が1本増える（`WITHOUT ROWID` で回避可）。
**年間1,800行のアプリでは体感差が無い**ので、性能は判断材料にしなかった。

### 実装

```ts
// apps/api/src/db/schema.ts
const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => uuidv7())
```

`$defaultFn` は Drizzle が INSERT 時に呼ぶ。SQLite に UUID 生成関数が無いので、
DB のデフォルト値ではなく ORM 層で採番する形になる。

**Zod 4 には `z.uuidv7()` がある**（`z.uuidv4()` / `z.uuidv6()` も）。
ただし**パスパラメータの検証は `z.uuid()`（版を問わない）にした**。
将来クライアント発行に変えたときに版を縛って困らないようにするため。存在しなければ 404 で返せばよい。

**副作用として 400 と 404 が分かれた**:

```
GET /api/workouts/123                                   → 400（UUID ではない）
GET /api/workouts/01a0bf17-0000-7000-8000-000000000000  → 404（形式は正しいが存在しない）
```

### マイグレーションは squash した

主キーの型変更は SQLite ではテーブル再作成になる。
**まだどこにもデプロイしていない**ので、その再作成を履歴に残すより
最終形1本にしたほうが読みやすいと判断し、`migrations/` を作り直した。
本番稼働後は当然この手は使えない。

### シードの扱い

`seed.sql` は生 SQL なので UUID を生成できない。
**固定の UUIDv7 を13件ハードコード**してある（`INSERT OR IGNORE` で冪等）。

### テストへの影響

存在しない ID の 404 テストで `9999` が使えなくなったので、
**形式は正しいが存在しない UUID** を定数に置いた。

```ts
const MISSING_ID = '01a0bf17-0000-7000-8000-000000000000'
```

型付き MSW フィクスチャも `number` → `string` でコンパイルエラーになり、
ここでも型がドリフトを捕まえた。

### 動作確認

```
① 種目一覧の id が UUID になっている
② POST /api/workouts が UUID を返す
③ セット2件が setOrder 1,2 で並び、メモも入る
④ UUID でない id → 400
⑤ 形式は正しいが存在しない id → 404
⑥ 「前回の記録」が時系列順で正しく引ける
```

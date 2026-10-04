# 34. api の整理 —— クエリ分割 / テスト同居 / 移行コード隔離（2026-10-04）

web を feature 単位にした（32章）あと、api 側に同じ目で入った。

## 問題

| | |
|---|---|
| `db/queries.ts` が395行 | exercise / workout / set の3ドメイン混在。web の `hooks.ts`（365行）と同じ症状 |
| テストの分け方に基準が無い | `routes.test.ts`（21本）に4ドメインが混在、`GET /api/exercises` が2ファイルに重複 |
| `scripts/`（696行）が現役コードと同階層 | 一度きりの移行コードで、もう実行しない |

とくにテストは**「新しいテストをどこに書くか」が毎回判断**になっていた。

## 1. クエリをドメインで分けた

```
db/queries/
├── shared.ts    withKg（3ファイルすべてが使う）
├── exercise.ts  123行
├── workout.ts    63行
└── set.ts       211行
```

`routes.ts` からは3ファイルを**明示的に import** する。バレル（`index.ts` で
再 export）は置かない —— どのドメインの関数かが import 文で分かるほうがよい。

`categoryRank`（分割の並び順の `CASE` 式）は `listExercises` 専用なので
`exercise.ts` に入れた。`getSet` は非公開のまま `set.ts` に残る。

## 2. テストを対象の隣に置いた

⚠️ **`routes.ts` は分割できない**（Hono RPC の型がチェーンで積み上がる）。
なので「対象の隣」に素直に従うと `src/routes.test.ts` の1ファイル850行になり、
**今より悪化する**。

そこで `routes.ts` の隣にリソース単位で置いた。

```
src/
├── routes.ts
├── routes.test.ts             health + onError（ドメインに属さない部分）  3本
├── routes.exercises.test.ts   /api/exercises 以下                      23本
├── routes.workouts.test.ts    /api/workouts 以下（ぶら下がる sets も）  20本
├── routes.sets.test.ts        /api/sets 以下                           10本
├── db/
│   ├── weight.test.ts                                                  5本
│   └── queries/
│       ├── set.test.ts        addSet / getLastSets（HTTP を通さない）    5本
│       └── workout.test.ts    getWorkout                                2本
└── migration/*.test.ts                                                 26本
```

> **どのファイルに書くかは、パスの先頭で決まる。**
> `/api/exercises/:id/last-sets` は「最後のセット」の話だが `routes.exercises` に置く。
> 意味で迷わせず、機械的に決まるほうがよい。

`test/` に残したのは **`helpers.ts` / `setup.ts` / `env.d.ts`** だけ
（web が msw と utils だけ置いているのと同じ形）。

### 副産物: 定型文の重複が消えた

5ファイルが `MISSING_ID` / `BASE` / `send()` / `beforeEach(resetDb + seedExercises)`
を**それぞれ持っていた**。`helpers.ts` に上げて共通化した。

### ⚠️ 本数を機械的に照合した

ブロック単位で切り出して配り直す作業なので、テストが消えても気づけない。
変更前後の `it(...)` の**名前を突き合わせて**、失われたものがゼロであることを
確認した（68本 → 68本、migration の26本を含めて94本）。

実際、組み立て時に `exports` と `post` の import が落ちて3本落ちた。
名前の照合がなければ「本数が合っているから大丈夫」で見逃していた。

## 3. 移行コードを隔離した

`scripts/` → `migration/`。README に**もう実行しない**ことと、
それでもテストを残す理由を書いた。

⚠️ `parse-cell` は**読めないトークンを例外も出さずに読み飛ばす**という一番こわい
壊れ方をしている（セットが丸ごと消えても件数以外に痕跡が残らない。28章）。
再移行するならこのテストが唯一の防具になる。

⚠️ `tsconfig.json` の `include` に `migration` を追加した。`scripts/` は
**include に入っておらず**、テストが import することでたまたまプログラムに
入っていただけだった。

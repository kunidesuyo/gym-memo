# 35. loader と Query のキャッシュ（2026-10-05）

`/workouts/$workoutId` に TanStack Router の `loader` を入れ、画面を
`useSuspenseQuery` にした。**キャッシュが2つ出てくるので、どちらが何をするかを
実測で確かめた記録。**

## 構成

```
main.tsx       createRouter({ routeTree, context: { queryClient } })
__root.tsx     createRootRouteWithContext<{ queryClient }>()
api.ts         workoutQueryOptions(id)  ← loader と画面が共有
$workoutId     loader: queryClient.query({ ...options, staleTime: 'static' })
WorkoutDetail  useSuspenseQuery(workoutQueryOptions(id))
```

⚠️ **`useLoaderData` は使わない。** loader の戻り値は捨て、受け渡しは Query の
キャッシュ（同じ queryKey）経由。楽観的更新が `qc.setQueryData` で Query 側を
直接書き換えているので、画面が Router 側を読んでいると反映されない。

## 役割分担

| | 役目 |
|---|---|
| **loader**（`staleTime: 'static'`） | 「描く前にデータが在る」ことを保証する。取り直さない |
| **useSuspenseQuery** | 鮮度を見る。1秒以上経っていれば裏で取り直す |

即座に出して裏で更新する形（SWR）。loader でネットワークを待つと**遷移が毎回
待ちになる**ので `staleTime: 'static'`。鮮度は画面側が見るので取りこぼさない。

### なぜ1秒か —— 実測

`useSuspenseQuery` は `staleTime` を**最低1秒に切り上げる**。

```js
// @tanstack/react-query の suspense.js
const MIN_SUSPENSE_TIME_MS = 1e3
const clamp = (v) => v === "static" ? v : Math.max(v ?? MIN_SUSPENSE_TIME_MS, MIN_SUSPENSE_TIME_MS)
```

キャッシュを入れた直後と1.2秒後に画面を開いて fetch 回数を数えた。

| キャッシュの古さ | fetch |
|---|---|
| 0ms 前 | **0回**（1秒以内なので新鮮扱い） |
| 1200ms 前 | **1回**（裏で取り直す） |

⚠️ 当初これを「`suspense: true` だからマウント時に取り直さない」と説明していたが
**誤り**。切り上げが理由で、1秒経てば取り直す。

## Router のキャッシュは「門番」

Router も loader の戻り値を保存しているが、`useLoaderData` を使わないので
**誰も読まない**。効いているのは **「loader を走らせるかどうか」の判断**だけ。

loader が走った回数を数えて確かめた。

| 操作 | 設定 | loader の実行回数 |
|---|---|---|
| preload → 遷移 | 既定 | 1 → **2**（遷移時も走る） |
| preload → preload | 既定（30秒） | 1 → **1**（飛ばした） |
| preload → preload | `defaultPreloadStaleTime: 0` | 1 → **2**（毎回走る） |

- **遷移時は必ず loader が走る**（Router の `staleTime` 既定 0）
- 飛ばすのは **preload を30秒以内に繰り返したときだけ**（`preloadStaleTime` 既定 30秒）

公式も `defaultPreloadStaleTime: 0` を
「**preload** の鮮度判断を外部キャッシュに委ねる」ための指定として書いていて、
遷移の話ではない。

> To let an external cache make the freshness decision, set
> `routerOptions.defaultPreloadStaleTime` or `routeOptions.preloadStaleTime` to `0`.
> —— [Preloading](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)

⚠️ **このアプリは `defaultPreload` を設定していないので preload が起きない。**
よって現状 `defaultPreloadStaleTime` は何も変えない。先読みを入れるときに
セットで検討する。

## useSuspenseQuery に寄せて消えたもの

```diff
- if (workout.isPending) return <p>読み込み中...</p>
- if (workout.error) return <p role="alert">{workout.error.message}</p>
- const groups = groupByExercise(workout.data?.sets ?? [])
+ const groups = groupByExercise(workout.data.sets)
```

失敗は throw されるので、ルートの `errorComponent` が受け止める。

⚠️ **`useLastSets` は寄せられない。** `useSuspenseQuery` は
`enabled` / `throwOnError` / `placeholderData` を受け付けない（型定義で `OmitKeyof`）。
`useLastSets` は「種目を選ぶまで叩かない」ために `enabled` を使っている。

⚠️ **同じコンポーネントで複数の `useSuspenseQuery` は直列になる**（実装の JSDoc に
「request waterfall」と明記）。`WorkoutDetail` には3つのクエリがあるので、
全部寄せるなら `useSuspenseQueries` が要る。今回 `useWorkout` だけにしたので踏んでいない。

## 踏んだもの

**`ensureQueryData` / `fetchQuery` はどちらも deprecated**（型定義の `@deprecated`）。
`query()` が両方を置き換え、`staleTime: 'static'` の有無で使い分ける。

**テストを2回作り直した。** どちらも「対象を外しても通る」= 何も検証していない状態だった。

1. `await findByText` の後に見ていた → その時点では表示が消えている
2. `isPending` の分岐が消えたので、判別点そのものが無くなった

最終的な判別点は **1ティック後の DOM**。

| | 同期直後 | 1ティック後 | 完了 |
|---|---|---|---|
| loader あり | 空 | 空 | 一気に描画 |
| loader なし | 空 | **ナビだけ** | 本体が入る |

loader があると Router がルート解決まで何も描かないので、`__root.tsx` の
ナビすら出ない。⚠️ **本物のルートツリーで描かないと検証にならない**
（`test/utils.tsx` の `renderWithRouter` は独自ツリーなので loader を通らない）。

## 自分の失敗の記録

この作業中、**裏を取らずに書いたことが4回**あった（33章の規約を足した理由）。

- 検索結果の要約を公式の引用として扱い、不要な設定を勧めた
- 「`suspense: true` だから取り直さない」と実装を読まずに書いた
- 「キャッシュの持ち主は Query だけ」と確かめずにコメントに断言した
- 「`useLoaderData` を使わないのが定番」と公式を見る前に言った

いずれも型定義・実装・公式本文・実測で確かめられた。**順序が逆だった。**

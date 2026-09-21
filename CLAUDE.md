# gym-memo

自分専用の筋トレ記録アプリ。**技術学習が主目的**（TanStack 系 → Terraform/Cloudflare の順で優先）。

設計判断の経緯・検討した代案・踏んだ落とし穴は **`docs/design-notes.md`** に全部ある。
「なぜこうなっているのか」はまずそちらを見ること。

## アーキテクチャ

**1つの Cloudflare Worker が SPA と API の両方を返す。**

```
/assets/*.js   → 静的アセット（CDN が直接返す。Worker は起動しない）
/api/*         → Worker → Hono → Drizzle → D1
/workouts/42   → 静的なし → SPA フォールバックで index.html
```

コードは分離、デプロイは1つ。型は Hono RPC で `apps/api` → `apps/web` に貫通する。

```
apps/api   Hono + Drizzle + D1     Worker のエントリ
apps/web   React + Vite + TanStack  SPA
infra      Terraform（フェーズ2で作る。まだ空）
docs       design-notes.md
```

## コマンド

```bash
pnpm dev              # wrangler dev (:8787) + vite (:5180) を並列起動
pnpm test             # 全パッケージのテスト
pnpm -r typecheck
pnpm build
pnpm check:fix        # Biome

pnpm db:generate      # スキーマ差分から SQL 生成（drizzle-kit）
pnpm db:migrate:local # ローカル D1 に適用
pnpm db:seed:local    # 種目マスタ投入
pnpm db:reset:local   # .wrangler を消してやり直し
pnpm types            # wrangler types 再生成（wrangler.jsonc を変えたら）
```

ローカル実行は **完全にローカル**（workerd + SQLite）。Cloudflare への通信も課金も無い。

## 守るべき規約

コメントにも書いてあるが、破ると壊れるものを列挙する。

**`apps/api/src/schema/` に Drizzle / D1 を import しない**
web 側からも import する共有領域。混ざるとサーバーコードがフロントのバンドルに入る。

**`apps/api/src/routes.ts` のメソッドチェーンを崩さない**
Hono RPC の型はチェーンで積み上がる。途中で変数に代入して分けると型が消える。
web が型解決するのはこのファイルだけ（`api/routes` として export）。Worker エントリの `index.ts` は読まない。

**成功レスポンスに `c.json(x, 200)` と明示する**
省くとステータスが `ContentfulStatusCode` になり、zValidator の 400 が生えたとき
`InferResponseType<..., 200>` で絞れなくなる。

**`InferResponseType` には必ず `, 200` を付ける**
付けないと 400 のエラー型とのユニオンになる。型の定義は `apps/web/src/api/hooks.ts` に集約。

**`mutateAsync` を await した後に `mutation.isError` を見ない**
レンダー時点の古い値を掴んでいる。`try` / `catch` で Promise の結果から判断する。
（これで2回バグった。18章・21章）

**`wrangler d1` に `--local` を忘れない**
付けないと本番の D1 に流れる。scripts に固めてあるのでそれを使う。

**テストのストレージ分離は「テストファイル単位」**
同一ファイル内のテストは D1 の状態を共有する。`beforeEach` で `resetDb()` すること。
削除順序は FK の都合で sets → workouts → exercises。

**削除・更新は失敗系こそテストする**
成功時しか試さないと上記のクロージャバグのようなものを見逃す。

## 意図的にそうしているもの（直さないこと）

- **主キーは UUIDv7**。v4 ではない。`id` をソートのタイブレーカーに使っているため（17章）
- **ネイティブ `<select>` を使っている**。スマホでは OS のピッカーが開くほうが UX が良い（20章）
- **shadcn の `form` コンポーネントは入れない**。中身が react-hook-form で TanStack Form と競合する（20章）
- **種目の絞り込みはクライアント側**。十数件しかないので API を叩かない（21章）
- **種目削除は物理削除 + 使用中なら 409**。アーカイブ方式は検討のうえ不採用（15章）

## 環境の癖

- **TypeScript 7 は `baseUrl` を廃止**。`paths` だけで `@/` を張る
- **Biome の対象外**: `components/ui/`（shadcn 生成物）、`routeTree.gen.ts`、`src/index.css`（Tailwind v4 構文を CSS パーサが読めない）、`worker-configuration.d.ts`
- **`worker-configuration.d.ts` はコミットする**。生成物だが、無いと clone 直後の typecheck が落ちる
- `wrangler dev` を止めたつもりで `workerd` が残っていることがある。API の挙動が実装と食い違ったら
  `lsof -nP -iTCP:8787 -sTCP:LISTEN` を見る

## 現在地

**フェーズ1 と MVP は完了**（テスト79本）。次は**フェーズ2 = Cloudflare へのデプロイ**。
アカウント作成とドメイン購入がそこで必要になる。

バックログ（画像アップロード/R2、グラフ、PR、オフライン対応 など）は `docs/design-notes.md` 15章。

## スキルの読み込み（TanStack Intent）

以下は `npx @tanstack/intent install` が生成した管理ブロック。
TanStack のスキルは `node_modules` 内にあり Claude Code のスキャン対象外なので、
この案内を頼りに必要時だけ読みに行く。**手で編集しないこと**（再実行時に上書きされる）。

<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `pnpm dlx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm dlx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

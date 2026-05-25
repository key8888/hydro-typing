# HydroOJ アーキテクチャ全体像

> 対象バージョン: HydroOJ v5, @hydrooj/framework v0.3.0
> 更新日: 2026-05-25

---

## 1. リポジトリ構成

HydroOJ 本体はモノレポ構成。プラグイン開発者が特に関心を持つパッケージは以下の通り:

```
Hydro/
  framework/
    framework/          ← @hydrooj/framework (コアフレームワーク)
      server.ts         Handler, ConnectionHandler, WebService (ルーター, レイヤー)
      decorators.ts     @param, @get, @post, @route, @subscribe デコレータ
      error.ts          エラークラス階層
      router.ts         Router (KoaRouter 拡張 + WebSocket)
      validator.ts      型バリデータ (Types とバリデーション)
      index.ts          再エクスポート
  packages/
    hydrooj/            ← hydrooj (メインパッケージ)
      src/
        context.ts      Context, ApiMixin (injectUI, addScript, provideModule)
        interface.ts    全インターフェース定義 (HydroGlobal, Model, DocType 等)
        plugin-api.ts   プラグイン公開API (plugin が import するもの)
        error.ts        PermissionError, PrivilegeError 等の追加エラー
        handler/        組込みハンドラ (参考実装)
        model/          データモデル (document, user, problem 等)
        service/        サービス (db, server, bus, layers 等)
        lib/            ユーティリティ (ui, i18n, avatar 等)
```

### 1.1 依存関係

```mermaid
graph TD
    Plugin --> hydrooj
    hydrooj --> @hydrooj/framework
    hydrooj --> @hydrooj/common
    hydrooj --> @hydrooj/utils
    @hydrooj/framework --> koa
    @hydrooj/framework --> cordis
```

### 1.2 レイヤー構造 (Middleware Stack)

リクエスト処理は以下のレイヤーを順に通過する:

```
HTTP Request
  │
  ▼
Koa ミドルウェア (CORS, Body Parser, Compress)
  │
  ▼
Server Layers (addServerLayer):
  ├── addon_public (静的ファイル配信 - koa-static-cache)
  └── domain (ドメイン解決)
  │
  ▼
Handler Layers (addHandlerLayer / addLayer):
  ├── base (セッション, UiContext, クッキー)
  ├── user (ユーザー情報解決)
  └── init (レート制限, ログイン方法)
  │
  ▼
Router → Handler メソッドチェーンへ
```

---

## 2. コアコンセプト

### 2.1 Context (Cordis Context)

HydroOJ は [Cordis](https://github.com/cordiverse/cordis) フレームワーク上に構築されている。
`Context` は DI コンテナであり、全サービスのアクセスポイント。

**プラグインから利用可能な Context のプロパティ:**

| プロパティ | 型 | 説明 | 提供元 |
|-----------|-----|------|--------|
| `ctx.server` | `WebService` | サーバーサービス（ルーティング、レンダリング） | @hydrooj/framework |
| `ctx.db` | `MongoService` | データベースサービス | hydrooj |
| `ctx.i18n` | `I18nService` | 国際化サービス | hydrooj |
| `ctx.loader` | `Loader` | プラグインローダー | hydrooj |
| `ctx.check` | `CheckService` | ヘルスチェック | hydrooj |
| `ctx.broadcast` | `Function` | イベントブロードキャスト | hydrooj |
| `ctx.injectUI` | `Function` | UI インジェクション | hydrooj |
| `ctx.addScript` | `Function` | スクリプト登録 | hydrooj |
| `ctx.provideModule` | `Function` | モジュール提供 | hydrooj |
| `ctx.on` | `Function` | イベント購読 | cordis |
| `ctx.plugin` | `Function` | サブプラグイン読み込み | cordis |
| `ctx.emit` | `Function` | イベント発行 | cordis |
| `ctx.parallel` | `Function` | 並列イベント発行 | cordis |
| `ctx.serial` | `Function` | 直列イベント発行 | cordis |
| `ctx.effect` | `Function` | 副作用の登録（クリーンアップ管理） | cordis |

### 2.2 グローバルオブジェクト: `global.Hydro`

`global.Hydro` は HydroOJ 全体の共有状態を保持する:

```typescript
interface HydroGlobal {
  version: Record<string, string>;        // バージョン情報
  model: Model;                           // 全モデルのレジストリ
  script: Record<string, Script>;         // CLI スクリプト
  module: ModuleInterfaces;               // 拡張モジュール
  ui: UI;                                 // UI ノード
  error: typeof import('./error');        // エラークラス
  Logger: Logger;                         // ロガー
  logger: typeof import('./logger').logger;
  locales: Record<string, Record<string, string>>;  // ロケールデータ
}
```

プラグインは `global.Hydro.model` にモデルを追加することで、他のプラグインから利用可能になる。

### 2.3 プラグインの読み込みフロー

```
1. HydroOJ 起動
2. Loader が ~/.config/hydro/plugins.json を読み込む
3. 全プラグインの apply(ctx: Context) を呼び出す
4. 各プラグインは以下を実行:
   a. Route 登録
   b. UI インジェクション
   c. i18n 読み込み
   d. モデル登録 (global.Hydro.model)
   e. イベント購読 (ctx.on)
5. サーバーがリッスン開始
```

---

## 3. プラグイン開発の基本パターン

### 3.1 最小限のプラグイン

```typescript
// index.ts
import { Context, Handler, PRIV } from 'hydrooj';

class MyHandler extends Handler {
  async get() {
    this.response.body = { message: 'Hello from plugin!' };
    this.response.template = null; // JSON レスポンス
  }
}

export async function apply(ctx: Context) {
  ctx.Route('my_route', '/my-path', MyHandler, PRIV.PRIV_USER_PROFILE);
}
```

### 3.2 プラグインのエクスポート規約

- `apply(ctx: Context)` を `export` する（必須）
- 関数は `async` でも可
- 関数内で副作用を登録し、クリーンアップは `ctx.effect()` に任せる

### 3.3 推奨ディレクトリ構成

```
my-plugin/
  index.ts            # エントリポイント (apply 関数のみ)
  features/            # 機能モジュール
    typing.ts          # applyTyping を export
    blog.ts            # applyBlog を export
  utils/               # ユーティリティ
    helper.ts
  templates/           # Nunjucks テンプレート
    my-page.html
  public/              # 静的ファイル (CSS/JS)
    my-style.css
    my-script.js
```

---

## 4. 型システムの拡張

### 4.1 DocType の登録

カスタムドキュメントタイプを HydroOJ の型システムに登録する:

```typescript
import { DocumentModel } from 'hydrooj';

export const TYPE_MY_CONTENT = 80 as const;

export interface MyDoc {
  docType: 80;
  docId: ObjectId;
  owner: number;
  title: string;
  content: string;
}

declare module 'hydrooj' {
  interface DocType {
    [TYPE_MY_CONTENT]: MyDoc;
  }
}
```

**注意:** ドキュメントタイプはプラグイン間で重複してはいけない。
現在使用されているタイプ:

| 定数 | 値 | 用途 |
|------|-----|------|
| `TYPE_PROBLEM` | 10 | 問題 |
| `TYPE_PROBLEM_SOLUTION` | 11 | 問題の解法 |
| `TYPE_PROBLEM_LIST` | 12 | 問題リスト |
| `TYPE_DISCUSSION_NODE` | 20 | ディスカッションノード |
| `TYPE_DISCUSSION` | 21 | ディスカッション |
| `TYPE_DISCUSSION_REPLY` | 22 | ディスカッション返信 |
| `TYPE_CONTEST` | 30 | コンテスト |
| `TYPE_CONTEST_CLARIFICATION` | 31 | コンテスト質問 |
| `TYPE_CONTEST_PRINT` | 32 | コンテスト印刷 |
| `TYPE_TRAINING` | 40 | トレーニング |

### 4.2 Model の登録

カスタムモデルを HydroOJ のモデルレジストリに追加する:

```typescript
// 型拡張
declare module 'hydrooj' {
  interface Model {
    myModel: typeof MyModel;
  }
}

// ランタイム登録
global.Hydro.model.myModel = MyModel;
```

### 4.3 Collections の拡張

MongoDB コレクションの型を登録する:

```typescript
declare module 'hydrooj' {
  interface Collections {
    myCollection: MyDoc;
  }
}
```

こうすることで `ctx.db.collection('myCollection')` が型安全になる。

---

## 5. 主要ファイルマップ

| HydroOJ ソース | 内容 | プラグイン開発者にとっての重要度 |
|----------------|------|--------------------------------|
| `@hydrooj/framework/server.ts` | Handler 基底、WebService、レイヤーシステム | ★★★ (Handler 継承に必須) |
| `@hydrooj/framework/decorators.ts` | @param, @get, @post 等のデコレータ | ★★★ (パラメータ解決に必須) |
| `@hydrooj/framework/error.ts` | エラークラス階層 | ★★★ (エラー処理に必須) |
| `@hydrooj/framework/validator.ts` | Types とバリデーション | ★★★ (入力検証に必須) |
| `@hydrooj/framework/router.ts` | Router + WebSocket レイヤー | ★★☆ (特殊な場合のみ) |
| `hydrooj/src/service/server.ts` | Handler 拡張、requireSudo、handlerMixin | ★★★ (実際の Handler 実装) |
| `hydrooj/src/context.ts` | Context、ApiMixin、injectUI | ★★★ (プラグインAPI) |
| `hydrooj/src/interface.ts` | 全インターフェース定義 | ★★★ (型定義の参照) |
| `hydrooj/src/model/document.ts` | DocumentModel (add/get/set/delete 等) | ★★★ (モデル操作) |
| `hydrooj/src/model/builtin.ts` | PRIV, PERM 定数 | ★★★ (権限管理) |
| `hydrooj/src/lib/ui.ts` | UI インジェクション実装 | ★★☆ (UI 拡張) |
| `hydrooj/src/lib/i18n.ts` | i18n 実装 | ★★☆ (多言語対応) |
| `hydrooj/src/service/db.ts` | MongoDB サービス | ★★★ (データベース) |
| `hydrooj/src/service/layers/*.ts` | ミドルウェアレイヤー | ★☆☆ (プラグインでは変更不可) |
| `hydrooj/src/handler/*.ts` | 組込みハンドラ | ★★★ (実装の参考) |

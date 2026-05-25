# プラグインエントリポイントと Context API

> ソース: `Hydro/packages/hydrooj/src/context.ts`
> ソース: `Hydro/packages/hydrooj/src/plugin-api.ts`

---

## 1. プラグインエントリポイント

すべての HydroOJ プラグインは `apply(ctx: Context)` 関数を `export` する。

```typescript
import { Context } from 'hydrooj';

export async function apply(ctx: Context) {
  // プラグイン初期化処理
  // - ルート登録
  // - UI インジェクション
  // - i18n 読み込み
  // - モデル登録
  // - イベント購読
}
```

**制約:**
- `apply` という名前でなければならない
- 1引数 `ctx: Context` を受け取る
- `async` は任意（非推奨だが同期的でも可）
- ファイルは `index.ts` である必要はないが、`package.json` の `main` フィールドで指定する

### 1.1 プラグインの登録方法

HydroOJ の設定ファイル `~/.config/hydro/plugins.json`:

```json
[
  "hydro-typing",
  "hydroj",
  "my-custom-plugin"
]
```

各要素は npm パッケージ名、またはローカルパスの絶対パス。

---

## 2. Context API リファレンス

### 2.1 `ctx.Route(name, path, Handler, ...permPrivChecker)`

HTTP ルートを登録する。

**シグネチャ:**
```typescript
ctx.Route(
  name: string,           // ルート名 (URL 逆引きに使う)
  path: string,           // パス (例: '/typing', '/blog/:uid/:did')
  Handler: typeof Handler, // Handler クラス
  ...permPrivChecker: Array<number | bigint | Function | number[] | bigint[]>
                          // 権限チェッカー (PRIV, PERM, カスタム関数)
): void
```

**使用例:**
```typescript
// PRIV のみ
ctx.Route('typing_main', '/typing', TypingHandler, PRIV.PRIV_USER_PROFILE);

// PERM + PRIV
ctx.Route('problem_main', '/problem', ProblemHandler, PERM.PERM_VIEW_PROBLEM, PRIV.PRIV_USER_PROFILE);

// カスタムチェッカー関数
ctx.Route('special', '/special', SpecialHandler, (h) => h.user._id === 1);

// 権限なし (誰でもアクセス可能)
ctx.Route('public_page', '/public', PublicHandler);

// 複数の PRIV/PERM を OR 条件で
ctx.Route('multi', '/multi', MultiHandler, [PRIV.PRIV_USER_PROFILE, PRIV.PRIV_EDIT_SYSTEM]);
```

**権限チェッカーの動作:**
- `number`: `PRIV` 定数として扱われる。ユーザーがその priv を持っているかチェック
- `bigint`: `PERM` 定数として扱われる。ユーザーがその perm を持っているかチェック
- `Function`: カスタムチェッカー。`false` を返すとアクセス拒否
- `number[]` / `bigint[]`: OR 条件。いずれか1つ満たせば許可

**URL 逆引き:**
```typescript
// Handler 内で URL を生成
this.url('typing_main');                          // → '/typing'
this.url('blog_detail', { uid: 1, did: 'abc' });  // → '/blog/1/abc'
this.url('blog_detail', { uid: 1, did: 'abc', query: { page: 2 } }); // → '/blog/1/abc?page=2'
```

---

### 2.2 `ctx.injectUI(slot, name, args, ...permPrivChecker)`

UI コンポーネントを HydroOJ の特定スロットに注入する。

**シグネチャ:**
```typescript
ctx.injectUI(
  slot: UIInjectableFields,  // 注入先スロット
  name: string,              // ノード名 (重複防止)
  args?: Record<string, any> | ((handler: Handler) => Record<string, any>),
                             // テンプレートに渡す引数 または ファクトリ関数
  ...permPrivChecker: PermPrivChecker  // 権限チェッカー
): void
```

**利用可能なスロット:**
```typescript
type UIInjectableFields =
  | 'ProblemAdd'        // 問題追加メニュー
  | 'Notification'      // 通知エリア
  | 'Nav'               // メインナビゲーション
  | 'UserDropdown'      // ユーザードロップダウン
  | 'DomainManage'      // ドメイン管理
  | 'ControlPanel'      // コントロールパネル
```

**使用例 (Nav に追加):**
```typescript
// 静的な引数
ctx.injectUI('Nav', 'typing_main', {
  icon: 'keyboard',
  displayName: 'Typing',
  prefix: 'typing',
}, PRIV.PRIV_USER_PROFILE);

// 動的な引数 (ファクトリ関数)
ctx.injectUI('Nav', 'record_main', {
  prefix: 'record',
  query: (handler) => handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)
    ? { uidOrName: handler.user._id }
    : {},
}, PRIV.PRIV_USER_PROFILE);

// UserDropdown に追加 (ユーザーID を動的に渡す)
ctx.injectUI('UserDropdown', 'blog_main', (h) => ({
  icon: 'book',
  displayName: 'Blog',
  uid: h.user._id.toString(),
}), PRIV.PRIV_USER_PROFILE);
```

**テンプレート側のレンダリング:**
HydroOJ のベーステンプレート (`layout/basic.html`) が自動的に `injectUI` で登録されたノードをレンダリングする。
各スロット用の Nunjucks マクロが用意されている:

```
{% for node in UiContext.Nav %}
  <!-- Nav ノードをレンダリング -->
{% endfor %}
```

`args` に指定した値はノードのコンテキストとしてテンプレート内で参照できる。

---

### 2.3 `ctx.i18n.load(lang, translationMap)`

翻訳データを読み込む。

**シグネチャ:**
```typescript
ctx.i18n.load(
  lang: string,                        // 言語コード ('zh', 'zh_TW', 'en', 'kr', 'ja')
  translationMap: Record<string, string>  // 翻訳マップ
): void
```

**使用例:**
```typescript
ctx.i18n.load('zh', {
  "{0}'s blog": '{0} 的博客',
  'Blog': '博客',
  'blog_detail': '博客详情',
  'blog_edit': '编辑博客',
  'blog_main': '博客',
});
ctx.i18n.load('en', {
  blog_main: 'Blog',
  blog_detail: 'Blog Detail',
  blog_edit: 'Edit Blog',
});
```

**翻訳の使用 (テンプレート内):**
```nunjucks
{{ _('Blog') }}           <!-- → "博客" (zh), "Blog" (en) -->
{{ _('{0}\'s blog', uname) }}  <!-- → "shisei 的博客" -->
```

**翻訳の使用 (ハンドラ内):**
```typescript
this.translate('Blog');   // → 翻訳後の文字列
```

**言語の解決順序:**
1. ユーザー設定 `viewLang`
2. セッション言語
3. ブラウザの Accept-Language
4. システム設定 `server.language`
5. 原文フォールバック

---

### 2.4 `ctx.addScript(name, description, validate, run)`

CLI スクリプトを登録する。`hydrooj script <name>` で実行可能。

**シグネチャ:**
```typescript
ctx.addScript(
  name: string,
  description: string,
  validate: Schema<K>,
  run: (args: K, report: Function) => boolean | Promise<boolean>
): void
```

**使用例:**
```typescript
import Schema from 'schemastery';

ctx.addScript('my-script', 'My custom script', Schema.object({
  dryRun: Schema.boolean().default(true),
}), async (args, report) => {
  report({ message: 'Starting...' });
  // 何か処理
  report({ message: 'Done!' });
  return true;
});
```

---

### 2.5 `ctx.provideModule(type, id, module)`

拡張モジュールを提供する。他のプラグインがこのモジュールを利用できる。

**シグネチャ:**
```typescript
ctx.provideModule(
  type: keyof ModuleInterfaces,  // 'hash' | 'problemSearch'
  id: string,                     // モジュール識別子
  module: ModuleInterfaces[type]  // モジュール実装
): void
```

**利用可能なモジュールタイプ:**
```typescript
interface ModuleInterfaces {
  hash: (password: string, salt: string, user: User) => boolean | string | Promise<string>;
  problemSearch: ProblemSearch;
}
```

---

### 2.6 `ctx.on(event, handler)`

イベントを購読する。

**シグネチャ:**
```typescript
ctx.on(
  event: keyof EventMap | string,
  handler: (...args: any[]) => any
): void
```

**利用可能なイベント (一部):**

| イベント | 引数 | 説明 |
|---------|------|------|
| `'app/started'` | なし | アプリ起動完了 |
| `'app/ready'` | なし | アプリ準備完了 |
| `'app/exit'` | なし | アプリ終了時 |
| `'database/connect'` | `(db: Db)` | DB接続完了 |
| `'document/add'` | `(doc: any)` | ドキュメント追加時 |
| `'document/set'` | `(domainId, docType, docId, $set, $unset)` | ドキュメント更新時 |
| `'user/get'` | `(udoc: User)` | ユーザー取得時 |
| `'domain/create'` | `(ddoc: DomainDoc)` | ドメイン作成時 |
| `'domain/delete'` | `(domainId: string)` | ドメイン削除時 |
| `'handler/create'` | `(h: Handler)` | ハンドラインスタンス作成時 |

**使用例:**
```typescript
ctx.on('app/started', () => {
  console.log('App started!');
});

ctx.on('document/add', (doc) => {
  if (doc.docType === TYPE_BLOG) {
    console.log('Blog post created:', doc.title);
  }
});
```

---

### 2.7 `ctx.plugin(plugin, config?)`

サブプラグインを動的に読み込む。

```typescript
ctx.plugin(WebService, {
  port: 8080,
  host: '0.0.0.0',
});
```

---

### 2.8 `ctx.effect(dispose)` / `ctx.effect(factory)`

副作用を登録する。`factory` が返す関数はクリーンアップ時に呼ばれる。

```typescript
ctx.effect(() => {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);  // クリーンアップ
});
```

プラグインがアンロードされる（開発ホットリロードなど）ときに自動的にクリーンアップが実行される。

---

## 3. 公開されているすべての import

`hydrooj` パッケージから import できるもの（`Hydro/packages/hydrooj/src/plugin-api.ts` より）:

```typescript
// フレームワークコア
import {
  Context, Handler, ConnectionHandler,
  Service, Fiber, FiberState,
  HandlerCommon, WebService,
  Router, httpServer,
  Mutation, Query, Subscription, Apis, APIS,
} from 'hydrooj';

// デコレータとバリデータ
import {
  param, get, post, route, query, subscribe,
  Types,
  Converter, Validator, Type,
} from 'hydrooj';

// エラー
import {
  HydroError, UserFacingError, SystemError,
  BadRequestError, ForbiddenError, NotFoundError,
  MethodNotAllowedError, ValidationError,
  CsrfTokenError, InvalidOperationError, FileTooLargeError,
  PermissionError, PrivilegeError,
  UserNotFoundError, DocumentNotFoundError, DiscussionNotFoundError,
  ProblemNotFoundError, ContestNotFoundError,
  // ... その他多数
} from 'hydrooj';

// モデル
import {
  DocumentModel, UserModel, ProblemModel, RecordModel,
  SystemModel, TokenModel, ScheduleModel, SolutionModel,
  MessageModel, OauthModel, BlackListModel, DomainModel,
  StorageModel, TaskModel,
  TrainingModel, OpcountModel, OplogModel, SettingModel,
  DiscussionModel, BuiltinModel,
  DocType, Collections,
} from 'hydrooj';

// 権限
import {
  PRIV, PERM,
  PERMS, PERMS_BY_FAMILY,
  LEVELS, BUILTIN_ROLES,
} from 'hydrooj';

// ユーティリティ
import {
  nanoid, moment, isMoment,
  mime, avatar, rating, difficultyAlgorithm,
  buildContent, testdataConfig, sendMail,
  UiContextBase, pwsh, db,
} from 'hydrooj';

// その他
import { ObjectId } from 'hydrooj';
import { _ } from 'hydrooj'; // lodash
import { EventMap } from 'hydrooj';
import { requireSudo } from 'hydrooj';
import { StorageService } from 'hydrooj';
```

**注意:**
- `ObjectId` は `mongodb` ドライバのものと同じ。Type としても Value (`new ObjectId()`) としても使える
- `_` は lodash（`import { _ } from 'hydrooj'` で利用可能）

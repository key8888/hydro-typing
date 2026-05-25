# Handler クラスとリクエストライフサイクル

> ソース: `Hydro/framework/framework/server.ts`
> ソース: `Hydro/packages/hydrooj/src/service/server.ts`

---

## 1. Handler クラス階層

```
HandlerCommon (フレームワーク)
  ├── Handler (フレームワーク) ← 通常の HTTP ハンドラ
  │     └── Handler (hydrooj)  ← これが実際に使われる (domain プロパティ追加)
  └── ConnectionHandler (フレームワーク) ← WebSocket ハンドラ
        └── ConnectionHandler (hydrooj)  ← WebSocket + domain
```

### 1.1 HandlerCommon (基底クラス)

**ソース:** `@hydrooj/framework/server.ts:152-220`

```typescript
class HandlerCommon {
  // リクエスト関連
  context: KoaContext;
  ctx: CordisContext;
  session: Record<string, any>;
  args: Record<string, any>;
  request: HydroRequest;
  response: HydroResponse;
  UiContext: Record<string, any>;
  user: UserModel;

  // メソッド
  url(name: string, ...kwargsList: Record<string, any>[]): string  // URL 逆引き
  translate(str: string): string                                    // 翻訳 (デフォルト)
  renderHTML(templateName: string, args: Record<string, any>): string // テンプレート描画
}
```

### 1.2 Handler (フレームワーク → hydrooj で拡張)

**ソース:** `@hydrooj/framework/server.ts:222-268`

```typescript
class Handler extends HandlerCommon {
  loginMethods: any;
  notUsage = false;      // true にするとレート制限がスキップされる
  allowCors = false;     // true にすると CORS チェックがスキップされる
  __param: Record<string, decorators.ParamOption<any>[]>;

  back(body?: any): void;  // JSON + リファラにリダイレクト
  binary(data: any, name?: string): void;  // バイナリレスポンス
  holdFile(name: string | File): void;      // アップロードファイル保持

  // ライフサイクルフック
  init(): Promise<void>;    // CSRF チェック
  onerror(error: HydroError): Promise<void>;  // エラーハンドリング
}
```

**hydrooj パッケージでの拡張** (`Hydro/packages/hydrooj/src/service/server.ts:75-77`):

```typescript
export class Handler extends HandlerOriginal {
  domain: DomainDoc;  // 現在のドメイン情報
}
```

ハンドラ内で利用可能な追加メソッド（handlerMixin で注入）:

```typescript
// URL 逆引き (ドメイン考慮版)
this.url(name: string, ...kwargsList: Record<string, any>[]): string

// 翻訳 (ユーザー言語設定考慮版)
this.translate(str: string): string

// ページネーション
this.paginate<T>(cursor: FindCursor<T>, page: number, pageSize: number):
  Promise<[docs: T[], numPages: number, count: number]>

// 権限チェック
this.checkPerm(...perms: bigint[]): void      // なければ PermissionError
this.checkPriv(...privs: number[]): void       // なければ PrivilegeError

// レート制限
this.limitRate(op: string, periodSecs: number, maxOperations: number, defaultKey?: string): Promise<void>

// 進捗通知 (メッセージ送信)
this.progress(message: string, params: any[]): void

// タイトルレンダリング
this.renderTitle(str: string): string
```

---

## 2. Handler のライフサイクル

リクエストが来てからレスポンスが返るまで、以下のステップを経由する:

```
1.  handler/create          ← イベント: ハンドラインスタンス作成
2.  handler/create/http     ← イベント: HTTP 用の初期化
3.  init                    ← CSRF チェック、レート制限
4.  handler/init            ← イベント
5.  handler/before-prepare  ← イベント
6.  __prepare               ← デコレータ解決のための内部メソッド
7.  _prepare(args)          ← 事前処理 (パラメータ解決前)
8.  prepare(args)           ← 事前処理 (パラメータ解決後)
9.  handler/before           ← イベント
10. method 実行 (GET/POST)   ← メインハンドラ
11. handler/before-operation← イベント (POST の operation 時のみ)
12. post<Operation>()       ← operation メソッド (POST 時のみ)
13. after                    ← 後処理
14. handler/after            ← イベント
15. cleanup                  ← クリーンアップ
16. handler/finish           ← イベント
17. handler/error            ← エラー時 (例外が発生した場合)
```

### 2.1 各ステップの詳細

#### `init()`

CSRF トークンチェックがデフォルトで行われる。`POST` リクエストの場合、
Referer ヘッダーがリクエストの Host と一致するかチェックする。
`allowCors = true` を設定するとスキップされる。

```typescript
async init() {
  // CSRF チェック (デフォルト実装)
  if (this.request.method === 'post' && this.request.headers.referer && !this.context.cors && !this.allowCors) {
    const host = new URL(this.request.headers.referer).host;
    if (host !== this.request.host) throw new CsrfTokenError(host);
  }
}
```

#### `_prepare(args)` / `prepare(args)`

事前処理用のフック。`@param` デコレータを使用する場合は `_prepare` に記述する。

```typescript
// BlogHandler の例
class BlogHandler extends Handler {
  ddoc?: BlogDoc;

  @param('did', Types.ObjectId, true)
  async _prepare(domainId: string, did: ObjectId) {
    if (did) {
      this.ddoc = await BlogModel.get(did);
      if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
    }
  }
}
```

`_prepare` は `@param` デコレータによるパラメータ注入が行われる。
`prepare` は生の `args` オブジェクトを受け取る。

#### `get()` / `post()` / `post<Operation>()`

メインのリクエストハンドラ。

```typescript
class MyHandler extends Handler {
  async get() {
    // GET リクエスト処理
    this.response.template = 'my-template.html';
    this.response.body = { message: 'Hello' };
  }

  async post() {
    // POST リクエスト処理
    const data = this.request.body;
    // ...
    this.response.redirect = '/success';
  }

  // operation ルーティング (フォームに name="operation" がある場合)
  @param('action', Types.String)
  async postDoSomething(args, action: string) {
    // name="operation" が "do_something" の場合に呼ばれる
    // "do_something" → "postDoSomething" に変換される
  }
}
```

**`operation` の仕組み:**
POST リクエストのボディに `operation` フィールドがある場合、
`post<Operation>()` メソッドが呼ばれる。

例: `name="operation" value="delete"` → `postDelete()`
例: `name="operation" value="create"` → `postCreate()`
例: `name="operation" value="update"` → `postUpdate()`

対応するメソッドが存在しない場合は `InvalidOperationError` がスローされる。

---

## 3. `@param` デコレータ

**ソース:** `Hydro/framework/framework/decorators.ts`

### 3.1 基本シグネチャ

```typescript
@param(name: string, type: Type<T>, isOptional?: boolean | 'convert')
@param(name: string, type: Type<T>, validate: null, convert: Converter<T>)
@param(name: string, type: Type<T>, validate?: Validator, convert?: Converter<T>)
@param(name: string, ...args: Array<Type<T> | boolean | Validator | Converter<T>>)
```

**ソース指定デコレータ:**
```typescript
@param(name, type, ...)  // 全ソースから検索 (body, query, params)
@get(name, type, ...)    // query パラメータのみ
@query(name, type, ...)  // query パラメータのみ (get と同じ)
@post(name, type, ...)   // body のみ
@route(name, type, ...)  // ルートパラメータのみ (URL の :param)
```

### 3.2 パラメータ解決の優先順位

`@param` は以下の順序で値を検索する:
1. リクエストボディ (`this.request.body`)
2. クエリパラメータ (`this.request.query`)
3. ルートパラメータ (`this.request.params`)
4. `args.domainId` (自動注入)

### 3.3 使用パターン例

```typescript
// 必須パラメータ
@param('id', Types.ObjectId)
async post(domainId: string, id: ObjectId) { ... }

// 必須パラメータ (domainId を捨てる)
@param('id', Types.ObjectId)
async post({}, id: ObjectId) { ... }

// オプションパラメータ (第三引数が true)
@param('page', Types.PositiveInt, true)
async get(domainId: string, page = 1) { ... }

// デフォルト値 'convert' (値がない場合は converter を適用しても undefined)
@param('optional', Types.String, 'convert')
async get(domainId: string, optional?: string) { ... }

// カスタムバリデータ + コンバータ
@param('score', [Types.Int[0], (v) => v >= 0 && v <= 300])
async post(domainId: string, score: number) { ... }

// 複数ソースから検索 (route 優先)
@param('filename', Types.String)
async get({}, filename: string) {
  // URL /files/:filename の filename と
  // ?filename=xxx の両方に対応
}
```

### 3.4 Types 一覧

**ソース:** `Hydro/framework/framework/validator.ts:91-199`

| タイプ | 入力 | 出力 | 説明 |
|--------|------|------|------|
| `Types.Content` | string | string | 最大65535文字、トリム |
| `Types.Key` | string | string | `^[\w-]{1,255}$` (saslprep) |
| `Types.Filename` | string | string | ファイル名検証 (sanitize) |
| `Types.UidOrName` | string | string | UID またはユーザー名 |
| `Types.Username` | string | string | 3-31文字のユーザー名 |
| `Types.Password` | string | string | 6-255文字 |
| `Types.ProblemId` | string | string/number | PID または数値ID |
| `Types.Email` | string | string | メールアドレス |
| `Types.DomainId` | string | string | ドメインID |
| `Types.Role` | string | string | ロール名 |
| `Types.Title` | string | string | 1-64文字 |
| `Types.ShortString` | string | string | 1-255文字 |
| `Types.String` | string | string | 任意の文字列 |
| `Types.Int` | string | number | 整数 |
| `Types.UnsignedInt` | string | number | 符号なし整数 |
| `Types.PositiveInt` | string | number | 正の整数 |
| `Types.Float` | string | number | 浮動小数点数 |
| `Types.ObjectId` | string | ObjectId | MongoDB ObjectId |
| `Types.Boolean` | string | boolean | "false"/"off"/"no"/"0" 以外の truthy |
| `Types.Date` | string | string | 日付 (YYYY-MM-DD) |
| `Types.Time` | string | string | 時刻 (HH:MM) |
| `Types.Range(range)` | string | string/number | 範囲内の値 |
| `Types.NumericArray` | string/array | number[] | 数値配列 (カンマ区切り可) |
| `Types.CommaSeperatedArray` | string/array | string[] | 文字列配列 |
| `Types.Set` | string/array | Set | セット |
| `Types.Emoji` | string | string | 絵文字 |
| `Types.Any` | any | any | 未検証 |
| `Types.ArrayOf(type)` | string/array | array | 配列 |
| `Types.AnyOf(...types)` | any | any | いずれかの型 |

---

## 4. Response オブジェクト

**ソース:** `@hydrooj/framework/server.ts:77-92`

```typescript
interface HydroResponse {
  body: any;                            // テンプレートに渡すデータ
  type: string;                         // Content-Type
  status: number;                       // HTTP ステータスコード
  template?: string;                    // 使用するテンプレート名
  pjax?: string | (readonly [string, Record<string, any>])[];  // PJAX 用テンプレート
  redirect?: string;                    // リダイレクト先URL
  disposition?: string;                 // Content-Disposition
  etag?: string;                        // ETag
  attachment: (name: string, stream?: any) => void;  // ファイル添付
  addHeader: (name: string, value: string) => void;  // カスタムヘッダー追加
}
```

### 4.1 レスポンスパターン集

```typescript
// HTML テンプレートを描画
this.response.template = 'my-template.html';
this.response.body = { key: 'value' };

// JSON を返す (テンプレートを null に設定)
this.response.template = null;
this.response.body = { success: true, data: [...] };

// リダイレクト
this.response.redirect = '/other-page';
this.response.redirect = this.url('route_name', { param: 'value' });

// リダイレクト + JSON (back メソッド)
this.back({ success: true });  // Referer にリダイレクト

// バイナリファイル
this.binary(buffer, 'filename.pdf');

// 404 エラー
this.response.status = 404;
this.response.template = 'error.html';
this.response.body = { error: { message: 'Not Found' } };

// カスタムヘッダー
this.response.addHeader('X-Custom', 'value');

// Content-Type を明示設定
this.response.type = 'text/css';

// ファイルダウンロード (Content-Disposition)
this.response.type = 'application/pdf';
this.response.disposition = 'attachment; filename="document.pdf"';
```

---

## 5. Handler 内で利用可能な `this` プロパティ

```typescript
class MyHandler extends Handler {
  async get() {
    // === リクエスト情報 ===
    this.request.method;       // GET / POST
    this.request.path;         // リクエストパス
    this.request.ip;           // クライアント IP
    this.request.host;         // ホスト名
    this.request.body;         // POST ボディ (オブジェクト)
    this.request.query;        // クエリパラメータ
    this.request.params;       // ルートパラメータ
    this.request.headers;      // リクエストヘッダー
    this.request.files;        // アップロードファイル
    this.request.referer;      // Referer ヘッダー
    this.request.websocket;    // WebSocket 接続か

    // === セッション ===
    this.session;              // セッションオブジェクト
    this.session.uid;          // ユーザーID (未ログイン: 0)
    this.session._id;          // セッションID

    // === ユーザー ===
    this.user;                 // ユーザーオブジェクト
    this.user._id;             // ユーザーID
    this.user.uname;           // ユーザー名
    this.user.mail;            // メールアドレス
    this.user.avatar;          // アバターURL
    this.user.priv;            // 権限ビットマスク
    this.user.hasPerm(perm);   // 権限チェック
    this.user.hasPriv(priv);   // 特権チェック
    this.user.own(doc);        // 所有権チェック

    // === ドメイン ===
    this.domain;               // 現在のドメイン
    this.domain._id;           // ドメインID
    this.domain.owner;         // ドメイン所有者

    // === コンテキスト ===
    this.ctx;                  // Cordis Context
    this.ctx.db;               // データベースサービス
    this.context;              // Koa Context

    // === UI ===
    this.UiContext;            // UI コンテキスト
    this.loginMethods;         // ログイン方法一覧

    // === 引数 ===
    this.args;                 // リクエスト引数 (domainId, params, query, body のマージ)
  }
}
```

---

## 6. エラーハンドリング

Handler の例外処理は以下の優先順位で行われる:

1. `handler/error` イベント発行
2. `h.onerror(error)` の呼び出し

**デフォルトの `onerror` 実装 (hydrooj 版):**

```typescript
async onerror(error: HydroError) {
  if (this.user?._id === 0 && (error instanceof PermissionError || error instanceof PrivilegeError)) {
    // 未ログインユーザー → ログインページにリダイレクト
    this.response.redirect = this.url('user_login', {
      query: { redirect: this.request.path },
    });
  } else if (!this.user._dudoc.join && error instanceof PermissionError) {
    // ドメイン未参加 → 参加ページにリダイレクト
    this.response.redirect = this.url('domain_join', { ... });
  } else {
    // 通常のエラーページ表示
    this.response.status = error instanceof UserFacingError ? error.code : 500;
    this.response.template = error instanceof UserFacingError ? 'error.html' : 'bsod.html';
    this.response.body = { error: { message: error.msg(), stack: error.stack, ... } };
  }
}
```

**注意:**
- `UserFacingError` (400番台) は `error.html` テンプレートで表示
- `SystemError` (500番台) は `bsod.html` テンプレートで表示
- `Not found` や `PermissionError` などの一部のエラーはログ出力が抑制される

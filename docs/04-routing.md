# ルーティングシステム

> ソース: `Hydro/framework/framework/server.ts`
> ソース: `Hydro/framework/framework/router.ts`
> ソース: `Hydro/packages/hydrooj/src/service/server.ts`

---

## 1. ルート登録の仕組み

`ctx.Route()` を呼び出すと、内部的に `@koa/router` の `router.all()` が呼ばれ、
そのパスに対する全 HTTP メソッド (GET, POST, PUT, DELETE, etc.) を
`WebService.handleHttp()` が処理する。

```typescript
// WebService.register() の内部動作 (簡略化)
public Route(name: string, path: string, HandlerClass: typeof Handler, ...permPrivChecker) {
  // 1. ハンドラクラスを検証 (kHandler シンボルの存在確認)
  // 2. 名前の重複チェック
  // 3. パーミッションチェッカーを構築
  // 4. router.all(name, path, handler) で登録
  // 5. handler/register/<Name> イベント発行
  // 6. dispose 関数を返す (プラグインアンロード時に自動削除)
}
```

### 1.1 パスパターン

`@koa/router` のパスパターンに従う:

```typescript
ctx.Route('static', '/static', StaticHandler);          // 固定パス
ctx.Route('user', '/user/:uid', UserHandler);            // 名前付きパラメータ
ctx.Route('blog', '/blog/:uid/:did', BlogHandler);       // 複数パラメータ
ctx.Route('search', '/search?', SearchHandler);           // オプショナルパラメータ
ctx.Route('wild', '/wild/*', WildHandler);                // ワイルドカード
```

パラメータは `this.request.params` および `this.args` から取得できる:

```typescript
class UserHandler extends Handler {
  async get() {
    const uid = this.request.params.uid;   // "/user/123" → "123"
    const uid2 = this.args.uid;            // 同上 (args は params, query, body のマージ)
    // ...
  }
}
```

### 1.2 ルート名の規則

- ルート名は一意である必要がある（重複すると警告ログが出力される）
- URL 逆引きに使用する: `this.url('route_name', { param: value })`
- ルート名の後ろに `Handler` が自動的に除去される
  - `TypingHandler` → イベント名は `handler/register/Typing`
  - `BlogUserHandler` → イベント名は `handler/register/BlogUser`

---

## 2. 静的ファイル配信

### 2.1 HydroOJ 組込みの静的ファイル配信

HydroOJ はプラグインの `public/` ディレクトリを自動的に静的配信する:

```typescript
// Hydro/packages/hydrooj/src/service/server.ts:114-120
for (const addon of [...Object.values(global.addons)].reverse()) {
  const dir = resolve(addon, 'public');
  if (!fs.existsSync(dir)) continue;
  server.addServerLayer(`${addon}_public`, cache(dir, {
    maxAge: argv.options.public ? 0 : 24 * 3600 * 1000,
  }));
}
```

この仕組みにより、プラグインの `public/` ディレクトリにあるファイルは
自動的に `/addon/<plugin-name>/<filename>` のようなパスでアクセスできる。

**注意:** `maxAge` は通常 24時間に設定される。開発時は `--public` フラグで
`maxAge: 0` になりキャッシュが無効化される。

### 2.2 カスタム静的ファイル配信

組込みの静的配信を使わず、カスタムハンドラで配信する場合:

```typescript
// utils/public.ts
import { Handler } from 'hydrooj';
import { join, normalize } from 'path';
import { readFileSync } from 'fs';

export class PublicFileHandler extends Handler {
  async get({ filename }: { filename: string }) {
    const base = join(__dirname, '..', 'public');
    const p = normalize(join(base, filename));

    // パストラバーサル対策
    if (!p.startsWith(base)) {
      this.status = 403;
      this.response.body = 'Forbidden';
      return;
    }

    // MIME タイプ設定
    const mimeMap: Record<string, string> = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.html': 'text/html',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
    };
    const ext = filename.substring(filename.lastIndexOf('.'));
    if (mimeMap[ext]) this.response.type = mimeMap[ext];

    // キャッシュ制御
    this.response.addHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // ファイル読み取り (エラーハンドリング推奨)
    try {
      this.response.body = readFileSync(p);
    } catch {
      this.response.status = 404;
      this.response.body = 'Not Found';
    }
  }
}
```

---

## 3. ルートの自動クリーンアップ

`ctx.Route()` は `ctx.effect()` でラップされているため、
プラグインがホットリロードまたはアンロードされると自動的にルートが削除される。

```typescript
// プラグイン内で登録
ctx.Route('my_route', '/my-path', MyHandler);

// プラグインがアンロードされると:
// 1. router.stack から該当レイヤーが削除される
// 2. イベント購読が解除される
```

---

## 4. WebSocket / SSE ルート

### 4.1 WebSocket ハンドラ

```typescript
import { ConnectionHandler } from 'hydrooj';

class MyWSHandler extends ConnectionHandler {
  async message(payload: any) {
    // クライアントからのメッセージ受信
    this.send({ response: 'pong' });
  }

  async prepare() {
    // 接続時の初期化
  }
}

// ルート登録
ctx.Connection('my_ws', '/ws-path', MyWSHandler, PRIV.PRIV_USER_PROFILE);
```

### 4.2 SSE (Server-Sent Events)

WebSocket ルートは自動的に SSE フォールバックも提供する
（`enableSSE: true` が設定されている場合）。

```typescript
// クライアント側 (JavaScript)
const source = new EventSource('/ws-path');
source.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(data);
};
```

---

## 5. URL 逆引き (this.url)

### 5.1 基本

```typescript
// ルート登録: ctx.Route('typing_main', '/typing', TypingHandler)
this.url('typing_main');   // → '/typing'

// パラメータ付き: ctx.Route('blog_detail', '/blog/:uid/:did', BlogDetailHandler)
this.url('blog_detail', { uid: 1, did: 'abc123' });  // → '/blog/1/abc123'
```

### 5.2 クエリパラメータ

```typescript
this.url('search', { query: { q: 'hello', page: 2 } });
// → '/search?q=hello&page=2'
```

### 5.3 アンカー

```typescript
this.url('page', { anchor: 'section1' });
// → '/page#section1'
```

### 5.4 ドメインID の自動付与

現在のドメインが `system` 以外の場合、自動的に `/d/<domainId>` が前置される:

```typescript
// domainId が 'my-domain' の場合
this.url('typing_main');
// → '/d/my-domain/typing'
```

ドメインID を明示的に指定する場合:

```typescript
this.url('typing_main', { domainId: 'other-domain' });
// → '/d/other-domain/typing'
```

---

## 6. `requireSudo` デコレータ

**ソース:** `Hydro/packages/hydrooj/src/service/server.ts:55-73`

特定の操作に sudo (昇格認証) を要求する:

```typescript
import { requireSudo } from 'hydrooj';

class AdminHandler extends Handler {
  @requireSudo
  async postDeleteUser() {
    // この操作には sudo 認証が必要
    await UserModel.delete(...);
  }
}
```

動作:
1. セッションに sudo 情報がない場合、`user_sudo` ページにリダイレクト
2. sudo 認証後、元のリクエストにリダイレクトして処理を実行
3. sudo は 1時間有効

---

## 7. `withHandlerClass` で既存ルートに Mixin

```typescript
// 既存の Handler にメソッドを追加 (Mixin パターン)
ctx.server.withHandlerClass('Contest', (ContestHandlerClass) => {
  // ContestHandler にメソッドを注入
  ContestHandlerClass.prototype.myCustomMethod = async function() {
    // ...
  };
});

// または handleMixin を使用
ctx.server.handlerMixin({
  myHelper() {
    return 'helper!';
  },
});
// これで全ハンドラが this.myHelper() を使えるようになる
```

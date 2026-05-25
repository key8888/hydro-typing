# ミドルウェア (レイヤー) システム

> ソース: `Hydro/framework/framework/server.ts` (WebService)
> ソース: `Hydro/packages/hydrooj/src/service/layers/`

---

## 1. レイヤーシステムの概要

HydroOJ のリクエスト処理は、Koa ミドルウェアの上に
さらに「レイヤー」と呼ばれる拡張可能なミドルウェア層を持つ。

```typescript
interface LayerEntry {
  name: string;                                                    // レイヤー名 (デバッグ用)
  func: (ctx: KoaContext, next: () => Promise<void>) => Promise<void>; // ミドルウェア関数
}
```

### 1.1 3種類のレイヤー

| レイヤータイプ | 登録メソッド | 適用対象 | 説明 |
|---------------|------------|---------|------|
| **Server Layers** | `addServerLayer()` | HTTP 全リクエスト | ルーティング前に実行。CORS、静的ファイル |
| **Handler Layers** | `addHandlerLayer()` | ルーター内部 (HTTP+WS) | ハンドラ実行前に実行。セッション、ユーザー |
| **WS Layers** | `addWSLayer()` | WebSocket のみ | WebSocket 接続時に実行 |

### 1.2 レイヤー実行順序

```
クライアント
  │
  ▼
Koa ミドルウェア:
  1. Compress (gzip)
  2. CORS (カスタム)
  3. Body Parser (koa-body)
  4. Server Layers (addServerLayer で登録)
     │
     ▼
  Router:
    └── レイヤースタック (executeMiddlewareStack):
      5. Handler Layers (addHandlerLayer / addLayer で登録) ← ここで init, base, user
      6. ルーティング (router.routes / router.allowedMethods)
      7. Handler Layers (同じスタックを再利用)
      8. 404 ハンドラ (NotFoundHandler)
```

---

## 2. プラグインからレイヤーを追加する

### 2.1 Server Layer の追加

```typescript
// 静的ファイル配信 (koa-static-cache)
server.addServerLayer(`${addon}_public`, cache(dir, {
  maxAge: 24 * 3600 * 1000,
}));
```

### 2.2 Handler Layer の追加

```typescript
// すべてのハンドラの前に実行される処理
server.addHandlerLayer('init', async (c, next) => {
  const init = Date.now();
  try {
    await next();
  } finally {
    const finish = Date.now();
    if (finish - init > 5000) {
      // 5秒以上かかったリクエストを記録
      logger.warn(`Slow request: ${finish - init}ms`);
    }
  }
});
```

### 2.3 WS Layer と Handler Layer を同時に追加

```typescript
// HTTP + WS 両方に適用
server.addLayer('base', baseLayer);
server.addLayer('user', userLayer);
```

---

## 3. 組み込みレイヤーの詳細

### 3.1 Base Layer

**ソース:** `Hydro/packages/hydrooj/src/service/layers/base.ts`

機能:
- セッションの復元 (クッキーまたは Bearer Token)
- `UiContext` の構築 (CDN設定、ドメイン情報)
- リクエスト引数 (`args`) の構築 (domainId, params, query, body のマージ)
- セッションの永続化 (クッキー更新)

```typescript
async (ctx: KoaContext, next: Next) => {
  // 1. UiContext の構築
  const UiContext = {
    cdn_prefix: system.get('server.cdn'),
    url_prefix: '/',
    ws_prefix: '/',
    domainId,
    domain: domainInfo,
  };

  // 2. セッションの復元
  const sid = ctx.cookies.get('sid') || ctx.query.sid;
  const session = sid ? await token.get(sid, token.TYPE_SESSION) : null;
  ctx.session = session || { uid: 0, scope: PERM.PERM_ALL.toString() };

  // 3. セッションの永続化
  await next();

  // 4. Cookie 設定
  if (ctx.session._id) {
    ctx.cookies.set('sid', ctx.session._id, { expires, httpOnly: false });
  }
};
```

### 3.2 Domain Layer

**ソース:** `Hydro/packages/hydrooj/src/service/layers/domain.ts`

機能:
- ドメイン解決 (`/d/<domainId>/` プレフィックスの処理)
- ドメインのホスト名解決
- IP ブラックリストチェック

```typescript
async (ctx: KoaContext, next) => {
  // 1. URL からドメインID を抽出 (/d/<id>/...)
  const forceDomain = /^\/d\/([^/]+)\//.exec(ctx.request.path);
  ctx.path = ctx.request.path.replace(/^\/d\/[^/]+\//, '/');

  // 2. ドメイン情報を取得
  const domainId = forceDomain?.[1] || 'system';
  const domain = await DomainModel.get(domainId);

  // 3. ブラックリストチェック
  const bdoc = await BlackListModel.get(`ip::${ip}`);
  if (bdoc) { ctx.body = 'blacklisted'; return; }

  // 4. ドメインコンテキスト設定
  ctx.domainId = domain._id;
  ctx.domainInfo = domain;
  await next();
};
```

### 3.3 User Layer

**ソース:** `Hydro/packages/hydrooj/src/service/layers/user.ts`

機能:
- セッションからユーザー情報を解決
- 未ログインユーザー (uid=0) のフォールバック
- IP アドレスの記録

```typescript
async (ctx: KoaContext, next) => {
  const domainId = ctx.HydroContext.domain ? args.domainId : 'system';
  let user = await UserModel.getById(domainId, ctx.session.uid, ctx.session.scope);

  // 未ログインの場合、ゲストユーザーでフォールバック
  if (!user) {
    ctx.session.uid = 0;
    user = await UserModel.getById(domainId, 0, PERM.PERM_ALL.toString());
  }

  ctx.HydroContext.user = await user.private();
  await next();
};
```

---

## 4. event システムによるフック

レイヤーと同様に、イベントを使ってハンドラ処理にフックできる:

### 4.1 ハンドラ作成時のフック

```typescript
// 全ハンドラインスタンス作成時に実行
on('handler/create', async (h) => {
  h.user = h.context.HydroContext.user;
  h.domain = h.context.HydroContext.domain;
  h.translate = h.translate.bind(h);
});

// HTTP ハンドラインスタンス作成時のみ
on('handler/create/http', async (h) => {
  await h.limitRate('global', 5, 100);  // レート制限
  if (!h.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) {
    h.checkPerm(PERM.PERM_VIEW);
  }
});

// WebSocket ハンドラインスタンス作成時のみ
on('handler/create/ws', async (h) => {
  if (h.context.pendingError) throw h.context.pendingError;
});
```

### 4.2 利用可能な handler イベント

| イベント | タイミング |
|---------|-----------|
| `handler/create` | ハンドラインスタンス作成 |
| `handler/create/http` | HTTP ハンドラインスタンス作成 |
| `handler/create/ws` | WebSocket ハンドラインスタンス作成 |
| `handler/register/<Name>` | ルート登録時 |
| `handler/init` | init() の前後 |
| `handler/before-prepare` | prepare() の前 |
| `handler/before` | メソッド実行の前 |
| `handler/after` | メソッド実行の後 |
| `handler/finish` | クリーンアップ後 |
| `handler/error` | エラー発生時 |
| `handler/error/<Name>` | 特定ハンドラのエラー時 |

---

## 5. レイヤーの用途

### 5.1 addCaptureRoute (静的パスの横取り)

特定のプレフィックスへのリクエストを横取りする:

```typescript
// /api/ で始まるすべてのリクエストを横取り
server.addCaptureRoute('/api/', async (ctx, next) => {
  // API 処理
  ctx.body = { message: 'API endpoint' };
});
```

### 5.2 カスタムチェッカーレイヤー

```typescript
// 特定の条件でアクセスを制限するレイヤー
server.addHandlerLayer('maintenance', async (c, next) => {
  if (system.get('maintenance_mode')) {
    throw new ForbiddenError('Under maintenance');
  }
  await next();
});
```

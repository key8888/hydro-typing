# プラグイン開発ベストプラクティス

> 対象: HydroOJ v5 プラグイン開発
> 参考: `Hydro/packages/hydrooj/src/handler/` (組み込みハンドラ)
> 参考: `Hydro/packages/` (公式プラグイン)

---

## 1. プロジェクトセットアップ

### 1.1 最小の package.json

```json
{
  "name": "my-hydro-plugin",
  "version": "1.0.0",
  "main": "index.ts",
  "type": "module",
  "devDependencies": {
    "hydrooj": "^5.0.1"
  }
}
```

### 1.2 tsconfig.json

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "esnext",
    "strict": true,
    "experimentalDecorators": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "moduleDetection": "force",
    "sourceMap": true,
    "declaration": true
  }
}
```

**重要:** `experimentalDecorators: true` は `@param` デコレータ使用時に必須。

### 1.3 開発用 HydroOJ インスタンス

```bash
# 開発用ディレクトリ構成
~/hydro-dev/
  hydrooj/          # HydroOJ 本体 (クローン)
  my-plugin/        # 開発中のプラグイン

# plugins.json に設定
# ~/.config/hydro/plugins.json
["/path/to/my-plugin"]
```

---

## 2. コーディング規約

### 2.1 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| ルート名 | スネークケース | `'typing_main'`, `'blog_detail'` |
| Handler クラス | パスカルケース + Handler 接尾辞 | `TypingHandler`, `BlogUserHandler` |
| Model クラス | パスカルケース + Model 接尾辞 | `BlogModel`, `UserModel` |
| ドキュメントタイプ | 大文字 + スネークケース | `TYPE_BLOG`, `TYPE_PROBLEM` |
| ファイル名 | ケバブケース | `typing-handler.ts` |
| i18n キー | スネークケース | `'blog_main'`, `'user_profile'` |

### 2.2 ディレクトリ構成

```
my-plugin/
  index.ts              # エントリポイント (apply 関数のみ)
  features/              # 機能モジュール
    my-feature.ts       # 1機能 = 1ファイル
  utils/                 # 汎用ユーティリティ
    helpers.ts
  templates/             # Nunjucks テンプレート
    my-page.html
  public/                # 静的ファイル
    my-style.css
    my-script.js
  typing_words/          # データファイル (JSON 等)
    words.json
```

### 2.3 import の書き方

```typescript
// types は type import にする (verbatimModuleSyntax 対応)
import type { ObjectId } from 'hydrooj';

// 値として使うものは通常の import
import { Context, Handler, PRIV } from 'hydrooj';
import { ForbiddenError, NotFoundError } from 'hydrooj';
import { param, Types } from 'hydrooj';
import { DocumentModel } from 'hydrooj';
```

---

## 3. Handler 実装パターン

### 3.1 CRUD ハンドラパターン

```typescript
import { Context, Handler, ObjectId, param, PRIV, Types } from 'hydrooj';

class ItemHandler extends Handler {
  // GET: 一覧/詳細表示
  async get() {
    // データ取得
    const items = await SomeModel.getMulti({}).toArray();
    this.response.template = 'item-list.html';
    this.response.body = { items };
  }

  // POST: 作成/更新
  async post() {
    const data = this.request.body;
    await SomeModel.create(data);
    this.response.redirect = '/items';
  }
}

// パラメータ付きハンドラ
class ItemDetailHandler extends Handler {
  @param('id', Types.ObjectId)
  async get({}, id: ObjectId) {
    const item = await SomeModel.get(id);
    if (!item) throw new NotFoundError(id);
    this.response.template = 'item-detail.html';
    this.response.body = { item };
  }

  @param('id', Types.ObjectId)
  async postDelete({}, id: ObjectId) {
    await SomeModel.delete(id);
    this.response.redirect = '/items';
  }
}

export function applyFeature(ctx: Context) {
  ctx.Route('item_list', '/items', ItemHandler, PRIV.PRIV_USER_PROFILE);
  ctx.Route('item_detail', '/items/:id', ItemDetailHandler, PRIV.PRIV_USER_PROFILE);
}
```

### 3.2 `_prepare` パターン (事前読み込み)

複数のメソッドで共通のデータを事前に読み込む:

```typescript
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

class BlogEditHandler extends BlogHandler {
  async get() {
    // this.ddoc は _prepare で既に読み込まれている
    this.response.template = 'blog_edit.html';
    this.response.body = { ddoc: this.ddoc };
  }

  @param('title', Types.Title)
  @param('content', Types.Content)
  async postCreate({}, title: string, content: string) {
    const did = await BlogModel.add(this.user._id, title, content);
    this.response.redirect = this.url('blog_detail', { uid: this.user._id, did });
  }

  @param('did', Types.ObjectId)
  @param('title', Types.Title)
  @param('content', Types.Content)
  async postUpdate({}, did: ObjectId, title: string, content: string) {
    if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await BlogModel.edit(did, title, content);
    this.response.redirect = this.url('blog_detail', { uid: this.user._id, did });
  }
}
```

### 3.3 `operation` パターン (複数アクション)

```typescript
class ItemHandler extends Handler {
  async get() { /* 編集フォーム表示 */ }
}

class ItemEditHandler extends ItemHandler {
  // name="operation" value="create" の場合
  async postCreate() {
    await ItemModel.add(/* ... */);
    this.response.redirect = '/items';
  }

  // name="operation" value="update" の場合
  async postUpdate() {
    await ItemModel.update(/* ... */);
    this.response.redirect = '/items';
  }

  // name="operation" value="delete" の場合
  async postDelete() {
    await ItemModel.delete(/* ... */);
    this.response.redirect = '/items';
  }
}
```

テンプレート側:

```nunjucks
<form method="post">
  <input name="title" value="{{ item.title }}">
  <button name="operation" value="create" type="submit">作成</button>
  <button name="operation" value="update" type="submit">更新</button>
  <button name="operation" value="delete" type="submit" onclick="return confirm('削除しますか？')">削除</button>
</form>
```

---

## 4. テンプレート実装パターン

### 4.1 一覧ページ

```nunjucks
{% extends "layout/basic.html" %}
{% block content %}
<div class="row">
  <div class="medium-12 columns">
    <div class="section">
      <div class="section__header">
        <h1>{{ _('Items') }}</h1>
        <a href="/items/create" class="button">{{ _('Create') }}</a>
      </div>
      <div class="section__body">
        {% if items.length === 0 %}
          <p>{{ _('No items.') }}</p>
        {% else %}
          {% for item in items %}
            <div class="item-entry">
              <h2><a href="/items/{{ item.docId }}">{{ item.title }}</a></h2>
              <p>{{ item.content | truncate(200) }}</p>
            </div>
          {% endfor %}
        {% endif %}
      </div>
      <div class="section__body">
        {{ paginator(page, dpcount, '/items?page=') }}
      </div>
    </div>
  </div>
</div>
{% endblock %}
```

### 4.2 詳細ページ

```nunjucks
{% extends "layout/basic.html" %}
{% block content %}
<div class="row">
  <div class="medium-12 columns">
    <div class="section">
      <div class="section__header">
        <h1>{{ item.title }}</h1>
        {% if handler.user._id === item.owner %}
          <a href="/items/{{ item.docId }}/edit" class="button">{{ _('Edit') }}</a>
        {% endif %}
      </div>
      <div class="section__body">
        <div class="content">
          {{ item.content | markdown | safe }}
        </div>
      </div>
    </div>
  </div>
</div>
{% endblock %}
```

---

## 5. レート制限

```typescript
// 特定の操作に対するレート制限
await this.limitRate('my_operation', 3600, 60);
// → 1時間に60回まで

// システム設定で上書き可能
// system.get('limit.my_operation') → maxOperations を上書き

// 特定ユーザーは制限免除
// PRIV.PRIV_UNLIMITED_ACCESS を持っていると自動スキップ

// ignoredLimit で指定された操作もスキップ
// CLI の --ignoredLimit オプション
```

---

## 6. モデルパターン

### 6.1 DocumentModel ラッパー（推奨）

```typescript
import { DocumentModel, ObjectId } from 'hydrooj';
import type { Filter } from 'hydrooj';

export const TYPE_MY_CONTENT = 80 as const;

export interface MyDoc {
  docType: 80;
  docId: ObjectId;
  owner: number;
  title: string;
  content: string;
  status: string;
  createdAt: Date;
}

declare module 'hydrooj' {
  interface DocType {
    [TYPE_MY_CONTENT]: MyDoc;
  }
}

export class MyModel {
  static add(owner: number, title: string, content: string) {
    return DocumentModel.add(
      'system', content, owner, TYPE_MY_CONTENT,
      null, null, null,
      { title, status: 'active', createdAt: new Date() },
    );
  }

  static get(docId: ObjectId) {
    return DocumentModel.get('system', TYPE_MY_CONTENT, docId);
  }

  static getMulti(query: Filter<MyDoc> = {}) {
    return DocumentModel.getMulti('system', TYPE_MY_CONTENT, query);
  }

  static set(docId: ObjectId, data: Partial<MyDoc>) {
    return DocumentModel.set('system', TYPE_MY_CONTENT, docId, data);
  }

  static delete(docId: ObjectId) {
    return DocumentModel.deleteOne('system', TYPE_MY_CONTENT, docId);
  }
}

global.Hydro.model.myModel = MyModel;
```

### 6.2 直接 MongoDB コレクション

```typescript
// シンプルなスコア保存など
const coll = this.ctx.db.collection('myScores');
await coll.insertOne({ uid: this.user._id, score: 100, createdAt: new Date() });

// ページネーション
const cursor = coll.find({}).sort({ createdAt: -1 });
const [docs, pages] = await this.ctx.db.paginate(cursor, page, 10);
```

---

## 7. エラーハンドリング

### 7.1 基本

```typescript
throw new NotFoundError('resource');
throw new ForbiddenError();
throw new ValidationError('fieldName');
throw new PermissionError(PERM.PERM_VIEW);
throw new PrivilegeError(PRIV.PRIV_USER_PROFILE);
```

### 7.2 readFileSync のエラーハンドリング

```typescript
let data: string;
try {
  data = readFileSync(filePath, 'utf-8');
} catch {
  data = '[]';  // または適切なデフォルト値
}

// 静的ファイル配信の場合
try {
  this.response.body = readFileSync(filePath);
} catch {
  this.response.status = 404;
  this.response.body = 'Not Found';
}
```

---

## 8. パフォーマンスの注意点

### 8.1 避けるべきパターン

```typescript
// NG: リクエスト毎に同期的ファイル読み込み
class BadHandler extends Handler {
  async get() {
    const data = readFileSync('data.json');  // イベントループをブロック！
    // ...
  }
}
```

```typescript
// OK: 起動時にキャッシュ
let cache: DataType | null = null;

function loadData(): DataType {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync('data.json', 'utf-8'));
  } catch {
    cache = [];
  }
  return cache;
}
```

### 8.2 N+1 クエリの回避

```typescript
// NG: ループ内で個別クエリ
for (const item of items) {
  const user = await UserModel.getById(domainId, item.owner);
}

// OK: バルク取得
const uids = items.map((i) => i.owner);
const udict = await UserModel.getList(domainId, uids);
// udict[uid] でアクセス
```

---

## 9. テスト戦略

```typescript
// ユニットテスト例 (vitest)
import { describe, it, expect } from 'vitest';
import { MyHandler } from './handler';

describe('MyHandler', () => {
  it('should throw on missing id', async () => {
    // Mock した Context で Handler をテスト
    const handler = new MyHandler(mockContext, mockCordisContext);
    await expect(handler.get()).rejects.toThrow(NotFoundError);
  });
});
```

**テスト用モックのポイント:**
- `Context` (Cordis) のモック
- `this.ctx.db.collection()` のモック
- `this.response` のモック
- `this.user` のモック
- `this.request` のモック

---

## 10. デバッグとトラブルシューティング

### 10.1 開発サーバーの起動

```bash
# HYDRO_HOME に HydroOJ 本体のパスを指定
HYDRO_HOME=/path/to/hydrooj node /path/to/hydrooj/packages/hydrooj/dist/node/cli.js

# または docker を使用
docker run -p 8888:8888 -v ./plugins.json:/root/.config/hydro/plugins.json hydro
```

### 10.2 デバッグログ

```typescript
// 環境変数 DEBUG でログレベル制御
DEBUG=hydro* node cli.js

// 開発モード (テンプレートキャッシュ無効、詳細ログ)
DEV=true node cli.js
```

### 10.3 パブリックモード (静的ファイルキャッシュ無効)

```bash
node cli.js --public
# 静的ファイルの maxAge が 0 になり、キャッシュが無効化される
```

### 10.4 よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 400エラー | CSRF トークン不一致 | Referer ヘッダーを確認、または `allowCors = true` |
| 403エラー | 権限不足 | PRIV/PERM の確認、Route 登録時の権限設定を確認 |
| 404エラー | ルート未登録 | `ctx.Route()` の呼び出しを確認 |
| テンプレートが反映されない | ブラウザキャッシュ | `Cache-Control` ヘッダーを設定、または `--public` フラグ |
| `this.response.set` が動かない | `HydroResponse` に `set()` がない | `this.response.addHeader()` を使用 |
| デコレータが動かない | `experimentalDecorators` 未設定 | `tsconfig.json` に設定を追加 |

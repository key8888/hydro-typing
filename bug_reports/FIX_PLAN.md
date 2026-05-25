# 修正計画

**注意点：プログラムの保守性を大事にし，詳細＆わかりやすいコメントをつけよ**

## 🔴 重大

### 1. スコア削除エンドポイントの未実装

**問題**: `templates/typing.html` が `/typing/delete` へのPOSTフォームを持つが、対応するルートとハンドラがサーバー側に存在しない。

**解決策**:

1. `features/typing.ts` に削除用ハンドラクラス `TypingDeleteHandler` を追加する。
2. `applyTyping()` で `ctx.Route('typing_delete', '/typing/delete', TypingDeleteHandler)` を登録する。
3. ハンドラの処理内容:
   - リクエストボディから `id` (ObjectId) を取得
   - `uid` が `this.user._id` と一致するか確認（所有権チェック）
   - MongoDB `typingScores` コレクションから該当ドキュメントを削除
   - `/typing` にリダイレクト

```typescript
class TypingDeleteHandler extends Handler {
  @param('id', Types.ObjectId, true)
  async post(domainId: string, id: ObjectId) {
    const { db } = require('hydrooj');
    const score = await db.collection('typingScores').findOne({ _id: id });
    if (!score) throw new NotFoundError('score');
    if (score.uid !== this.user._id) throw new ForbiddenError();
    await db.collection('typingScores').deleteOne({ _id: id });
    this.response.redirect = '/typing';
  }
}
```

**ファイル**: `features/typing.ts`

---

### 2. `blog_main.html` テンプレートの誤り

**問題**: `templates/blog_main.html` の内容が `blog_edit.html` と同一（編集フォーム）。しかし `BlogUserHandler` ではブログ一覧表示を期待している。

**解決策**: `templates/blog_main.html` を一覧表示用に書き換える。以下の要素を含む:

```html
{% extends "layout/basic.html" %}
{% block content %}
<div class="row">
  <div class="medium-12 columns">
    <div class="section">
      <div class="section__header">
        <h1>{{ udoc.uname }} のブログ</h1>
        {% if handler.user._id === udoc._id %}
          <a href="/blog/{{ udoc._id }}/create" class="button">新規作成</a>
        {% endif %}
      </div>
      <div class="section__body">
        {% if ddocs.length === 0 %}
          <p>ブログ記事がありません。</p>
        {% else %}
          {% for ddoc in ddocs %}
            <div class="blog-entry">
              <h2><a href="/blog/{{ udoc._id }}/{{ ddoc.docId }}">{{ ddoc.title }}</a></h2>
              <p class="meta">
                {{ ddoc._id | formatTime }} |
                閲覧 {{ ddoc.view }} |
                返信 {{ ddoc.reply.length ?? 0 }} |
                スター {{ ddoc.star ?? 0 }}
              </p>
              <p>{{ ddoc.content | truncate(200) }}</p>
            </div>
          {% endfor %}
        {% endif %}
      </div>
      <div class="section__body">
        {{ paginator(page, dpcount, '/blog/' + udoc._id + '?page=') }}
      </div>
    </div>
  </div>
</div>
{% endblock %}
```

**ファイル**: `templates/blog_main.html`

---

## 🟡 中程度

### 3. `readFileSync` エラーハンドリング欠如

**問題**: `features/typing.ts` と `utils/public.ts` で `readFileSync` が例外をキャッチされず、ファイル欠落時にサーバークラッシュを引き起こす。

**解決策**: `try-catch` でラップする。

**`features/typing.ts`**:
```typescript
let rawWords: string;
try {
  rawWords = readFileSync(wordsPath, 'utf-8');
} catch {
  rawWords = '[]';
}
```

**`utils/public.ts`**:
```typescript
try {
  content = readFileSync(filePath);
} catch {
  this.response.status = 404;
  this.response.body = 'Not Found';
  return;
}
```

**ファイル**: `features/typing.ts`, `utils/public.ts`

---

### 4. 同期的ファイル読み込みによる性能問題

**問題**: `readFileSync` が `/typing` へのGETリクエスト毎に呼ばれ、イベントループをブロックする。

**解決策**: アプリケーション起動時に単語リストをメモリにキャッシュする。

```typescript
let wordsCache: WordItem[] | null = null;

function loadWords(): WordItem[] {
  if (wordsCache) return wordsCache;
  try {
    const raw = readFileSync(wordsPath, 'utf-8');
    wordsCache = JSON.parse(raw);
  } catch {
    wordsCache = [];
  }
  return wordsCache;
}
```

または、非同期版:

```typescript
import { readFile } from 'fs/promises';

let wordsCache: WordItem[] | null = null;

async function loadWords(): Promise<WordItem[]> {
  if (wordsCache) return wordsCache;
  try {
    const raw = await readFile(wordsPath, 'utf-8');
    wordsCache = JSON.parse(raw);
  } catch {
    wordsCache = [];
  }
  return wordsCache;
}
```

**ファイル**: `features/typing.ts`

---

### 5. スコアバリデーション欠如

**問題**: `POST /typing` で受け取るスコア値が無検証。`NaN`, `Infinity`, 負の値が許容される。

**解決策**: 以下のバリデーションを追加する:

```typescript
async post(domainId: string) {
  const score = Number(this.request.body.score);
  if (!Number.isFinite(score) || score < 0 || score > 300) {
    throw new ValidationError('score');
  }
  // ...
}
```

妥当なレンジ（0〜300 WPM）を設定する。

**ファイル**: `features/typing.ts`

---

### 6. `e.preventDefault()` 欠如

**問題**: `public/typing.js` の `keydown` ハンドラでイベント伝播が阻止されておらず、ブラウザショートカット（Ctrl+R など）が干渉する可能性がある。

**解決策**: ハンドラ先頭で `e.preventDefault()` を呼び出す。ただし、ゲーム対象外のキー（Ctrl, Alt, Meta）は無視する:

```javascript
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  // ... existing logic
});
```

**ファイル**: `public/typing.js`

---

### 7. 静的ファイルの Content-Type 不足

**問題**: CSS/JS 以外のファイル拡張子に対応する MIME タイプが設定されていない。

**解決策**: 拡張子マップを拡充する:

```typescript
const mimeMap: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
```

または、`mime` パッケージを利用する:

```typescript
import mime from 'mime';
const type = mime.getType(ext) || 'application/octet-stream';
```

**ファイル**: `utils/public.ts`

---

## 🟢 低優先度

### 8. `BlogModel.add()` の非 null アサーション

**問題**: `payload.content!` や `payload.owner!` が `Partial<BlogDoc>` に対する非 null アサーションであり、リファクタリング時に壊れやすい。

**解決策**: 事前に必須フィールドを検証し、型ガードで守る:

```typescript
static async add(payload: Partial<BlogDoc>) {
  if (!payload.content || !payload.owner || !payload.title) {
    throw new ValidationError('content, owner, title');
  }
  return await DocumentModel.add(
    'system', payload.content, payload.owner, TYPE_BLOG,
    null, null, null,
    _.omit(payload, ['domainId', 'content', 'owner']),
  ) as BlogDoc;
}
```

**ファイル**: `features/blog.ts`

---

### 9. `BlogModel.del()` の戻り値型

**問題**: `Promise<never>` が不適切。

**解決策**: `Promise<void>` に変更:

```typescript
static async del(did: ObjectId): Promise<void> {
  await Promise.all([
    DocumentModel.delete('system', TYPE_BLOG, null, null, { _id: did }),
    // ...
  ]);
}
```

**ファイル**: `features/blog.ts`

---

### 10. `BlogDetailHandler.post()` 不完全なスタブ

**問題**: 何も処理しない no-op メソッド。

**解決策**: 不要であれば削除する。またはスター/アンスターのトグル処理をここに移動する（現在は `get()` 内でクエリパラメータで処理されているが、POST の方が適切）。

```typescript
async post(domainId: string, did: ObjectId) {
  this.checkPriv(PRIV.PRIV_USER_PROFILE);
  const { type, id } = this.request.body;
  if (type === 'star') {
    await BlogModel.setStar(did, this.user._id, true);
    this.response.redirect = this.request.Referer;
  } else if (type === 'unstar') {
    await BlogModel.setStar(did, this.user._id, false);
    this.response.redirect = this.request.Referer;
  }
}
```

**ファイル**: `features/blog.ts`

---

### 11. テスト・Lint 設定欠如

**問題**: テストファイル・ESLint/Prettier 設定が一切存在しない。

**解決策**:

- テスティングフレームワークとして `mocha` + `chai` または `vitest` を追加
- `eslint` + `@typescript-eslint` の設定ファイルを作成
- `prettier` の設定ファイルを作成
- `package.json` に `test` スクリプトと `lint` スクリプトを追加

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts",
    "test": "mocha --require ts-node/register tests/**/*.ts"
  }
}
```

**ファイル**: `package.json`（新規: `.eslintrc.json`, `.prettierrc`, `tests/`）

---

### 12. README が不十分

**問題**: README がプロジェクト名のみ。

**解決策**: 以下の情報を含める:

```markdown
# hydro-typing

HydroOJ のタイピング練習＆個人ブログプラグイン。

## 機能

- **タイピング練習**: 3種類の難易度、WPM計測、TTS発音、スコア履歴
- **個人ブログ**: CRUD、返信/閲覧/スター、多言語対応

## インストール

```bash
yarn add hydro-typing
```

HydroOJ の `~/.config/hydro/plugins.json` に追加:

```json
["hydro-typing"]
```

## 開発

```bash
git clone ...
yarn install
# HydroOJ のパスを環境変数に設定
HYDRO_HOME=/path/to/hydrooj yarn dev
```
```

**ファイル**: `README.md`

---

## 実施優先度

| 優先度 | 項目 | 見積工数 |
|--------|------|----------|
| P0 | 2. blog_main.html 修正 | 30分 |
| P0 | 1. スコア削除エンドポイント実装 | 30分 |
| P1 | 3. readFileSync エラーハンドリング | 15分 |
| P1 | 4. 単語リストキャッシュ | 15分 |
| P1 | 5. スコアバリデーション | 10分 |
| P1 | 6. e.preventDefault() | 5分 |
| P2 | 7. Content-Type 拡充 | 10分 |
| P2 | 8-10. コード品質改善 | 20分 |
| P3 | 11-12. テスト・ドキュメント | 60分 |

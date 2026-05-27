# 修正計画 第2版 (コードレビュー結果)（修正済み）

> 作成日: 2026-05-25
> ベース: HydroOJ ソースコード解析ドキュメント (`docs/00~13`)
> レビュー方法: 全ソースファイル × 全ドキュメント のクロスリファレンス

---

## 🔴 CRITICAL — クラッシュ・データ損失・セキュリティ脆弱性

### CRIT-001: `readFileSync` にエラーハンドリングがない（サーバークラッシュ） (修正済み)

- **ファイル**: `features/typing.ts:21`
- **コード**: `const raw = readFileSync(filePath, 'utf-8');`
- **問題**: `words.json` が存在しない・破損している・権限がない場合、Node.js プロセス全体がクラッシュする。全ユーザーがアクセス不能になる。
- **ドキュメント参照**: `docs/12-plugin-development.md:7.2` — "readFileSync のエラーハンドリング"
- **修正**:
  ```typescript
  let raw: string;
  try { raw = readFileSync(filePath, 'utf-8'); } catch { raw = '[]'; }
  ```

### CRIT-002: `PublicFileHandler` の `readFileSync` にエラーハンドリングがない (修正済み)

- **ファイル**: `utils/public.ts:20`
- **コード**: `this.response.body = readFileSync(p, 'utf-8');`
- **問題**: 存在しないファイルをリクエストするとサーバーがクラッシュする。
- **ドキュメント参照**: `docs/04-routing.md:2.2` — リファレンス実装では try-catch で囲んでいる
- **修正**:
  ```typescript
  try { this.response.body = readFileSync(p, 'utf-8'); }
  catch { this.status = 404; this.response.body = 'Not Found'; }
  ```

### CRIT-003: テンプレート内で `.format()` を呼び出している（テンプレートレンダリング時 TypeError） (修正済み)

- **ファイル**: `templates/blog_detail.html:11,31`
- **コード**:
  - Line 11: `{{ _("{0}'s blog").format(udoc.uname) }}`
  - Line 31: `{{ _('{0} views').format(ddoc.views) }}`
- **問題**: `_()` は単なる文字列を返す。JavaScript の `String.prototype.format` は標準メソッドではない。テンプレートレンダリングが `TypeError` で失敗し、ページが 500 エラーになる。
- **ドキュメント参照**: `docs/07-i18n.md:3.1` — 正しい使い方は `{{ _('{0} views', ddoc.views) }}`
- **修正**:
  ```nunjucks
  {{ _("{0}'s blog", udoc.uname) }}
  {{ _('{0} views', ddoc.views) }}
  ```

---

## 🟠 HIGH — 機能バグ・欠落機能

### HIGH-001: パストラバーサル対策が不十分 (修正済み)

- **ファイル**: `utils/public.ts:10-11`
- **コード**: `if (!p.startsWith(base))`
- **問題**: `startsWith` はディレクトリ境界をチェックしない。`base` が `/foo/public` の場合、`/foo/public-other/evil.txt` のようなパスも通ってしまう。名前の先頭一致で誤認するケースがある。
- **ドキュメント参照**: `docs/04-routing.md:2.2` — "パストラバーサル対策"
- **修正**:
  ```typescript
  // FIX: HIGH-001 — startsWith はディレクトリ境界をチェックしないため base + '/' で境界チェックする
  if (!p.startsWith(base + '/') && p !== base) {
  ```
- **修正結果**: `utils/public.ts:10-11`

### HIGH-002: POST /typing でスコアバリデーションがない (修正済み)

- **ファイル**: `features/typing.ts:66-70`
- **コード**: `score: Number(score)` — 無検証でDBに保存
- **問題**: `NaN`, `Infinity`, 負の値, 300越えなどがそのまま保存される。履歴表示が壊れる可能性がある。
- **ドキュメント参照**: `docs/03-handlers.md:3.4` — Types.Float 等のバリデーションパターン
- **修正**:
  ```typescript
  const numScore = Number(score);
  if (!Number.isFinite(numScore) || numScore < 0 || numScore > 300) throw new ValidationError('score');
  ```
- **修正結果**: `features/typing.ts:66-70`

### HIGH-003: リクエスト毎の同期的ファイル読み込み（イベントループブロック） (修正済み)

- **ファイル**: `features/typing.ts:18-49`
- **コード**: `readFileSync` が GET リクエスト毎に呼ばれる
- **問題**: 同時アクセスが増えるとイベントループがブロックされる。`words.json` は 2800行・466語あり、毎回パースされる。
- **ドキュメント参照**: `docs/12-plugin-development.md:8.1` — "リクエスト毎に同期的ファイル読み込み" は明確に禁止
- **修正**: モジュールスコープでキャッシュする:
  ```typescript
  const wordsPath = join(__dirname, '..', 'typing_words', 'words.json');
  let wordsCache: WordItem[] | null = null;
  function loadWords(): WordItem[] {
    if (wordsCache) return wordsCache;
    try {
      const raw = readFileSync(wordsPath, 'utf-8');
      wordsCache = JSON.parse(raw).filter(/* ... */);
    } catch { wordsCache = []; }
    return wordsCache;
  }
  ```
- **修正結果**: `features/typing.ts:18-49`

### HIGH-004: `blog_main.html` が i18n を使わず日本語直書き (修正済み)

- **ファイル**: `templates/blog_main.html:10,17,26`
- **コード**:
  - Line 10: `{{ _("{0}'s blog", udoc.uname) }}`
  - Line 17: `{{ _('No blog posts.') }}`
  - Line 26: `{{ _('{0} views', ddoc.views) }}`
- **問題**: `features/blog.ts:221-224` で `zh`, `zh_TW`, `kr`, `en` の翻訳が登録されているが、テンプレートが日本語直書きなので全く活用されていない。
- **ドキュメント参照**: `docs/07-i18n.md:3.1` — テンプレート内での `_()` の使い方
- **修正**:
  ```nunjucks
  <h1>{{ _("{0}'s blog", udoc.uname) }}</h1>
  <p>{{ _('No blog posts.') }}</p>
  {{ _('{0} views', ddoc.views) }}
  ```
- **修正結果**: `templates/blog_main.html:10,17,26`（既に適用済み）

### HIGH-005: `blog_detail.html` で `url()` を使わずハードコードされたパス

- **ファイル**: `templates/blog_detail.html:35`
- **コード**: `{{ url('wiki_help', anchor='contact') }}`
- **問題**: `wiki_help` は標準ルート名ではない。このルートが存在しない場合、`url()` は `#` を返しリンクが機能しない。
- **ドキュメント参照**: `docs/04-routing.md:5.1` — url() の使用
- **修正**: ルート名を確認するか、ハードコードされたURLを使用する。または `manage_help` などの既存ルート名を使う。

---

## 🟡 MEDIUM — コード品質・不整合・保守性

### MED-001: `typing.js` の `keydown` ハンドラに `e.preventDefault()` がない

- **ファイル**: `public/typing.js:205`
- **問題**: タイピング中に Ctrl+W（タブ閉じる）、Ctrl+R（リロード）、Space（スクロール）、Ctrl+T（新規タブ）などが作動する可能性がある。
- **ドキュメント参照**: `docs/12-plugin-development.md` — クライアントサイドの注意点
- **修正**:
  ```javascript
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    // ... existing logic
  });
  ```

### MED-002: MIME タイプ判定がCSS/JSのみ

- **ファイル**: `utils/public.ts:16-17`
- **問題**: 将来的に `.html`, `.json`, `.png`, `.svg`, `.ico` 等を追加したときに Content-Type が設定されない。
- **ドキュメント参照**: `docs/04-routing.md:2.2` — mimeMap を使用するリファレンス実装
- **修正**:
  ```typescript
  const mimeMap: Record<string, string> = {
    '.css': 'text/css', '.js': 'application/javascript',
    '.html': 'text/html', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  };
  const ext = filename.substring(filename.lastIndexOf('.'));
  if (mimeMap[ext]) this.response.type = mimeMap[ext];
  ```

### MED-003: `BlogModel.del()` の戻り値型が `Promise<never>`（誤り）

- **ファイル**: `features/blog.ts:73`
- **コード**: `static del(did: ObjectId): Promise<never>`
- **問題**: `Promise<never>` は「この関数は決して resolve しない」ことを意味する。実際は `Promise<void[]>` を返す。型の安全性が損なわれている。
- **ドキュメント参照**: `docs/05-database.md:2.2` — DocumentModel.deleteOne は `Promise<void>`
- **修正**: `static async del(did: ObjectId): Promise<void>`

### MED-004: `BlogModel.add()` で非 null アサーション (非安全)

- **ファイル**: `features/blog.ts:54-55`
- **コード**: `payload.content!`, `payload.owner!`
- **問題**: `payload` は `Partial<BlogDoc>` なので `content` や `owner` が undefined の可能性がある。非 null アサーションは実行時チェックをバイパスする。
- **ドキュメント参照**: `docs/12-plugin-development.md:6.1` — Modelパターンではバリデーション推奨
- **修正**:
  ```typescript
  if (!owner || !title || !content) throw new ValidationError('content, owner, title');
  ```

### MED-005: `typingScores` コレクションが `Collections` インターフェースに未登録

- **ファイル**: `features/typing.ts`（`declare module` がない）
- **問題**: `this.ctx.db.collection<TypingScore>('typingScores')` は実行時は動作するが、型安全ではない。クエリの自動補完が効かない。
- **ドキュメント参照**: `docs/05-database.md:3.1` — Collections インターフェースの拡張
- **修正**:
  ```typescript
  declare module 'hydrooj' {
    interface Collections { typingScores: TypingScore; }
  }
  ```

### MED-006: `hydrooj` が devDependencies にある（実行時エラー）

- **ファイル**: `package.json:9`
- **コード**: `"devDependencies": { "hydrooj": "^5.0.1" }`
- **問題**: プラグインとして npm インストールされた場合、`devDependencies` はインストールされない。実行時に `MODULE_NOT_FOUND` エラーになる。
- **ドキュメント参照**: `docs/02-plugin-entry.md:1.1` — プラグイン登録方法
- **修正**: `dependencies` に移動:
  ```json
  "dependencies": { "hydrooj": "^5.0.1" }
  ```

### MED-007: Nav の injectUI に無効な `uid` フィールド

- **ファイル**: `index.ts:24`
- **コード**: `ctx.injectUI('Nav', 'typing_main', { ... uid: h.user._id.toString() })`
- **問題**: Nav スロットの args は `{ icon, displayName, prefix, query, before }`。`uid` は UserDropdown スロット専用で Nav では無視される。無駄なデータ送信かつ混乱を招く。
- **ドキュメント参照**: `docs/08-ui-injection.md:7.1` — Nav args の定義; `7.2` — UserDropdown args の定義
- **修正**: `uid` を削除:
  ```typescript
  ctx.injectUI('Nav', 'typing_main', { icon: 'keyboard', displayName: 'Typing', prefix: 'typing' }, PRIV.PRIV_USER_PROFILE);
  ```

### MED-008: `postStar`/`postUnstar` に権限チェックがない

- **ファイル**: `features/blog.ts:162-172`
- **問題**: `blog_detail` ルートは `PRIV.PRIV_USER_PROFILE` なしで登録されている。`postStar`/`postUnstar` メソッド内で `checkPriv()` を呼んでいないため、未ログインユーザーでもスター操作が可能。
- **ドキュメント参照**: `docs/03-handlers.md:2` — operation ルーティングの仕組み
- **修正**:
  ```typescript
  async postStar({}, did: ObjectId) {
    this.checkPriv(PRIV.PRIV_USER_PROFILE);
    // ...
  }
  ```

### MED-009: `mongodb` パッケージへの直接依存（推移的依存）

- **ファイル**: `features/blog.ts:12`
- **コード**: `import type { UpdateFilter } from 'mongodb';`
- **問題**: `mongodb` は `hydrooj` の推移的依存。将来の HydroOJ が MongoDB ドライバを変更すると壊れる可能性がある。
- **ドキュメント参照**: `docs/02-plugin-entry.md` — 依存関係の明示
- **修正**: `mongodb` を `dependencies` に追加するか、`hydrooj` から再エクスポートされている型を使う

### MED-010: `Number(score)` の重複変換

- **ファイル**: `features/typing.ts:51,57`
- **コード**: `const { score } = this.request.body;` → `score: Number(score)`
- **問題**: `this.request.body` はすでに `koa-body` によってパース済み。フォーム送信でも文字列として渡されるため `Number()` は必要だが、`@param('score', Types.Float)` を使えば `Number()` 変換は自動で行われる。デコレータを使わず手動変換しているのが不統一。
- **ドキュメント参照**: `docs/03-handlers.md:3.3` — @param デコレータのパターン
- **修正**: パターンを統一する。（`@param` を使うか、`this.request.body` を一貫して使うか）

---

## 🟢 LOW — スタイル・ドキュメント・細かい改善

### LOW-001: ハードコードされたURL（`url()` を使っていない）

- **ファイル**: `templates/blog_main.html:9,18,30`, `features/typing.ts:73`, `templates/typing.html:60,102`
- **問題**: `/typing`, `/typing/delete`, `/blog/{{ id }}/create` 等がハードコード。ドメインID が自動付与されない、ルート変更時に追従できない。
- **ドキュメント参照**: `docs/04-routing.md:5.4` — url() は自動的に `/d/<domainId>` を前置する
- **修正**:
  ```nunjucks
  <a href="{{ url('blog_create', uid=udoc._id) }}">{{ _('Create') }}</a>
  ```
  ```typescript
  this.response.redirect = this.url('typing_main');
  ```

### LOW-002: テンプレートの `typing.html` で `{{ words | safe }}` による XSS リスク

- **ファイル**: `templates/typing.html:127`
- **コード**: `const items = {{ words | safe }};`
- **問題**: `words` はサーバー生成のJSONであれば安全だが、`words.json` が改ざんされた場合に XSS が発生しうる。JSON を直接埋め込むより `JSON.parse()` が安全。
- **ドキュメント参照**: `docs/06-templates.md:8` — XSS対策
- **修正**:
  ```nunjucks
  const items = JSON.parse('{{ words | addslashes | safe }}');
  ```

### LOW-003: `tsconfig.json` に `@types/node` がない

- **ファイル**: `tsconfig.json:12`
- **コード**: `"types": []`
- **問題**: `__dirname`, `Buffer`, `process` などのNode.js組込み型の補完が効かない。
- **修正**: `"types": ["node"]` に変更し、`@types/node` をインストール

### LOW-004: `package.json` に `test`/`build`/`lint` スクリプトがない

- **ファイル**: `package.json`
- **問題**: テスト・ビルド・リントの標準コマンドが未定義。
- **ドキュメント参照**: `docs/02-plugin-entry.md` — プラグインの標準セットアップ
- **修正**:
  ```json
  "scripts": {
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit"
  }
  ```

### LOW-005: `README.md` がスタブ（2行）のみ

- **ファイル**: `README.md`
- **問題**: インストール方法、使い方、開発手順の記載がない。
- **修正**: `docs/00-index.md` を参照して README を充実させる。

### LOW-006: 日付整形で `getDay()` が曜日インデックスではなく `getDate()` の誤用の可能性

- **ファイル**: `public/typing.js:247`
- **コード**: `weekday[d.getDay()]` — `getDay()` は曜日インデックス (0=Sun) を返す。正しい。
- **問題**: 実際には正しいが、`d.getDay()` と `d.getDate()` の混同がよくあるバグ。コメントで明示すると親切。

### LOW-007: `BlogDetailHandler.post()` が no-op（空のメソッド）

- **ファイル**: `features/blog.ts:158-160`
- **問題**: POSTリクエストに対して `checkPriv()` のみ実行し、レスポンスを返さない。operation なしのPOSTが来た場合に空レスポンスが返る。
- **ドキュメント参照**: `docs/03-handlers.md:2` — 操作不能時は `InvalidOperationError`
- **修正**: メソッドを削除するか、適切なエラーハンドリングを追加:
  ```typescript
  async post() {
    throw new InvalidOperationError('post');
  }
  ```

---

## 優先度マトリクス

| 優先度 | ID | 項目 | 工数 | 影響範囲 |
|--------|----|------|------|---------|
| **P0** | CRIT-001 | readFileSync エラーハンドリング (typing.ts) | 3行 | サーバー安定性 |
| **P0** | CRIT-002 | readFileSync エラーハンドリング (public.ts) | 5行 | サーバー安定性 |
| **P0** | CRIT-003 | テンプレート `.format()` 修正 | 2行 | ページ表示 |
| **P1** | HIGH-001 | パストラバーサル対策強化 | 1行 | セキュリティ | ✅ 修正済み |
| **P1** | HIGH-002 | スコアバリデーション追加 | 3行 | データ品質 | ✅ 修正済み |
| **P1** | HIGH-003 | 単語リストキャッシュ | 15行 | パフォーマンス | ✅ 修正済み |
| **P1** | HIGH-004 | blog_main.html i18n対応 | 5行 | 国際化 | ✅ 修正済み |
| **P1** | MED-001 | keydown preventDefault | 3行 | UX |
| **P2** | MED-002 | MIMEタイプ拡充 | 10行 | 保守性 |
| **P2** | MED-003 | BlogModel.del 戻り値型修正 | 1行 | 型安全 |
| **P2** | MED-004 | BlogModel.add 非null assertion排除 | 5行 | 型安全 |
| **P2** | MED-006 | hydrooj → dependencies | 1行 | インストール |
| **P2** | MED-007 | Navのuid削除 | 1行 | コード品質 |
| **P2** | MED-008 | postStar/postUnstar権限チェック | 2行 | セキュリティ |
| **P3** | MED-005 | Collections 型拡張 | 5行 | 型安全 |
| **P3** | LOW-001〜007 | スタイル・ドキュメント改善 | 各種 | 品質向上 |

---

## 参考: レビューで使用したドキュメント

| ドキュメント | 確認した観点 |
|------------|------------|
| `01-architecture.md` | 全体構成、プラグインの登録・起動フロー |
| `02-plugin-entry.md` | Context API (Route, injectUI, i18n), import可能な全シンボル |
| `03-handlers.md` | Handler ライフサイクル, @param デコレータ, Types 一覧, Response |
| `04-routing.md` | 静的ファイル配信, URL逆引き, ルート登録パターン |
| `05-database.md` | DocumentModel CRUD, コレクション型拡張, ページネーション |
| `06-templates.md` | Nunjucks フィルター, グローバル関数, XSS対策 |
| `07-i18n.md` | 翻訳の登録・取得, `_()` の引数パターン |
| `08-ui-injection.md` | injectUI のスロット別 args定義, 権限チェッカー |
| `09-error-handling.md` | エラークラス階層, onerror の動作 |
| `10-middleware.md` | レイヤーシステム, イベントフック |
| `11-permissions.md` | PRIV/PERM 定義, checkPerm/checkPriv |
| `12-plugin-development.md` | ベストプラクティス, アンチパターン |
| `13-model-api-reference.md` | 各モデルのAPIシグネチャ |

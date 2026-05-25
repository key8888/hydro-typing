# テンプレートシステム (Nunjucks)

> ソース: `Hydro/framework/framework/server.ts` (renderHTML)
> 参考: `Hydro/packages/hydrooj/src/handler/` (テンプレート使用例)

---

## 1. テンプレートエンジン

HydroOJ のテンプレートエンジンは **Nunjucks** (Mozilla 製、JavaScript テンプレートエンジン)。
レンダリングは `HandlerCommon.renderHTML()` を通じて行われる。

```typescript
// ハンドラ内でテンプレートを指定
this.response.template = 'typing.html';
this.response.body = { words: [...], history: [...] };
```

テンプレートが設定されると、HydroOJ は以下の優先順位でレンダラーを選択する:

1. テンプレート名を受け入れるレンダラー (accept リストに含まれる)
2. フォールバックレンダラー (`asFallback: true`)
3. JSON シリアライザー (どのレンダラーも一致しない場合)

---

## 2. テンプレートが受け取る変数

テンプレートには `this.response.body` で設定したデータに加えて、
以下のグローバル変数が自動的に注入される:

### 2.1 自動注入変数

| 変数 | 型 | 説明 |
|------|-----|------|
| `handler` | `Handler` | 現在のハンドラインスタンス |
| `UserContext` | `User` | 現在のユーザー |
| `_` | `Function` | 翻訳関数 |
| `url` | `Function` | URL 生成関数 |
| `model` | グローバル | `global.Hydro.model` への参照 |
| `db` | グローバル | `global.Hydro.db` |
| `UiContext` | オブジェクト | UI コンテキスト (CDN設定等) |
| `PRIV` | オブジェクト | PRIV 定数 (権限チェック用) |
| `PERM` | オブジェクト | PERM 定数 |
| `avatarUrl` | `Function` | アバターURL生成 |
| `datetimeSpan` | `Function` | 日付フォーマット |
| `user` | グローバル | UserModel への参照 (非推奨) |

### 2.2 ハンドラから渡す典型的な変数

```typescript
// 一覧ページ
this.response.body = {
  ddocs,           // ドキュメント配列
  udoc,            // ユーザードキュメント
  page,            // 現在のページ番号
  dpcount,         // 総ページ数
};

// 詳細ページ
this.response.body = {
  ddoc,            // ドキュメント詳細
  udoc,            // ユーザー情報
  dsdoc,           // ユーザーステータス (スター等)
};
```

---

## 3. テンプレート構文リファレンス

### 3.1 変数展開

```nunjucks
{{ variable }}
{{ variable | filter }}
{{ variable | filter1 | filter2 }}
{{ variable | default('fallback') }}
```

### 3.2 制御構文

```nunjucks
{% if condition %}
  ...
{% elseif otherCondition %}
  ...
{% else %}
  ...
{% endif %}

{% for item in items %}
  {{ item }}
{% endfor %}

{% for item in items %}
  {% if loop.first %}<ul>{% endif %}
  <li>{{ item }}</li>
  {% if loop.last %}</ul>{% endif %}
{% else %}
  <p>No items</p>
{% endfor %}
```

### 3.3 テンプレート継承

```nunjucks
{% extends "layout/basic.html" %}

{% block content %}
  <div class="section">
    <div class="section__header">
      <h1>タイトル</h1>
    </div>
    <div class="section__body">
      コンテンツ
    </div>
  </div>
{% endblock %}
```

利用可能なブロック:

| ブロック名 | 用途 |
|-----------|------|
| `title` | ページタイトル |
| `content` | メインコンテンツ領域 |
| `header` | ヘッダー領域 |
| `sidebar` | サイドバー |
| `footer` | フッター |
| `script` | 追加スクリプト |
| `style` | 追加スタイル |

### 3.4 インクルードとインポート

```nunjucks
{% include "components/md_hint.html" %}

{% import "components/form.html" as form with context %}
{{ form.form_textarea({ ... }) }}
```

---

## 4. テンプレートフィルター

### 4.1 HydroOJ 組込みフィルター

| フィルター | 使用例 | 説明 |
|-----------|--------|------|
| `default(val)` | `{{ title \| default('Untitled') }}` | デフォルト値 |
| `safe` | `{{ html \| safe }}` | HTML エスケープしないで出力 |
| `markdown` | `{{ content \| markdown }}` | Markdown を HTML に変換 |
| `truncate(n)` | `{{ content \| truncate(200) }}` | 文字列を n 文字に切り詰め |
| `formatTime` | `{{ doc._id \| formatTime }}` | ObjectId から日付をフォーマット |
| `json` | `{{ data \| json }}` | JSON 文字列に変換 |
| `urlencode` | `{{ str \| urlencode }}` | URL エンコード |

**注意:** `formatTime` は MongoDB の ObjectId (`_id`) からタイムスタンプを抽出して日付文字列を生成する。
Date 型オブジェクトには使えない。

### 4.2 文字列切り詰め (truncate)

```nunjucks
<p>{{ ddoc.content | truncate(200) }}</p>
```

最初の200文字を表示。HTML タグは除去されないため注意。

### 4.3 Markdown レンダリング

```nunjucks
<div class="content">
  {{ ddoc.content | markdown | safe }}
</div>
```

`markdown` フィルターは Markdown → HTML 変換を行う。
`safe` フィルターがないと HTML がエスケープされる。

---

## 5. テンプレートグローバル関数

### 5.1 `_(key, ...args)`

翻訳関数。`ctx.i18n.load()` で登録した翻訳を取得する。

```nunjucks
{{ _('Blog') }}
{{ _('{0} views', views) }}
{{ _('Hello, {0}!', user.uname) }}
```

### 5.2 `url(name, params)`

URL 逆引き関数。`this.url()` と同じ。

```nunjucks
<a href="{{ url('blog_main', uid=udoc._id) }}">{{ _('Blog') }}</a>
<a href="{{ url('blog_create', uid=handler.user._id) }}">{{ _('New Post') }}</a>
```

### 5.3 `avatarUrl(udoc, size)`

アバターURLを生成する。

```nunjucks
<img src="{{ avatarUrl(udoc, 80) }}" width="80" height="80">
```

### 5.4 `datetimeSpan(docId)`

ObjectId から日付文字列を生成する。

```nunjucks
{{ datetimeSpan(ddoc._id) | safe }}
```

### 5.5 `paginator(page, totalPages, baseUrl)`

ページネーションUIをレンダリングする。

```nunjucks
{{ paginator(page, dpcount, '/blog/' + udoc._id + '?page=') }}
```

### 5.6 `user.render_inline(udoc)`

ユーザーのインライン表示（アイコン+名前）をレンダリング。

```nunjucks
{{ user.render_inline(udoc) }}
```

---

## 6. テンプレート内での権限チェック

```nunjucks
{% if handler.user._id === udoc._id %}
  <a href="/blog/{{ udoc._id }}/create" class="button">新規作成</a>
{% endif %}

{% if ddoc and (handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) or handler.user.own(ddoc)) %}
  <button name="operation" value="delete" type="submit">削除</button>
{% endif %}
```

利用可能なヘルパー:

```nunjucks
handler.user._id                  // ユーザーID
handler.user.uname                // ユーザー名
handler.user.own(ddoc)            // 所有権チェック
handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)  // 特権チェック
handler.user.hasPerm(PERM.PERM_VIEW_PROBLEM)  // 権限チェック (ドメイン)
```

---

## 7. テンプレート内で利用可能なグローバルモデル

```nunjucks
{{ model.user.getById(domainId, uid) }}
```

ただしテンプレート内で直接モデルを呼び出すのは推奨しない。
必要なデータはハンドラ側で事前に取得してテンプレートに渡すこと。

---

## 8. XSS 対策

```nunjucks
<!-- 危険: ユーザー入力は自動エスケープされる -->
{{ userContent }}

<!-- 危険: safe を使用するとエスケープが解除される -->
{{ userContent | safe }}

<!-- 安全な safe の使用例: Markdown 変換後 -->
{{ content | markdown | safe }}

<!-- 安全な safe の使用例: JSON データ (サーバー生成) -->
<script>const data = {{ jsonData | safe }};</script>
```

**原則:**
- 常に `safe` なしで出力する (自動エスケープ)
- `safe` を使うのは、信頼できるデータ（Markdown変換後、サーバー生成JSON）のみ
- ユーザー入力を直接 `safe` で出力しない

---

## 9. テンプレートの配置とロード

テンプレートはプラグインの `templates/` ディレクトリに配置する。
HydroOJ のローダーが自動的にテンプレートディレクトリを認識し、
テンプレート名で参照できるようになる。

```
my-plugin/
  templates/
    my-template.html     # 'my-template.html' として参照可能
    sub/
      partial.html       # 'sub/partial.html' として参照可能
```

ベーステンプレート `layout/basic.html` は HydroOJ 本体が提供する。

---

## 10. テンプレートの注意点

1. **テンプレート名の衝突**: プラグイン間で同じテンプレート名を使うと
   先にロードされたものが優先される。プレフィックスを付けることを推奨。

2. **Async レンダリング**: Nunjucks はテンプレート内での非同期処理を
   サポートしていない。すべてのデータはハンドラ内で事前に解決すること。

3. **デバッグ**: `process.env.DEV` が設定されている場合、テンプレートの
   キャッシュが無効化され、変更が即座に反映される。

4. **テンプレートサイズ**: 大きなテンプレートはパフォーマンスに影響する。
   繰り返し処理が多い場合はページネーションを活用する。

# hydro-typing プロジェクト分析

> 作成日: 2026-05-25
> 対象: https://github.com/key8888/hydro-typing.git (v1.0.0, HydroOJ ^5.0.1)

---

## 1. プロジェクト概要

### 1.1 目的

hydro-typing は HydroOJ のプラグインであり、**タイピング練習機能**と**個人ブログ機能**の2つを提供する。

### 1.2 機能一覧

| 機能 | 説明 | ソース |
|------|------|--------|
| タイピング練習 | 3段階の難易度（初級/中級/上級）、WPM計測、TTS発音、スコア履歴、スコア削除 | `features/typing.ts`, `public/typing.js`, `public/typing.css` |
| 個人ブログ | CRUD、返信、閲覧数、スター、多言語対応（zh/zh_TW/kr/en） | `features/blog.ts`, `templates/blog_*.html` |
| 静的ファイル配信 | `/public/:filename` でCSS/JSを配信 | `utils/public.ts` |

### 1.3 アーキテクチャ

```
起動フロー:
  HydroOJ
    -> plugins.json に従いプラグインをロード
    -> exports.apply(ctx: Context) を呼び出す (index.ts)
      -> applyBlog(ctx)   : /blog/:uid/* ルート + i18n 登録
      -> applyTyping(ctx) : /typing, /typing/delete ルート登録
      -> ctx.Route('public_files', '/public/:filename', PublicFileHandler)
      -> ctx.injectUI('UserDropdown', ...) => Blog リンク
      -> ctx.injectUI('Nav', ...)          => Typing リンク

ルート一覧:
  /typing               GET/POST  TypingHandler          (PRIV_USER_PROFILE)
  /typing/delete        POST      TypingDeleteHandler    (PRIV_USER_PROFILE)
  /blog/:uid            GET       BlogUserHandler
  /blog/:uid/create     GET/POST  BlogEditHandler        (PRIV_USER_PROFILE)
  /blog/:uid/:did       GET/POST  BlogDetailHandler
  /blog/:uid/:did/edit  GET/POST  BlogEditHandler        (PRIV_USER_PROFILE)
  /public/:filename     GET       PublicFileHandler
```

### 1.4 ファイル構成

```
hydro-typing/
  index.ts              # プラグインエントリポイント
  features/
    typing.ts           # タイピング練習ハンドラ (80行)
    blog.ts             # ブログ Model + Handlers + i18n (225行)
  utils/
    public.ts           # 静的ファイル配信ハンドラ (22行)
  templates/
    typing.html         # タイピングゲームUI (Nunjucks)
    blog_main.html      # ブログ一覧
    blog_detail.html    # ブログ詳細
    blog_edit.html      # ブログ作成/編集フォーム
  public/
    typing.css          # タイピングゲームスタイル (363行)
    typing.js           # タイピングゲームロジック (249行)
    tailwind.js         # Tailwind CSS CDNバンドル
  typing_words/
    words.json          # 英単語リスト (~466語)
  package.json          # 依存: hydrooj ^5.0.1 (devDep)
  tsconfig.json         # strict, decorators有効
  README.md             # スタブ (2行)
  FIX_PLAN.md           # 修正計画 (日本語, 12項目)
  memo.txt              # 開発メモ (日本語)
```

### 1.5 技術スタック

- **言語**: TypeScript (strict mode, experimentalDecorators)
- **テンプレート**: Nunjucks (HydroOJ 標準)
- **データベース**: MongoDB (直接アクセス + HydroOJ DocumentModel)
- **クライアントサイド**: バニラJS + Tailwind CSS
- **パッケージマネージャ**: yarn

---

## 2. 開発継続に必要なドキュメント

### 2.1 総評: ドキュメントは「不可欠」である

現状、このプロジェクトを継続開発するには**十分なドキュメントが存在しない**。理由は以下の通り:

| 観点 | 現状 | 問題 |
|------|------|------|
| セットアップ手順 | `memo.txt` に日本語で簡単な記載のみ | 英語話者の開発者には読めない。手順が不完全 |
| API仕様 | 一切なし。コードを読んで理解する必要がある | 習得コストが極めて高い |
| アーキテクチャ説明 | なし | 処理の流れを全体把握できない |
| 開発フロー | なし | ビルド方法、テスト方法、デバッグ方法が不明 |
| コメント | ほぼなし（FIX_PLAN.md は除く） | コードの意図がわかりにくい |
| 変更履歴 | なし | どのバージョンで何が変わったか追跡不能 |

### 2.2 必要となるドキュメント一覧

優先度順:

| 優先度 | ドキュメント | 理由 |
|--------|-------------|------|
| **P0** | **README.md の充実** | プロジェクトの顔。インストール方法、使い方、開発手順を記載しないと誰も使えない・開発に参加できない |
| **P0** | **セットアップガイド** | HydroOJ のインストール、プラグイン登録、開発用 HydroOJ インスタンスの起動方法を詳細に記述 |
| **P1** | **アーキテクチャ文書** | ルーティング、Model/Handler/テンプレートの関係、データフローを図解。これがないと修正箇所の特定に時間がかかる |
| **P1** | **APIリファレンス** | 各 Handler の入出力、MongoDB コレクションスキーマ、テンプレート変数一覧。バグ修正や機能追加に必須 |
| **P2** | **コントリビューションガイド (CONTRIBUTING.md)** | コーディング規約、PR/ブランチ戦略、テスト方針。外部コントリビューターを募るなら必須 |
| **P2** | **JSDoc / TSDoc コメント** | 全公開クラス・メソッドにドキュメントコメントを付与。エディタの補完が効くようになり開発効率向上 |
| **P3** | **CHANGELOG.md** | バージョン管理とリリースノート。利用者がアップデート可否を判断するために必要 |
| **P3** | **テストドキュメント** | テストの実行方法、モック戦略、テストケースの書き方 |

### 2.3 ドキュメント作成の判断基準

新規にドキュメントを作るべきかどうかは以下の基準で判断する:

```
Q1. この情報がなくても 30分以内 に開発・修正できるか？
  Yes → ドキュメント不要（単純な処理）
  No  → Q2 へ

Q2. この情報はコードの中に自然に表現できるか？
  Yes → コメントや型定義でカバー（ドキュメントよりコードを信頼せよ）
  No  → 外部ドキュメントを作成すべき
```

**具体例**:

| 情報 | 判断 | 理由 |
|------|------|------|
| Handler の引数 | ✅ コードで十分 | TypeScriptの型と `@param` デコレータで表現済み |
| データベーススキーマ | ⚠️ ドキュメント推奨 | `typingScores` コレクションは型定義のみで、暗黙的な制約（scoreの範囲など）がコードから読み取れない |
| ルーティング一覧 | ⚠️ ドキュメント推奨 | ルートが複数ファイルに散らばっている。一覧がないと全体把握が困難 |
| プラグインのインストール手順 | ✅ ドキュメント必須 | コードからは一切推測できない |

---

## 3. HydroOJ ソースコードの必要性

### 3.1 結論: 現状の開発スタイルでは「必要」

hydro-typing は以下の理由から、HydroOJ 本体のソースコードを参照しながら開発することを前提としている:

### 3.2 HydroOJ ソースコードが必要な理由

| # | 理由 | 詳細 |
|---|------|------|
| 1 | **TypeScript 型定義の不足** | `hydrooj` パッケージの型定義 (`d.ts`) は不完全であり、`this.response.addHeader()` などのメソッドや、`DocumentModel.*` の一部メソッドの正確なシグネチャを確認するにはソースコードを直接読む必要がある |
| 2 | **暗黙的なフレームワーク動作** | `@param` デコレータのパラメータ解決順序、`_prepare` の呼び出しタイミング、ルートとメソッドのマッピングルールなど、フレームワークの内部動作を理解するには `@hydrooj/framework` のソースが必要 |
| 3 | **テンプレートグローバル** | `{{ url() }}`, `{{ _() }}`, `{{ paginator() }}`, `{{ formatTime }}` など、テンプレート内で使用できるグローバル関数・フィルタの一覧は HydroOJ のテンプレート設定を確認しないとわからない |
| 4 | **宣言マージの互換性** | `declare module 'hydrooj' { interface Model { blog: ... } }` のような宣言マージは、HydroOJ のインターフェース定義が変更されると静かに壊れる。ソースコードがないと追従が不可能 |
| 5 | **エラークラスの階層** | `NotFoundError`, `ForbiddenError` などがどのような引数を取るか、`UserFacingError` との継承関係はどうなっているか、ソースを確認しないと正しい使い方がわからない |

### 3.3 HydroOJ ソースコードが「不要」になる条件

以下の条件をすべて満たせば、HydroOJ のソースコードがなくても開発できる:

| # | 条件 | 対応策 |
|---|------|--------|
| 1 | **公開API型定義が完全** | HydroOJ がすべての公開APIに対して `d.ts` を整備し、`@hydrooj/framework` も含めて npm パッケージとして十分な型情報を提供する |
| 2 | **APIリファレンスが充実** | `Context`, `Handler`, `DocumentModel`, `param`, `Types`, テンプレート関数など、プラグイン開発に必要なAPIの完全なリファレンスが公式ドキュメントとして提供される |
| 3 | **プラグイン開発ガイドが存在** | HydroOJ 公式が「プラグイン開発ガイド」を用意し、以下のベストプラクティスを文書化している:
  - ルート登録パターン
  - ハンドラの実装パターン
  - テンプレートの拡張方法
  - i18n の追加方法
  - 静的ファイルの配置方法
  - モデル拡張の手順 |

### 3.4 判断条件のまとめ

```
HydroOJ ソースコードが必要か？

  YES ─┬─ 型定義が不完全である
        ├─ フレームワークの内部動作を理解したい
        ├─ ドキュメント化されていないAPIを使っている
        └─ 宣言マージやグローバル拡張を使用している

  NO ───┬─ HydroOJ が完全な型定義を提供している
         ├─ 公式APIドキュメントが充実している
         ├─ プラグイン開発ガイドが存在する
         └─ フレームワーク内部に依存しないコードになっている
```

### 3.5 結論と推奨

**現在の hydro-typing のコード品質・開発スタイルでは、HydroOJ のソースコードへの依存度が高い。**

もしこのプロジェクトを長期的に保守・発展させるならば、以下の2つの方向性がある:

| 方向性 | アプローチ | メリット | デメリット |
|--------|-----------|---------|-----------|
| **A: 現状維持** | HydroOJ ソースを参照しながら開発。依存を明示的に管理しない | 開発速度が速い | 新規開発者の参入障壁が高い。HydroOJ のバージョンアップ時に追従が困難 |
| **B: 依存度低減** | 以下の対策を実施:
  1. 使用しているHydroOJ API をラッパー層で隔離
  2. テンプレートに依存せず API ベースのUIを検討
  3. テストコードでHydroOJ モックを整備
  4. README とAPIリファレンスを充実 | 保守性・移植性が向上。新規開発者が参入しやすい | 初期工数がかかる（見積: 2〜3日） |

**中長期的には方向性Bを推奨する**が、短期的にバグ修正のみを行うのであれば、HydroOJ ソースコードを参照できる環境を整えた上で方向性Aでも十分開発可能である。

---

## 4. 参考: 補足情報

### 4.1 現時点で判明している問題（クリティカル）

| # | 問題 | ファイル | 行 |
|---|------|---------|-----|
| 1 | `readFileSync` にエラーハンドリングがない → ファイル欠落でサーバクラッシュ | `features/typing.ts` | 21 |
| 2 | 同上 | `utils/public.ts` | 20 |
| 3 | スコアバリデーションがない（NaN, Infinity, 負の値をDBに保存可能） | `features/typing.ts` | 51-58 |
| 4 | `BlogModel.del()` の戻り値型が `Promise<never>`（誤り） | `features/blog.ts` | 73 |

### 4.2 依存APIサマリ

hydro-typing が使用している HydroOJ の API は以下の3カテゴリに分類される:

**カテゴリA: 安定API（変更リスク低）**
- `Context.Route()`, `Context.injectUI()`, `Context.i18n.load()`
- `Handler` クラス, `PRIV` 定数
- `this.response.*`, `this.request.*`
- `NotFoundError`, `ForbiddenError`, `ValidationError`

**カテゴリB: 内部API（変更リスク中）**
- `DocumentModel.*`, `OplogModel.*`, `UserModel.*`
- `this.ctx.db.collection()`, `this.ctx.db.paginate()`
- `this.url()`, `this.back()`, `this.checkPriv()`, `this.limitRate()`
- `@param`, `Types` デコレータ

**カテゴリC: 不安定API（変更リスク高）**
- `declare module 'hydrooj' { interface Model { blog: ... } }` （宣言マージ）
- `global.Hydro.model.blog = BlogModel` （グローバルレジストリ）
- `{{ paginator() }}` などのテンプレートグローバル
- `this.response.addHeader()` （`HydroResponse` インターフェースの非標準メソッド）
- 直接のMongoDBコレクションアクセス（`this.ctx.db.collection('typingScores')`）

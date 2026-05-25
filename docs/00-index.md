# HydroOJ プラグイン開発ドキュメント

## インデックス

| # | ファイル | 内容 |
|---|---------|------|
| 1 | [01-architecture.md](./01-architecture.md) | HydroOJ 全体アーキテクチャ、リポジトリ構成、コアコンセプト |
| 2 | [02-plugin-entry.md](./02-plugin-entry.md) | プラグインエントリポイント、Context API (Route, injectUI, i18n, on) |
| 3 | [03-handlers.md](./03-handlers.md) | Handler クラス階層、リクエストライフサイクル、@param デコレータ、Response |
| 4 | [04-routing.md](./04-routing.md) | ルーティングシステム、URL 逆引き、静的ファイル配信、WebSocket |
| 5 | [05-database.md](./05-database.md) | DocumentModel (CRUD/ステータス/サブドキュメント)、直接MongoDBアクセス |
| 6 | [06-templates.md](./06-templates.md) | Nunjucks テンプレートシステム、フィルター、グローバル関数 |
| 7 | [07-i18n.md](./07-i18n.md) | 国際化 (i18n) システム、翻訳の登録と取得 |
| 8 | [08-ui-injection.md](./08-ui-injection.md) | UI インジェクション (Nav, UserDropdown, 各スロット) |
| 9 | [09-error-handling.md](./09-error-handling.md) | エラークラス階層、エラーハンドリング、エラーの使い方 |
| 10 | [10-middleware.md](./10-middleware.md) | レイヤー (ミドルウェア) システム、イベントフック |
| 11 | [11-permissions.md](./11-permissions.md) | 権限システム (PRIV / PERM) |
| 12 | [12-plugin-development.md](./12-plugin-development.md) | プラグイン開発ベストプラクティス |
| 13 | [13-model-api-reference.md](./13-model-api-reference.md) | 組み込みモデル API リファレンス |

## 対象ソースコード

このドキュメントは以下の HydroOJ ソースコードから作成:

```
/home/shisei/workspace/hydrooj-addons/hydro-typing/Hydro/
  framework/framework/  ← @hydrooj/framework (コア)
  packages/hydrooj/src/ ← hydrooj (メインパッケージ)
  packages/common/      ← @hydrooj/common (権限定義 etc.)
```

HydroOJ バージョン: v5.0.1 (framework v0.3.0)

## 目的

このドキュメントは以下の目的で作成された:

1. **hydro-typing プラグインの保守・拡張**に必要な知識の提供
2. **将来の HydroOJ プラグイン開発**のためのリファレンス
3. HydroOJ の内部動作の理解 (ソースコードを直接参照しなくても開発できるように)

## 免責事項

- このドキュメントは HydroOJ v5.0.1 (2026-05-25 時点) のソースコードに基づく
- HydroOJ のバージョンアップに伴い API が変更される可能性がある
- 不明な点は HydroOJ 本体のソースコードを直接参照すること

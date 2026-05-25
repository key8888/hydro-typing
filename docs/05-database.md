# データベースモデル

> ソース: `Hydro/packages/hydrooj/src/model/document.ts`
> ソース: `Hydro/packages/hydrooj/src/service/db.ts`
> ソース: `Hydro/packages/hydrooj/src/interface.ts` (Collections 定義)

---

## 1. 2つのアプローチ

HydroOJ プラグインでは、データストレージに2つのアプローチがある:

| アプローチ | 特徴 | 適しているケース |
|-----------|------|----------------|
| **DocumentModel** | HydroOJ の抽象化レイヤー。イベント発行、インデックス管理、型安全 | ブログ、ディスカッション、問題など HydroOJ 標準的なコンテンツ |
| **直接 MongoDB コレクション** | 自由度が高い。`ctx.db.collection()` で直接操作 | ゲームのスコア、カスタムデータ、シンプルな key-value |

---

## 2. DocumentModel (推奨)

**ソース:** `Hydro/packages/hydrooj/src/model/document.ts`

### 2.1 概要

DocumentModel はドキュメントを `document` コレクションに保存し、
ステータス情報を `document.status` コレクションに保存する。

**document コレクションのスキーマ:**
```typescript
{
  _id: ObjectId,      // ドキュメントID
  domainId: string,   // ドメインID
  docType: number,    // ドキュメントタイプ (10=問題, 21=ディスカッション, etc.)
  docId: any,         // ドキュメント識別子 (通常は ObjectId、問題は number)
  owner: number,      // 所有者UID
  content: Content,   // 本文 (string または Record<string, string>)
  parentType?: number,// 親ドキュメントタイプ
  parentId?: any,     // 親ドキュメントID
  ...                 // 拡張フィールド (args で渡したもの)
}
```

**document.status コレクションのスキーマ:**
```typescript
{
  _id: ObjectId,
  domainId: string,
  docType: number,
  docId: any,
  uid: number,
  ...                 // ユーザー固有のステータス (star, vote, view, etc.)
}
```

### 2.2 DocumentModel API 完全リファレンス

#### ドキュメント作成

```typescript
// 基本: ドキュメント作成 (自動採番)
const docId = await DocumentModel.add(
  domainId: string,     // ドメインID
  content: Content,     // 本文 (文字列 または Record<string, string>)
  owner: number,        // 所有者UID
  docType: number,      // ドキュメントタイプ (要登録)
  docId: DocID | null,  // ドキュメントID (null の場合は自動生成)
  parentType?: number,  // 親ドキュメントタイプ (省略可)
  parentId?: DocID,     // 親ドキュメントID (省略可)
  args?: Partial<DocType[T]>,  // 拡張フィールド
): Promise<ObjectId | DocID>;

// 使用例 (ブログ記事作成)
const did = await DocumentModel.add(
  'system',
  '本文です',
  this.user._id,
  TYPE_BLOG,
  null,     // 自動生成
  null, null,
  { title: 'タイトル', nReply: 0, views: 0 },
);
```

#### ドキュメント取得

```typescript
// 単一ドキュメント取得
const doc = await DocumentModel.get(
  domainId: string,
  docType: number,
  docId: DocID,
  projection?: Projection,  // 射影 (フィールド制限)
): Promise<DocType[T] | null>;

// 複数ドキュメント取得 (カーソル)
const cursor = DocumentModel.getMulti(
  domainId: string,
  docType: number,
  query?: Filter<DocType[T]>,
  projection?: Projection,
): FindCursor<DocType[T]>;

// 件数取得
const count = await DocumentModel.count(
  domainId: string,
  docType: number,
  query?: Filter<DocType[T]>,
): Promise<number>;
```

#### ドキュメント更新

```typescript
// フィールド更新 ($set)
const updated = await DocumentModel.set(
  domainId: string,
  docType: number,
  docId: DocID,
  $set?: Partial<DocType[T]>,
  $unset?: OnlyFieldsOfType<DocType[T], any, true | '' | 1>,
  $push?: PushOperator<DocType[T]>,
): Promise<DocType[T]>;

// 数値インクリメント
const updated = await DocumentModel.inc(
  domainId: string,
  docType: number,
  docId: DocID,
  key: NumberKeys<DocType[T]>,
  value: number,
): Promise<DocType[T]>;

// インクリメント + 同時更新
const updated = await DocumentModel.incAndSet(
  domainId: string,
  docType: number,
  docId: DocID,
  key: NumberKeys<DocType[T]>,
  value: number,
  args: Partial<DocType[T]>,
): Promise<DocType[T]>;
```

#### ドキュメント削除

```typescript
// 単一削除 (document + status を同時削除)
await DocumentModel.deleteOne(
  domainId: string,
  docType: number,
  docId: DocID,
);

// 複数削除 (条件一致)
await DocumentModel.deleteMulti(
  domainId: string,
  docType: number,
  query?: Filter<DocType[T]>,
);

// status のみ複数削除
await DocumentModel.deleteMultiStatus(
  domainId: string,
  docType: number,
  query?: Filter<DocStatusType[T]>,
);
```

#### 配列操作

```typescript
// 配列に要素を追加
const [doc, subId] = await DocumentModel.push(
  domainId: string,
  docType: number,
  docId: DocID,
  key: string,              // 配列フィールド名
  content: string,          // 内容 (またはオブジェクト)
  owner?: number,           // 所有者 (content が文字列の場合)
  args?: Record<string, any>, // 追加フィールド
);

// 配列から要素を削除
await DocumentModel.pull(
  domainId: string,
  docType: number,
  docId: DocID,
  setKey: string,
  contents: Filter<any>,
);

// 配列要素の部分更新
await DocumentModel.setSub(
  domainId: string,
  docType: number,
  docId: DocID,
  key: string,
  subId: ObjectId,
  args: Partial<any>,
);

// 配列要素の削除
await DocumentModel.deleteSub(
  domainId: string,
  docType: number,
  docId: DocID,
  key: string,
  subId: ObjectId | ObjectId[],
);
```

#### ステータス操作

```typescript
// ステータス取得
const status = await DocumentModel.getStatus(
  domainId: string,
  docType: number,
  docId: DocID,
  uid: number,
);

// ステータス設定 (upsert)
await DocumentModel.setStatus(
  domainId: string,
  docType: number,
  docId: DocID,
  uid: number,
  $set: UpdateFilter['$set'] | null,
  $unset?: UpdateFilter['$unset'] | null,
  returnDocument?: 'before' | 'after',
);

// 条件付きステータス設定
await DocumentModel.setIfNotStatus(
  domainId, docType, docId, uid,
  key, value, ifNotValue, args,
);

// ステータス数値インクリメント
await DocumentModel.incStatus(
  domainId, docType, docId, uid,
  key, value,
);

// 範囲制限付きインクリメント
await DocumentModel.cappedIncStatus(
  domainId, docType, docId, uid,
  key, value, minValue, maxValue,
);
```

---

## 3. 直接 MongoDB アクセス

### 3.1 コレクション取得

```typescript
// 既存コレクションにアクセス
const coll = this.ctx.db.collection('typingScores');

// 型安全なアクセス (Collections インターフェースに追加済みの場合)
const coll = this.ctx.db.collection<MyDoc>('myCollection');
```

**注意:** `ctx.db.collection()` は型安全のために `Collections` インターフェースを使用する。
カスタムコレクションを使う場合は型拡張が必要:

```typescript
declare module 'hydrooj' {
  interface Collections {
    typingScores: TypingScore;
  }
}
```

### 3.2 ページネーション

`ctx.db.paginate()` でページネーションを実現:

```typescript
// 書式1: 第3引数が文字列の場合、システム設定からページサイズを取得
const [docs, numPages, totalCount] = await this.ctx.db.paginate(
  cursor: FindCursor<T>,
  page: number,
  key: string,    // 設定キー (例: 'discussion')
);

// 書式2: 第3引数が数値の場合、その値がページサイズ
const [docs, numPages, totalCount] = await this.ctx.db.paginate(
  cursor: FindCursor<T>,
  page: number,
  pageSize: number,
);
```

**使用例:**
```typescript
// ブログ一覧のページネーション
const cursor = BlogModel.getMulti({ owner: uid });
const [docs, dpcount] = await this.ctx.db.paginate(cursor, page, 10);
// → docs: 取得ドキュメント配列
// → dpcount: 総ページ数
// → count: 総件数 (第3戻り値)
```

### 3.3 インデックス管理

```typescript
// インデックス作成 (プロダクションでも安全に実行可能)
await ctx.db.ensureIndexes(
  coll,
  { key: { domainId: 1, docType: 1, docId: 1 }, name: 'unique_idx', unique: true },
  { key: { owner: 1, createdAt: -1 }, name: 'owner_idx' },
);
```

`ensureIndexes` は既存インデックスと比較し、差分がある場合のみ再作成する。
`NODE_APP_INSTANCE` が `'0'` のワーカーのみがインデックス操作を実行する。

---

## 4. カスタムドキュメントタイプの登録

### 4.1 完全な実装パターン

```typescript
// features/my-model.ts
import { DocumentModel, ObjectId } from 'hydrooj';

// 1. ドキュメントタイプ定数 (衝突しない値)
export const TYPE_MY_CONTENT = 80 as const;

// 2. ドキュメントインターフェース
export interface MyDoc {
  docType: 80;
  docId: ObjectId;
  domainId: string;
  owner: number;
  title: string;
  content: string;
  status: string;
  counter: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 3. 型拡張 (declare module)
declare module 'hydrooj' {
  interface DocType {
    [TYPE_MY_CONTENT]: MyDoc;
  }
}

// 4. モデルクラス (DocumentModel ラッパー)
export class MyModel {
  static async add(owner: number, title: string, content: string) {
    return await DocumentModel.add(
      'system', content, owner, TYPE_MY_CONTENT, null, null, null,
      { title, status: 'draft', counter: 0, tags: [], createdAt: new Date(), updatedAt: new Date() },
    );
  }

  static get(docId: ObjectId) {
    return DocumentModel.get('system', TYPE_MY_CONTENT, docId);
  }

  static getMulti(query: Filter<MyDoc> = {}) {
    return DocumentModel.getMulti('system', TYPE_MY_CONTENT, query).sort({ createdAt: -1 });
  }

  static update(docId: ObjectId, data: Partial<MyDoc>) {
    return DocumentModel.set('system', TYPE_MY_CONTENT, docId, { ...data, updatedAt: new Date() });
  }

  static delete(docId: ObjectId) {
    return DocumentModel.deleteOne('system', TYPE_MY_CONTENT, docId);
  }
}

// 5. グローバル登録
global.Hydro.model.myModel = MyModel;
```

---

## 5. トランザクションと atomic 操作

MongoDB の atomic 操作を活用する:

```typescript
// findOneAndUpdate で atomic な更新
const doc = await coll.findOneAndUpdate(
  { _id: id, status: 'pending' },
  { $set: { status: 'processing' } },
  { returnDocument: 'after' },
);
if (!doc) throw new NotFoundError('No pending document found');

// $inc で atomic なカウンター更新
await coll.updateOne(
  { _id: id },
  { $inc: { views: 1 } },
);
```

---

## 6. データベースサービス API

**ソース:** `Hydro/packages/hydrooj/src/service/db.ts`

```typescript
// MongoDB クライアント
this.ctx.db.client;           // MongoClient
this.ctx.db.db;               // Db (データベース)

// コレクション取得
this.ctx.db.collection(name); // Collection<T>

// ページネーション
this.ctx.db.paginate(cursor, page, pageSize);

// ランキング
this.ctx.db.ranked(cursor, equalityFunction);

// インデックス管理
this.ctx.db.ensureIndexes(coll, ...indexes);
this.ctx.db.clearIndexes(coll, dropIndexes);
```

---

## 7. データベース関連のイベント

| イベント | 発行タイミング | 引数 |
|---------|---------------|------|
| `'database/connect'` | DB 接続完了時 | `(db: Db)` |
| `'document/add'` | ドキュメント追加前 | `(doc: any)` |
| `'document/set'` | ドキュメント更新前 | `(domainId, docType, docId, $set, $unset)` |
| `'domain/delete'` | ドメイン削除時 | `(domainId: string)` |

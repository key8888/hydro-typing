# 組み込みモデル API リファレンス

> ソース: `Hydro/packages/hydrooj/src/model/`

---

## 1. UserModel

**ソース:** `Hydro/packages/hydrooj/src/model/user.ts`

```typescript
import { UserModel } from 'hydrooj';

// ユーザー取得
UserModel.getById(domainId: string, uid: number, scope?: string): Promise<User>
UserModel.getById(domainId: string, uname: string, scope?: string): Promise<User>
UserModel.getList(domainId: string, uids: number[]): Promise<BaseUserDict>

// ユーザー情報更新
UserModel.setById(uid: number, $set: Partial<Udoc>): Promise<void>
UserModel.setMulti(domainId: string, query: Filter<Udoc>, $set: Partial<Udoc>): Promise<void>

// ユーザー作成
UserModel.create(domainId: string, uname: string, mail: string, password: string): Promise<number>

// ユーザー削除
UserModel.delete(uid: number, mail: string): Promise<void>

// ユーザー検索
UserModel.getByUname(domainId: string, uname: string): Promise<User>
UserModel.getByEmail(mail: string): Promise<User>
UserModel.search(domainId: string, query: string): Promise<User[]>
```

**User オブジェクトのプロパティ:**

```typescript
interface User {
  _id: number;              // ユーザーID
  uname: string;            // ユーザー名
  mail: string;             // メールアドレス
  avatar: string;           // アバターURL
  priv: number;             // システム特権ビットマスク
  perm: bigint;             // 現在のドメイン権限
  school?: string;          // 学校
  displayName?: string;     // 表示名
  studentId?: string;       // 学籍番号
  viewLang?: string;        // 表示言語設定

  // メソッド
  hasPriv(priv: number): boolean;     // システム特権チェック
  hasPerm(perm: bigint): boolean;     // ドメイン権限チェック
  own(doc: { owner: number }): boolean; // 所有権チェック
}
```

---

## 2. SystemModel (システム設定)

**ソース:** `Hydro/packages/hydrooj/src/model/system.ts`

```typescript
import { SystemModel } from 'hydrooj';

// 設定値の取得
const value = SystemModel.get(key: string): any;
const value = SystemModel.get(key: string, defaultValue: any): any;

// 複数設定の一括取得
const values = SystemModel.getMany(keys: string[]): Record<string, any>;

// 設定値の設定
SystemModel.set(key: string, value: any): Promise<void>;
SystemModel.setMulti(entries: Record<string, any>): Promise<void>;

// よく使われる設定キー
SystemModel.get('server.name');           // サーバー名
SystemModel.get('server.url');            // サーバーURL
SystemModel.get('server.language');       // デフォルト言語
SystemModel.get('server.cdn');            // CDN URL
SystemModel.get('server.ws');             // WebSocket URL
SystemModel.get('pagination.discussion'); // ディスカッションのページサイズ
SystemModel.get('session.saved_expire_seconds');   // セッション有効期限 (保存)
SystemModel.get('session.unsaved_expire_seconds'); // セッション有効期限 (未保存)
```

---

## 3. DocumentModel (ドキュメント)

**ソース:** `Hydro/packages/hydrooj/src/model/document.ts`

```typescript
import { DocumentModel } from 'hydrooj';

// === CRUD ===
DocumentModel.add(domainId, content, owner, docType, docId, parentType?, parentId?, args?);
DocumentModel.get(domainId, docType, docId, projection?);
DocumentModel.getMulti(domainId, docType, query?, projection?);
DocumentModel.set(domainId, docType, docId, $set?, $unset?, $push?);
DocumentModel.inc(domainId, docType, docId, key, value);
DocumentModel.deleteOne(domainId, docType, docId);
DocumentModel.count(domainId, docType, query?);

// === ステータス (ユーザー別) ===
DocumentModel.getStatus(domainId, docType, docId, uid);
DocumentModel.setStatus(domainId, docType, docId, uid, $set, $unset?);
DocumentModel.incStatus(domainId, docType, docId, uid, key, value);

// === サブドキュメント (配列操作) ===
DocumentModel.push(domainId, docType, docId, key, content, owner?, args?);
DocumentModel.pull(domainId, docType, docId, key, filter);
DocumentModel.setSub(domainId, docType, docId, key, subId, args);
DocumentModel.deleteSub(domainId, docType, docId, key, subId);

// === ドキュメントタイプ定数 ===
DocumentModel.TYPE_PROBLEM;                // 10
DocumentModel.TYPE_DISCUSSION;             // 21
DocumentModel.TYPE_DISCUSSION_REPLY;       // 22
DocumentModel.TYPE_CONTEST;                // 30
DocumentModel.TYPE_CONTEST_CLARIFICATION;  // 31
DocumentModel.TYPE_CONTEST_PRINT;          // 32
DocumentModel.TYPE_TRAINING;               // 40
```

---

## 4. OplogModel (操作ログ)

**ソース:** `Hydro/packages/hydrooj/src/model/oplog.ts`

```typescript
import { OplogModel } from 'hydrooj';

// 操作ログの記録
await OplogModel.log(handler, type: string, data: any);
await OplogModel.log(handler, 'blog.create', { title: 'Post title' });

// パラメータ:
// - handler: 現在のハンドラ (this)
// - type: 操作タイプ (自由文字列)
// - data: ログに記録するデータ (通常は操作対象のドキュメント)
```

---

## 5. TokenModel (セッション/トークン)

**ソース:** `Hydro/packages/hydrooj/src/model/token.ts`

```typescript
import { TokenModel } from 'hydrooj';

// トークン作成
const [tokenId] = await TokenModel.add(
  type: number,       // token.TYPE_SESSION など
  expireSeconds: number,
  data: Record<string, any>,
);

// トークン検証
const data = await TokenModel.get(
  tokenId: string,
  type: number,
);

// トークン更新
await TokenModel.update(
  tokenId: string,
  type: number,
  expireSeconds: number,
  data: Record<string, any>,
);

// トークン削除
await TokenModel.del(
  tokenId: string,
  type: number,
);
```

---

## 6. DomainModel (ドメイン)

**ソース:** `Hydro/packages/hydrooj/src/model/domain.ts`

```typescript
import { DomainModel } from 'hydrooj';

// ドメイン取得
DomainModel.get(domainId: string): Promise<DomainDoc>;

// ドメイン作成
DomainModel.create(owner: number, name: string, id?: string): Promise<string>;

// ホスト名からドメイン検索
DomainModel.getByHost(host: string): Promise<DomainDoc | null>;
```

---

## 7. MessageModel (メッセージ)

**ソース:** `Hydro/packages/hydrooj/src/model/message.ts`

```typescript
import { MessageModel } from 'hydrooj';

// メッセージ送信
await MessageModel.send(from: number, to: number | number[], content: string, flag?: number);

// 情報メッセージの送信 (Handler内)
this.progress('操作が完了しました', []);
// → message.sendInfo(this.user._id, JSON.stringify({ message: '...', params: [...] }))
```

---

## 8. SettingModel (ユーザー設定)

**ソース:** `Hydro/packages/hydrooj/src/model/setting.ts`

```typescript
import { SettingModel } from 'hydrooj';

// ユーザー設定の取得
SettingModel.get(uid: number): Promise<Record<string, any>>;

// ユーザー設定の更新
SettingModel.set(uid: number, settings: Record<string, any>): Promise<void>;

// 設定項目の定義
SettingModel.Setting(settings: Setting[]): void;
```

---

## 9. StorageModel (ファイルストレージ)

**ソース:** `Hydro/packages/hydrooj/src/model/storage.ts`

```typescript
import { StorageModel } from 'hydrooj';

// ファイル保存
await StorageModel.put(path: string, content: Buffer | string): Promise<void>;

// ファイル取得
const content = await StorageModel.get(path: string): Promise<Buffer>;

// ファイル削除
await StorageModel.del(path: string): Promise<void>;

// ファイル一覧
const files = await StorageModel.list(prefix: string): Promise<FileNode[]>;

// ファイル存在確認
const exists = await StorageModel.exists(path: string): Promise<boolean>;
```

---

## 10. 権限関連ヘルパー

```typescript
// 権限チェック
this.checkPriv(PRIV.PRIV_USER_PROFILE);        // システム特権チェック
this.checkPerm(PERM.PERM_VIEW_PROBLEM);        // ドメイン権限チェック
this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM);      // 条件付きチェック
this.user.hasPerm(PERM.PERM_VIEW);             // 条件付きチェック
this.user.own(doc);                            // 所有権チェック

// Route 登録時の権限制御
ctx.Route('name', '/path', Handler, PRIV.PRIV_USER_PROFILE);
ctx.Route('name', '/path', Handler, PERM.PERM_VIEW);
ctx.Route('name', '/path', Handler, PRIV.PRIV_USER_PROFILE, PERM.PERM_VIEW);

// sudo 認証
@requireSudo
async postDangerousOperation() { ... }
```

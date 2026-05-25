# 権限システム (PRIV / PERM)

> ソース: `Hydro/packages/hydrooj/src/model/builtin.ts`
> ソース: `Hydro/packages/common/permission.ts` (PRIV, PERM 定義)

---

## 1. 2つの権限レイヤー

HydroOJ の権限システムは2層構造:

| 権限 | スコープ | チェック方法 | 型 | 説明 |
|------|---------|------------|-----|------|
| **PRIV** (Privilege) | **システム全体** | `user.hasPriv()` | `number` (ビットマスク) | 管理者権限。システム全体の操作。 |
| **PERM** (Permission) | **ドメイン内** | `user.hasPerm()` | `bigint` (ビットマスク) | 一般権限。ドメインごとに設定可能。 |

---

## 2. PRIV (システム特権)

システム全体に影響する特権。通常は管理者のみが持つ。

```typescript
// ソース: @hydrooj/common/permission.ts

export const PRIV = {
  PRIV_NONE:               0n,       // 権限なし
  PRIV_SET_PRIV:           1n,       // ユーザー権限設定
  PRIV_SET_PERM:           2n,       // ドメイン権限設定
  PRIV_USER_PROFILE:       4n,       // ログインしている (基本的なユーザー特権)
  PRIV_EDIT_SYSTEM:        8n,       // システム設定編集
  PRIV_VIEW_ALL_DOMAIN:    16n,      // 全ドメイン表示
  PRIV_VIEW_ALL_CONTEST:   32n,      // 全コンテスト表示
  PRIV_UNLIMITED_ACCESS:   64n,      // レート制限なし
  PRIV_CREATE_DOMAIN:      128n,     // ドメイン作成
  PRIV_MANAGE_ALL_DOMAIN:  256n,     // 全ドメイン管理
  PRIV_VIEW_USER_SECRET:   512n,     // ユーザー秘密情報表示
  PRIV_CREATE_USER:        1024n,    // ユーザー作成
  PRIV_FORCE_LOGOUT:       2048n,    // 強制ログアウト
  PRIV_IMPORT_USER:        4096n,    // ユーザーインポート
  PRIV_MANAGE_USER:        8192n,    // ユーザー管理
  PRIV_READ_RECORD_CODE:   16384n,   // 全提出コード閲覧
  PRIV_EDIT_PATCH:         32768n,   // パッチ適用
  PRIV_DELETE_ALL_DISCUSSION: 65536n,  // 全ディスカッション削除
  PRIV_DELETE_ALL_COMMENT: 131072n,  // 全コメント削除
};
```

### 2.1 PRIV の使用例

```typescript
import { PRIV } from 'hydrooj';

// Handler 内
this.checkPriv(PRIV.PRIV_USER_PROFILE);  // ログイン必須
this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);   // システム編集権限必須

// 条件チェック
if (this.user.hasPriv(PRIV.PRIV_UNLIMITED_ACCESS)) {
  // レート制限をスキップ
}
```

### 2.2 Route 登録時の PRIV 指定

```typescript
// ログインユーザーのみアクセス可能
ctx.Route('typing_main', '/typing', TypingHandler, PRIV.PRIV_USER_PROFILE);

// システム管理者のみアクセス可能
ctx.Route('admin', '/admin', AdminHandler, PRIV.PRIV_EDIT_SYSTEM);
```

---

## 3. PERM (ドメイン権限)

ドメインごとに設定される権限。ユーザーのロール (役割) に基づいて付与される。

```typescript
// ソース: @hydrooj/common/permission.ts

export const PERM = {
  // 基本
  PERM_ALL:                    BigInt('0xffffffffffffffff'),  // 全権限
  PERM_NONE:                   0n,                            // 権限なし
  PERM_BASIC:                  1n,                            // 基本権限 (全員)
  PERM_DEFAULT:                2n,                            // デフォルト権限

  // 一般
  PERM_VIEW:                   4n,        // ドメイン表示
  PERM_VIEW_USER_PRIVATE_INFO: 8n,        // ユーザー非公開情報表示
  PERM_EDIT_DOMAIN:            16n,       // ドメイン設定編集
  PERM_MOD_BADGE:              32n,       // MOD バッジ表示

  // 問題
  PERM_CREATE_PROBLEM:         64n,
  PERM_EDIT_PROBLEM:           128n,
  PERM_EDIT_PROBLEM_SELF:      256n,
  PERM_VIEW_PROBLEM:           512n,
  PERM_VIEW_PROBLEM_HIDDEN:    1024n,
  PERM_SUBMIT_PROBLEM:         2048n,
  PERM_READ_PROBLEM_DATA:      4096n,

  // 提出記録
  PERM_VIEW_RECORD:             8192n,
  PERM_READ_RECORD_CODE:        16384n,
  PERM_READ_RECORD_CODE_ACCEPT: 32768n,
  PERM_REJUDGE_PROBLEM:         65536n,
  PERM_REJUDGE:                 131072n,

  // 問題の解法
  PERM_VIEW_PROBLEM_SOLUTION:       262144n,
  PERM_VIEW_PROBLEM_SOLUTION_ACCEPT: 524288n,
  PERM_CREATE_PROBLEM_SOLUTION:    1048576n,
  PERM_VOTE_PROBLEM_SOLUTION:      2097152n,
  PERM_EDIT_PROBLEM_SOLUTION:      4194304n,
  PERM_EDIT_PROBLEM_SOLUTION_SELF: 8388608n,
  PERM_DELETE_PROBLEM_SOLUTION:    16777216n,
  PERM_DELETE_PROBLEM_SOLUTION_SELF: 33554432n,
  PERM_REPLY_PROBLEM_SOLUTION:     67108864n,
  PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF: 134217728n,
  PERM_DELETE_PROBLEM_SOLUTION_REPLY: 268435456n,
  PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF: 536870912n,

  // ディスカッション
  PERM_VIEW_DISCUSSION:        1073741824n,
  PERM_CREATE_DISCUSSION:      2147483648n,
  PERM_HIGHLIGHT_DISCUSSION:   4294967296n,
  PERM_PIN_DISCUSSION:         8589934592n,
  PERM_EDIT_DISCUSSION:        17179869184n,
  PERM_EDIT_DISCUSSION_SELF:   34359738368n,
  PERM_LOCK_DISCUSSION:        68719476748n,
  PERM_DELETE_DISCUSSION:      137438953472n,
  PERM_DELETE_DISCUSSION_SELF: 274877906944n,
  PERM_REPLY_DISCUSSION:       549755813888n,
  PERM_ADD_REACTION:           1099511627776n,
  PERM_EDIT_DISCUSSION_REPLY_SELF: 2199023255552n,
  PERM_DELETE_DISCUSSION_REPLY: 4398046511104n,
  PERM_DELETE_DISCUSSION_REPLY_SELF: 8796093022208n,
  PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION: 17592186044416n,

  // コンテスト
  PERM_VIEW_CONTEST:                 35184372088832n,
  PERM_VIEW_CONTEST_SCOREBOARD:      70368744177664n,
  PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD: 140737488355328n,
  PERM_CREATE_CONTEST:               281474976710656n,
  PERM_ATTEND_CONTEST:               562949953421312n,
  PERM_EDIT_CONTEST:                 1125899906842624n,
  PERM_EDIT_CONTEST_SELF:            2251799813685248n,
  PERM_VIEW_HIDDEN_CONTEST:          4503599627370496n,

  // 宿題
  PERM_VIEW_HOMEWORK:                 9007199254740992n,
  PERM_VIEW_HOMEWORK_SCOREBOARD:      18014398509481984n,
  PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD: 36028797018963968n,
  PERM_CREATE_HOMEWORK:              72057594037927936n,
  PERM_ATTEND_HOMEWORK:              144115188075855872n,
  PERM_EDIT_HOMEWORK:                288230376151711744n,
  PERM_EDIT_HOMEWORK_SELF:           576460752303423488n,
  PERM_VIEW_HIDDEN_HOMEWORK:         1152921504606846976n,

  // トレーニング
  PERM_VIEW_TRAINING:     2305843009213693952n,
  PERM_CREATE_TRAINING:   4611686018427387904n,
  PERM_EDIT_TRAINING:     9223372036854775808n,
  PERM_PIN_TRAINING:      18446744073709551616n,
  PERM_EDIT_TRAINING_SELF: 36893488147419103232n,

  // ランキング
  PERM_VIEW_RANKING:      73786976294838206464n,
};
```

### 3.1 PERM の使用例

```typescript
import { PERM } from 'hydrooj';

// Handler 内
this.checkPerm(PERM.PERM_VIEW_PROBLEM);          // 問題表示権限
this.checkPerm(PERM.PERM_EDIT_PROBLEM_SELF);     // 自分の問題編集権限

// 条件チェック
if (this.user.hasPerm(PERM.PERM_VIEW_DISCUSSION)) {
  // ディスカッション表示権限あり
}
```

### 3.2 権限チェックエラーの挙動

```typescript
// checkPerm が失敗した場合:
// 1. ユーザーに PRIV.PRIV_USER_PROFILE がある → PermissionError
// 2. ユーザーに PRIV.PRIV_USER_PROFILE がない → PrivilegeError
this.checkPerm(PERM.PERM_VIEW);
// → PermissionError('Permission denied') または PrivilegeError('Login required')
```

---

## 4. 所有権チェック

```typescript
class BlogHandler extends Handler {
  async get() {
    if (!this.user.own(this.ddoc)) {
      throw new ForbiddenError();
    }
    // または管理者は常に許可
    if (!this.user.own(this.ddoc) && !this.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) {
      throw new ForbiddenError();
    }
  }
}
```

`user.own(doc)` は `doc.owner === user._id` を確認する。

---

## 5. ロールと権限の関係

ドメインには以下のデフォルトロールが定義されている:

```typescript
// 組み込みロール
export const BUILTIN_ROLES = {
  guest: PERM.PERM_BASIC,         // 未ログインユーザー
  default: PERM.PERM_DEFAULT,     // ログイン中の一般ユーザー
  root: PERM.PERM_ALL,            // ドメイン管理者
};
```

---

## 6. 権限のテストパターン

```typescript
// handler 内で特定の権限をテスト
this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);    // → なければ PrivilegeError

// 条件付きチェック
if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
  // ログインユーザーのみの処理
}

// ドメイン権限 (ログイン不要の場合)
if (this.user.hasPerm(PERM.PERM_VIEW)) {
  // 表示権限あり
}

// Route 登録時の権限制御
ctx.Route('public_page', '/public', PublicHandler);                      // 全員アクセス可
ctx.Route('user_page', '/user', UserHandler, PRIV.PRIV_USER_PROFILE);   // ログイン必須
ctx.Route('admin_page', '/admin', AdminHandler, PRIV.PRIV_EDIT_SYSTEM); // 管理者のみ
ctx.Route('problem', '/p/:pid', ProblemHandler, PERM.PERM_VIEW_PROBLEM);// 問題表示権限必要
```

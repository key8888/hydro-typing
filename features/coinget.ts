/**
 * coinget.ts — コインゲットモード および 管理者画面の全ハンドラ
 *
 * 【概要】
 *   タイピング練習に「コインゲット」モードを追加する。
 *   コインはサイト内通貨として機能し、管理者が発行するワンタイムパスワード
 *   （4桁、5分間有効）でモードに入り、タイピング結果（WPM）に応じて
 *   コインを獲得できる。
 *
 * 【データベースコレクション】
 *   - coinPasswords  : 管理者が生成したパスワード（SHA256 ハッシュ + 5分有効期限）
 *   - userCoins      : ユーザー別コイン残高（uid → coins）
 *   - coinFormulas   : モード別コイン計算式（例: wpm * 2 + 10）
 *
 * 【ルート一覧】
 *   POST /typing/coin/verify          — パスワード検証（一般ユーザー）
 *   POST /typing/coin/save            — コイン獲得保存（一般ユーザー）
 *   GET  /typing/admin                — 管理者画面
 *   POST /typing/admin/generate-password — パスワード生成（管理者）
 *   POST /typing/admin/update-formula — 計算式更新（管理者）
 *   POST /typing/admin/update-coins   — ユーザーコイン設定（管理者）
 */

import { Context, Handler, PRIV, ValidationError } from 'hydrooj';
import type { ObjectId } from 'hydrooj';
import { createHash } from 'crypto';

/** パスワードドキュメント — 管理者が生成、5分間有効 */
interface CoinPassword {
  _id?: ObjectId;
  passwordHash: string;   // SHA256("0000"〜"9999")
  createdAt: Date;
  expiresAt: Date;        // createdAt + 5 min で自動無効化
}

/** ユーザーコイン残高 */
interface UserCoin {
  _id?: ObjectId;
  uid: number;
  coins: number;
}

/** モード別コイン計算式（管理者がカスタマイズ可能） */
interface CoinFormula {
  _id?: ObjectId;
  mode: string;           // 'coinget-intermediate' または 'coinget-advanced'
  expression: string;     // 例: 'wpm * 2 + 10'
}

/** デフォルト計算式（DBに未登録の場合に使用） */
const DEFAULT_FORMULAS: Record<string, string> = {
  'coinget-intermediate': 'wpm * 2 + 10',
  'coinget-advanced': 'wpm * 3 + 20',
};

/** 4桁パスワードを SHA256 ハッシュ化して保存する（平文保存防止） */
function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex');
}

/**
 * 計算式文字列を評価し、コイン数を返す。
 * new Function により式を動的評価するが、構文エラーや
 * 不正な結果（負の値、NaN など）は 0 にフォールバック。
 */
export function evaluateFormula(expr: string, wpm: number): number {
  try {
    const result = new Function('wpm', `return (${expr});`)(wpm);
    if (typeof result !== 'number' || !Number.isFinite(result) || result < 0) return 0;
    return Math.round(result);
  } catch {
    return 0;
  }
}

/**
 * デフォルト計算式が DB に存在しなければ登録する。
 * アプリケーション起動時、または管理者画面初回アクセス時に呼ばれる。
 */
export async function ensureDefaultFormulas(ctx: Context) {
  const coll = ctx.db.collection<CoinFormula>('coinFormulas');
  for (const [mode, expression] of Object.entries(DEFAULT_FORMULAS)) {
    const existing = await coll.findOne({ mode });
    if (!existing) {
      await coll.insertOne({ mode, expression });
    }
  }
}

/**
 * 全モードの計算式を取得。
 * DB にあればそれを優先し、なければデフォルト値を使う。
 */
export async function getFormulas(ctx: Context): Promise<Record<string, string>> {
  const coll = ctx.db.collection<CoinFormula>('coinFormulas');
  const docs = await coll.find({}).toArray();
  const result: Record<string, string> = { ...DEFAULT_FORMULAS };
  for (const doc of docs) {
    if (doc.expression) result[doc.mode] = doc.expression;
  }
  return result;
}

/** 指定モードの計算式だけを取得するヘルパー */
async function getFormulaForMode(ctx: Context, mode: string): Promise<string> {
  const formulas = await getFormulas(ctx);
  return formulas[mode] ?? 'wpm';
}

/* ================================================================
   パスワード検証ハンドラ
   クライアントから送られた4桁パスワードを SHA256 ハッシュ化し、
   有効期限内のパスワードと一致するかチェックする。
   ================================================================ */
class CoinPasswordVerifyHandler extends Handler {
  async post() {
    const { password } = this.request.body;
    if (!password || !/^\d{4}$/.test(String(password))) {
      this.response.body = { success: false };
      return;
    }
    const hash = hashPassword(String(password));
    const coll = this.ctx.db.collection<CoinPassword>('coinPasswords');
    const pw = await coll.findOne({
      passwordHash: hash,
      expiresAt: { $gt: new Date() }, // 有効期限切れは除外
    });
    this.response.body = { success: !!pw };
  }
}

/* ================================================================
   コイン保存ハンドラ
   タイピング終了後、WPM とモードを受け取り、
   計算式に基づいてコインを算出・加算する。
   同一ユーザーが存在しなければ upsert で新規作成。
   ================================================================ */
class CoinSaveHandler extends Handler {
  async post() {
    const { wpm, mode } = this.request.body;
    const numWpm = Number(wpm);
    if (!Number.isFinite(numWpm) || numWpm < 0 || numWpm > 300) throw new ValidationError('wpm');
    if (!mode || !['coinget-intermediate', 'coinget-advanced'].includes(mode)) throw new ValidationError('mode');

    const uid = this.user?._id || 0;
    const expression = await getFormulaForMode(this.ctx, mode);
    const coinsEarned = evaluateFormula(expression, numWpm);

    const coll = this.ctx.db.collection<UserCoin>('userCoins');
    const result = await coll.findOneAndUpdate(
      { uid },
      { $inc: { coins: coinsEarned } },    // アトミック加算（並行リクエストでも安全）
      { upsert: true, returnDocument: 'after' },
    );

    this.response.body = {
      success: true,
      coinsEarned,                          // 今回獲得したコイン数
      totalCoins: result?.coins ?? coinsEarned, // 累計コイン残高
    };
  }
}

/* ================================================================
   管理者画面（GET）
   PRIV_EDIT_SYSTEM 権限が必要。
   計算式一覧とユーザーコイン一覧（上位100名）を表示。
   ================================================================ */
class AdminHandler extends Handler {
  async get() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    await ensureDefaultFormulas(this.ctx);

    const formulaColl = this.ctx.db.collection<CoinFormula>('coinFormulas');
    const formulas = await formulaColl.find({}).toArray();
    const collapsed: Record<string, string> = { ...DEFAULT_FORMULAS };
    for (const f of formulas) {
      if (f.expression) collapsed[f.mode] = f.expression;
    }

    const coinColl = this.ctx.db.collection<UserCoin>('userCoins');
    const userCoins = await coinColl.find({}).sort({ coins: -1 }).limit(100).toArray();

    this.response.template = 'admin_typing.html';
    this.response.body = { formulas: collapsed, userCoins };
  }
}

/* ================================================================
   パスワード生成ハンドラ（管理者専用）
   1000〜9999 の4桁ランダム数値を生成し、
   SHA256 ハッシュ化して DB に保存（5分間有効）。
   生成された平文パスワードはレスポンスとして返す。
   ================================================================ */
class AdminGeneratePasswordHandler extends Handler {
  async post() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    const password = String(Math.floor(1000 + Math.random() * 9000)); // 1000〜9999
    const now = new Date();
    const coll = this.ctx.db.collection<CoinPassword>('coinPasswords');
    await coll.insertOne({
      passwordHash: hashPassword(password),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5分後
    });
    this.response.body = { success: true, password };
  }
}

/* ================================================================
   計算式更新ハンドラ（管理者専用）
   フォームから mode と expression を受け取り、DB を更新する。
   ================================================================ */
class AdminUpdateFormulaHandler extends Handler {
  async post() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    const { mode, expression } = this.request.body;
    if (!mode || typeof expression !== 'string') throw new ValidationError('mode, expression');
    const coll = this.ctx.db.collection<CoinFormula>('coinFormulas');
    await coll.updateOne({ mode }, { $set: { expression } }, { upsert: true });
    this.response.redirect = '/typing/admin';
  }
}

/* ================================================================
   ユーザーコイン更新ハンドラ（管理者専用）
   指定した uid のコイン残高を上書きする。
   ================================================================ */
class AdminUpdateCoinsHandler extends Handler {
  async post() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    const { uid, coins } = this.request.body;
    const numUid = Number(uid);
    const numCoins = Number(coins);
    if (!Number.isFinite(numUid) || numUid <= 0) throw new ValidationError('uid');
    if (!Number.isFinite(numCoins) || numCoins < 0) throw new ValidationError('coins');
    const coll = this.ctx.db.collection<UserCoin>('userCoins');
    await coll.updateOne({ uid: numUid }, { $set: { coins: numCoins } }, { upsert: true });
    this.response.redirect = '/typing/admin';
  }
}

/* ================================================================
   プラグインエントリポイント
   全ルート登録、ナビゲーション注入、i18n 定義。
   ================================================================ */
export function applyCoinget(ctx: Context) {
  // 一般ユーザー向け：コインゲットモード用
  ctx.Route('typing_coin_verify', '/typing/coin/verify', CoinPasswordVerifyHandler, PRIV.PRIV_USER_PROFILE);
  ctx.Route('typing_coin_save', '/typing/coin/save', CoinSaveHandler, PRIV.PRIV_USER_PROFILE);

  // 管理者向け
  ctx.Route('typing_admin', '/typing/admin', AdminHandler, PRIV.PRIV_EDIT_SYSTEM);
  ctx.Route('typing_admin_genpw', '/typing/admin/generate-password', AdminGeneratePasswordHandler, PRIV.PRIV_EDIT_SYSTEM);
  ctx.Route('typing_admin_updateformula', '/typing/admin/update-formula', AdminUpdateFormulaHandler, PRIV.PRIV_EDIT_SYSTEM);
  ctx.Route('typing_admin_updatecoins', '/typing/admin/update-coins', AdminUpdateCoinsHandler, PRIV.PRIV_EDIT_SYSTEM);

  // ナビゲーションバーに管理者用リンクを注入（PRIV_EDIT_SYSTEM 権限者のみ表示）
  ctx.injectUI('Nav', 'typing_admin', (h) => ({
    icon: 'setting',
    displayName: 'Typing Admin',
    prefix: 'typing',
  }), PRIV.PRIV_EDIT_SYSTEM);

  // 日本語ローカライズ
  ctx.i18n.load('ja', {
    'Coin Get (Intermediate)': 'コインゲット（中級）',
    'Coin Get (Advanced)': 'コインゲット（上級）',
    'ENTER PASSWORD': 'パスワードを入力',
    'Settings saved.': '設定を保存しました。',
    'Password generated.': 'パスワードを生成しました。',
    'Remaining Time': '残り時間',
    'min': '分',
    'Total Coins': '合計コイン',
  });
}

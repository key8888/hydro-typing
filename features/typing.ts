import { Context, ForbiddenError, Handler, NotFoundError, param, PRIV, Types, ValidationError } from 'hydrooj';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ObjectId } from 'hydrooj';
/*
 * コインゲット機能から、計算式の初期化と取得関数をインポート。
 * タイピング画面の初回読み込み時に、現在の計算式とユーザーの
 * コイン残高をフロントエンドへ渡すために使用する。
 */
import { ensureDefaultFormulas, getFormulas } from './coinget';

interface TypingScore {
  _id?: ObjectId;
  uid: number;
  score: number;   // WPM
  createdAt: Date;
}

interface WordItem {
  word: string;
  meaning?: string;
}

/** ユーザーコイン残高（coinget.ts と共有のインターフェース） */
interface UserCoin {
  _id?: ObjectId;
  uid: number;
  coins: number;
}

// FIX: HIGH-003 — 単語リストをモジュールスコープでキャッシュし、リクエスト毎の同期的ファイル読み込みを回避
const wordsPath = join(__dirname, '..', 'typing_words', 'words.json');
let wordsCache: WordItem[] | null = null;

function loadWords(): WordItem[] {
  if (wordsCache) return wordsCache;
  let raw: string;
  try {
    raw = readFileSync(wordsPath, 'utf-8');
  } catch {
    wordsCache = [];
    return wordsCache;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    wordsCache = [];
    return wordsCache;
  }

  wordsCache = Array.isArray(parsed)
    ? parsed
      .filter((x) => x && typeof x.word === 'string')
      .map((x) => ({
        word: String(x.word),
        meaning: typeof x.meaning === 'string' ? String(x.meaning) : '',
      }))
    : [];
  return wordsCache;
}

class TypingHandler extends Handler {
  async get() {
    const words = loadWords();

    const uid = this.user?._id || 0;
    const coll = this.ctx.db.collection<TypingScore>('typingScores');
    const history = await coll.find({ uid }).sort({ createdAt: -1 }).limit(5).toArray();

    // コインゲット機能用：計算式の初期化と現在の設定を取得
    await ensureDefaultFormulas(this.ctx);
    const coinFormulas = await getFormulas(this.ctx);
    // 現在のユーザーのコイン残高を取得（未登録の場合は 0）
    const coinColl = this.ctx.db.collection<UserCoin>('userCoins');
    const userCoin = await coinColl.findOne({ uid });
    const userCoins = userCoin?.coins ?? 0;

    this.response.template = 'typing.html';
    this.response.body = {
      words: JSON.stringify(words),
      history,
      coinFormulas: JSON.stringify(coinFormulas), // JS上で使うため文字列化
      userCoins,                                   // 数値のままテンプレートへ
    };
  }

  async post() {
    const { score } = this.request.body;
    // FIX: HIGH-002 — スコアバリデーション追加（NaN, Infinity, 負の値, 300越えを防止）
    const numScore = Number(score);
    if (!Number.isFinite(numScore) || numScore < 0 || numScore > 300) throw new ValidationError('score');
    const uid = this.user?._id || 0;

    const coll = this.ctx.db.collection<TypingScore>('typingScores');
    await coll.insertOne({
      uid,
      score: numScore,
      createdAt: new Date(),
    });

    this.response.redirect = this.url('typing_main');
  }
}

class TypingDeleteHandler extends Handler {
  @param('id', Types.ObjectId)
  async post({}, id: ObjectId) {
    const coll = this.ctx.db.collection<TypingScore>('typingScores');
    const score = await coll.findOne({ _id: id });
    if (!score) throw new NotFoundError('score');
    if (score.uid !== this.user._id) throw new ForbiddenError();
    await coll.deleteOne({ _id: id });
    this.response.redirect = '/typing';
  }
}

export function applyTyping(ctx: Context) {
  ctx.Route('typing_main', '/typing', TypingHandler, PRIV.PRIV_USER_PROFILE);
  ctx.Route('typing_delete', '/typing/delete', TypingDeleteHandler, PRIV.PRIV_USER_PROFILE);
}

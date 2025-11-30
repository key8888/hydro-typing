import { Context, Handler, PRIV } from 'hydrooj';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ObjectId } from 'hydrooj';

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

class TypingHandler extends Handler {
  async get() {
    const filePath = join(__dirname, '..', 'typing_words', 'words.json');
    const raw = readFileSync(filePath, 'utf-8');

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }

    const words: WordItem[] = Array.isArray(parsed)
      ? parsed
        .filter((x) => x && typeof x.word === 'string')
        .map((x) => ({
          word: String(x.word),
          meaning: typeof x.meaning === 'string' ? String(x.meaning) : '',
        }))
      : [];

    const uid = this.user?._id || 0;
    const coll = this.ctx.db.collection<TypingScore>('typingScores');
    const history = await coll.find({ uid }).sort({ createdAt: -1 }).limit(5).toArray();

    this.response.template = 'typing.html';
    this.response.body = {
      words: JSON.stringify(words),
      history,
    };
  }

  async post() {
    const { score } = this.request.body;
    const uid = this.user?._id || 0;

    const coll = this.ctx.db.collection<TypingScore>('typingScores');
    await coll.insertOne({
      uid,
      score: Number(score),
      createdAt: new Date(),
    });

    this.response.redirect = this.url('typing_main');
  }
}

export function applyTyping(ctx: Context) {
  ctx.Route('typing_main', '/typing', TypingHandler, PRIV.PRIV_USER_PROFILE);
}

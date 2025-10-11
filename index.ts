// hydrooj というライブラリからいろんな機能をインポートしている
// - DocumentModel: DBに保存される文書（記事やブログ）のモデル
// - UserModel: ユーザー情報を扱うモデル
// - Handler: リクエストを処理するクラスの親クラス
// - ObjectId: MongoDBのドキュメントIDの型
// - param, Types: APIの入力パラメータを定義するデコレータ
// - PRIV: ユーザー権限
import {
    _, Context, db, DiscussionNotFoundError, DocumentModel,
    Handler, ObjectId, OplogModel,
    param, PRIV, Types, UserModel,
} from 'hydrooj';
import { readFileSync } from 'fs'
import { join } from 'path';

import type { Filter, NumberKeys } from 'hydrooj';
import type { UpdateFilter } from 'mongodb';


// 定数として「ブログの種類番号」を定義（70番をブログに割り当てる）
export const TYPE_BLOG = 70 as const;

// ブログ記事のデータ構造を定義（TypeScriptのインターフェース）
export interface BlogDoc {
    docType: 70;               // 文書の種類（ブログなので70固定）
    docId: ObjectId;           // 記事のID
    owner: number;             // 記事を書いたユーザーのID
    title: string;             // タイトル
    content: string;           // 本文
    ip: string;                // 投稿時のIPアドレス
    updateAt: Date;            // 更新日時
    nReply: number;            // 返信数
    views: number;             // 閲覧数
    reply: any[];              // 返信リスト（型は未定義）
    react: Record<string, number>; // リアクション（例: 👍の数）
}

// hydrooj のモデルに「blog」を追加するための宣言
declare module 'hydrooj' {
    interface Model {
        blog: typeof BlogModel;   // blog という名前で BlogModel を登録
    }
    interface DocType {
        [TYPE_BLOG]: BlogDoc;     // docType 70 に BlogDoc を対応付ける
    }
}

// ブログの操作をまとめたクラス（データベースとのやり取り）
export class BlogModel {
    // 記事を新しく追加する
    static async add(owner: number, title: string, content: string, ip?: string): Promise<ObjectId> {
        // 保存するデータの準備（部分的に BlogDoc 型）
        const payload: Partial<BlogDoc> = {
            content,
            owner,
            title,
            ...(ip ? { ip } : {}),
            nReply: 0,
            updateAt: new Date(),
            views: 0,
        };
        // DocumentModel.add を呼び出してDBに保存
        const res = await DocumentModel.add(
            'system', payload.content!, payload.owner!, TYPE_BLOG,
            null, null, null, _.omit(payload, ['domainId', 'content', 'owner']),
        );
        payload.docId = res;  // 戻り値として記事のIDが返ってくる
        return payload.docId;
    }

    // IDから記事を取得する
    static async get(did: ObjectId): Promise<BlogDoc> {
        return await DocumentModel.get('system', TYPE_BLOG, did);
    }

    // 記事を編集する
    static edit(did: ObjectId, title: string, content: string): Promise<BlogDoc> {
        const payload = { title, content };
        return DocumentModel.set('system', TYPE_BLOG, did, payload);
    }

    // 数値のフィールド（views や nReply など）を増加/減少させる
    static inc(did: ObjectId, key: NumberKeys<BlogDoc>, value: number): Promise<BlogDoc | null> {
        return DocumentModel.inc('system', TYPE_BLOG, did, key, value);
    }

    // 記事を削除する
    static del(did: ObjectId): Promise<never> {
        return Promise.all([
            DocumentModel.deleteOne('system', TYPE_BLOG, did),
            DocumentModel.deleteMultiStatus('system', TYPE_BLOG, { docId: did }),
        ]) as any;
    }

    // 記事数を数える
    static count(query: Filter<BlogDoc>) {
        return DocumentModel.count('system', TYPE_BLOG, query);
    }

    // 複数の記事を取得する（並べ替え付き）
    static getMulti(query: Filter<BlogDoc> = {}) {
        return DocumentModel.getMulti('system', TYPE_BLOG, query)
            .sort({ _id: -1 }); // 新しい順に並べる
    }

    // 記事に返信を追加する
    static async addReply(did: ObjectId, owner: number, content: string, ip: string): Promise<ObjectId> {
        const [[, drid]] = await Promise.all([
            DocumentModel.push('system', TYPE_BLOG, did, 'reply', content, owner, { ip }),
            DocumentModel.incAndSet('system', TYPE_BLOG, did, 'nReply', 1, { updateAt: new Date() }),
        ]);
        return drid; // 返信のIDを返す
    }

    // 記事に「スター」をつける
    static setStar(did: ObjectId, uid: number, star: boolean) {
        return DocumentModel.setStatus('system', TYPE_BLOG, did, uid, { star });
    }

    // 記事のステータス（誰がスターしたかなど）を取得する
    static getStatus(did: ObjectId, uid: number) {
        return DocumentModel.getStatus('system', TYPE_BLOG, did, uid);
    }

    // ステータスをセットする
    static setStatus(did: ObjectId, uid: number, $set: UpdateFilter<any>['$set']) {
        return DocumentModel.setStatus('system', TYPE_BLOG, did, uid, $set);
    }
}

// グローバルにモデルを登録して、どこからでも呼び出せるようにする
global.Hydro.model.blog = BlogModel;

// --- 以下はリクエストを処理する「ハンドラー」クラス群 ---
// ルーティングで呼ばれると、ブログの表示や編集を担当する

// 基本のブログハンドラー
class BlogHandler extends Handler {
    ddoc?: BlogDoc;

    // APIのパラメータとして "did" を受け取り、記事を取得する準備
    @param('did', Types.ObjectId, true)
    async _prepare(domainId: string, did: ObjectId) {
        if (did) {
            this.ddoc = await BlogModel.get(did);
            if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
        }
    }
}

// ユーザーのブログ一覧ページ
class BlogUserHandler extends BlogHandler {
    @param('uid', Types.Int)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, uid: number, page = 1) {
        // ページネーションで記事一覧を取得
        const [ddocs, dpcount] = await this.ctx.db.paginate(
            BlogModel.getMulti({ owner: uid }),
            page,
            10,
        );
        // ユーザー情報を取得
        const udoc = await UserModel.getById(domainId, uid);

        // 表示するテンプレートとデータを設定
        this.response.template = 'blog_main.html';
        this.response.body = { ddocs, dpcount, udoc, page };
    }
}

// 記事の詳細ページ
class BlogDetailHandler extends BlogHandler {
    @param('did', Types.ObjectId)
    async get({ domainId }, did: ObjectId) {
        // 権限がある場合は記事のステータスも取得
        const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
            ? await BlogModel.getStatus(did, this.user._id)
            : null;

        const udoc = await UserModel.getById(domainId, this.ddoc!.owner);

        // 初回閲覧なら view カウントを +1
        if (!dsdoc?.view) {
            await Promise.all([
                BlogModel.inc(did, 'views', 1),
                BlogModel.setStatus(did, this.user._id, { view: true }),
            ]);
        }

        // テンプレートとデータを返す
        this.response.template = 'blog_detail.html';
        this.response.body = { ddoc: this.ddoc, dsdoc, udoc };
    }

    // POSTメソッドで記事操作
    async post() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
    }

    // スターをつける
    @param('did', Types.ObjectId)
    async postStar({ }, did: ObjectId) {
        await BlogModel.setStar(did, this.user._id, true);
        this.back({ star: true });
    }

    // スターを外す
    @param('did', Types.ObjectId)
    async postUnstar({ }, did: ObjectId) {
        await BlogModel.setStar(did, this.user._id, false);
        this.back({ star: false });
    }
}

// 記事の作成・編集・削除ページ
class BlogEditHandler extends BlogHandler {
    async get() {
        this.response.template = 'blog_edit.html';
        this.response.body = { ddoc: this.ddoc };
    }

    @param('title', Types.Title)
    @param('content', Types.Content)
    async postCreate({ }, title: string, content: string) {
        await this.limitRate('add_blog', 3600, 60); // 1時間に60件まで
        const did = await BlogModel.add(this.user._id, title, content, this.request.ip);
        this.response.body = { did };
        this.response.redirect = this.url('blog_detail', { uid: this.user._id, did });
    }

    @param('did', Types.ObjectId)
    @param('title', Types.Title)
    @param('content', Types.Content)
    async postUpdate({ }, did: ObjectId, title: string, content: string) {
        // 自分の記事じゃなければ管理権限チェック
        if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await Promise.all([
            BlogModel.edit(did, title, content),
            OplogModel.log(this, 'blog.edit', this.ddoc),
        ]);
        this.response.body = { did };
        this.response.redirect = this.url('blog_detail', { uid: this.user._id, did });
    }

    @param('did', Types.ObjectId)
    async postDelete({ }, did: ObjectId) {
        if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await Promise.all([
            BlogModel.del(did),
            OplogModel.log(this, 'blog.delete', this.ddoc),
        ]);
        this.response.redirect = this.url('blog_main', { uid: this.ddoc!.owner });
    }
}

// // タイピングページ
// class TypingHandler extends Handler {
//     async get() {
//         // JSONファイルのパスを組み立てる
//         const filePath = join(__dirname, 'typing_words', 'words_basic.json');

//         // ファイルを読み込んでパース
//         const raw = readFileSync(filePath, 'utf-8');
//         const words: string[] = JSON.parse(raw);

//         this.response.template = 'typing.html';
//         this.response.body = {
//             // JS 側でそのまま配列に使えるように文字列化して渡す
//             words: JSON.stringify(words),
//         };


//     };
// }

class PublicFileHandler extends Handler {
  async get({ filename }: { filename: string }) {
    const path = join(__dirname, 'public', filename);
    if (filename.endsWith('.js')) this.response.type = 'application/javascript';
    if (filename.endsWith('.css')) this.response.type = 'text/css';
    this.response.body = readFileSync(path, 'utf-8');
  }
}

interface TypingScore {
    _id?: ObjectId;
    uid: number;
    score: number;  // WPMを保存
    createdAt: Date;
}

interface WordItem {
    word: string;
    meaning?: string;
}

class TypingHandler extends Handler {
    async get() {

        // JSONファイルのパスを組み立てる
        const filePath = join(__dirname, 'typing_words', 'words.json');

        // ファイルを読み込んでパース
        const raw = readFileSync(filePath, 'utf-8');

        // 期待形式 [{word, meaning}] をサニタイズしつつ解析
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


        // wordsの0~300番目をランダムに50単語のみ抽出
        const randomWords = words.slice(0, 300).sort(() => 0.5 - Math.random()).slice(0, 5);
        console.log(randomWords);

        // ユーザーID（ログイン必須にしたい場合）
        const uid = this.user?._id || 0;

        // DBから履歴を最新10件取る
        const coll = this.ctx.db.collection<TypingScore>('typingScores');
        const history = await coll.find({ uid }).sort({ createdAt: -1 }).limit(5).toArray();

        this.response.template = 'typing.html';
        this.response.body = {
            words: JSON.stringify(randomWords),
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


// この apply 関数でルートやUIを設定する
export async function apply(ctx: Context) {
    ctx.Route('blog_main', '/blog/:uid', BlogUserHandler);
    ctx.Route('blog_create', '/blog/:uid/create', BlogEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('blog_detail', '/blog/:uid/:did', BlogDetailHandler);
    ctx.Route('blog_edit', '/blog/:uid/:did/edit', BlogEditHandler, PRIV.PRIV_USER_PROFILE);

    ctx.Route('typing_main', '/typing', TypingHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('public_files', '/public/:filename', PublicFileHandler);

    // ユーザーのドロップダウンに「Blog」メニューを追加
    ctx.injectUI('UserDropdown', 'blog_main', (h) => ({
        icon: 'book',
        displayName: 'Blog',
        uid: h.user._id.toString(),
    }), PRIV.PRIV_USER_PROFILE);

    // 多言語対応（中国語、韓国語、英語）
    ctx.i18n.load('zh', { "{0}'s blog": '{0} 的博客', Blog: '博客', blog_detail: '博客详情', blog_edit: '编辑博客', blog_main: '博客' });
    ctx.i18n.load('zh_TW', { "{0}'s blog": '{0} 的部落格', Blog: '部落格', blog_detail: '部落格詳情', blog_edit: '編輯部落格', blog_main: '部落格' });
    ctx.i18n.load('kr', { "{0}'s blog": '{0}의 블로그', Blog: '블로그', blog_main: '블로그', blog_detail: '블로그 상세', blog_edit: '블로그 수정' });
    ctx.i18n.load('en', { blog_main: 'Blog', blog_detail: 'Blog Detail', blog_edit: 'Edit Blog' });
}

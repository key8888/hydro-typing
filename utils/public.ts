import { Handler } from 'hydrooj';
import { join, normalize } from 'path';
import { readFileSync } from 'fs';

export class PublicFileHandler extends Handler {
  async get({ filename }: { filename: string }) {
    const base = join(__dirname, '..', 'public');
    const p = normalize(join(base, filename));

    // FIX: HIGH-001 — startsWith はディレクトリ境界をチェックしないため base + '/' で境界チェックする
    if (!p.startsWith(base + '/') && p !== base) {
      this.status = 403;
      this.response.body = 'Forbidden';
      return;
    }

    if (filename.endsWith('.css')) this.response.type = 'text/css';
    if (filename.endsWith('.js'))  this.response.type = 'application/javascript';

    // FIX: koa-static-cache の maxAge 競合を避けるため強力なキャッシュ無効化ヘッダー
    this.response.addHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    this.response.addHeader('Pragma', 'no-cache');
    this.response.addHeader('Expires', '0');
    // FIX: CRIT-002 — readFileSync に try-catch でエラーハンドリングを追加（存在しないファイルリクエスト時のサーバークラッシュ防止）
    try {
      this.response.body = readFileSync(p, 'utf-8');
    } catch {
      this.status = 404;
      this.response.body = 'Not Found';
    }
  }
}

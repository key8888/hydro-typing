import { Handler } from 'hydrooj';
import { join, normalize } from 'path';
import { readFileSync } from 'fs';

export class PublicFileHandler extends Handler {
  async get({ filename }: { filename: string }) {
    const base = join(__dirname, '..', 'public');
    const p = normalize(join(base, filename));

    if (!p.startsWith(base)) {
      this.status = 403;
      this.response.body = 'Forbidden';
      return;
    }

    if (filename.endsWith('.css')) this.response.type = 'text/css';
    if (filename.endsWith('.js'))  this.response.type = 'application/javascript';

    this.response.addHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    // FIX: CRIT-002 — readFileSync に try-catch でエラーハンドリングを追加（存在しないファイルリクエスト時のサーバークラッシュ防止）
    try {
      this.response.body = readFileSync(p, 'utf-8');
    } catch {
      this.status = 404;
      this.response.body = 'Not Found';
    }
  }
}

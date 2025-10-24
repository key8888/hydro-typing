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

    this.response.body = readFileSync(p, 'utf-8');
  }
}

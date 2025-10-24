import { Context, Handler } from 'hydrooj';

class CodeGamePage extends Handler {
  async get() {
    this.response.template = 'codegame.html';
    this.response.body = {};
  }
}

export function applyCodeGame(ctx: Context) {
  ctx.Route('codegame_main', '/codegame', CodeGamePage);
}

import { Context, PRIV } from 'hydrooj';
import { applyBlog } from './features/blog';
import { applyTyping } from './features/typing';
import { applyCoinget } from './features/coinget';
import { PublicFileHandler } from './utils/public';

export async function apply(ctx: Context) {
  applyBlog(ctx);
  applyTyping(ctx);
  // コインゲットモード + 管理者画面のルートを登録
  applyCoinget(ctx);

  // FIX: koa-static-cache が自動登録する /public/ パスと競合するため /typing-assets/ に変更し
  // 自前の Cache-Control: no-cache ハンドラが確実にリクエストを処理できるようにする
  ctx.Route('typing_assets', '/typing-assets/:filename', PublicFileHandler);

  // UI 注入（メニュー／ドロップダウン）
  ctx.injectUI('UserDropdown', 'blog_main', (h) => ({
    icon: 'book',
    displayName: 'Blog',
    uid: h.user._id.toString(),
  }), PRIV.PRIV_USER_PROFILE);

  ctx.injectUI('Nav', 'typing_main', (h) => ({
    icon: 'keyboard',
    displayName: 'Typing',
    prefix: 'typing',
    uid: h.user._id.toString(),
  }), PRIV.PRIV_USER_PROFILE);
}

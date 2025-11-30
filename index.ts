import { Context, PRIV } from 'hydrooj';
import { applyBlog } from './features/blog';
import { applyTyping } from './features/typing';
import { PublicFileHandler } from './utils/public';

export async function apply(ctx: Context) {
  // 各機能のルートを登録
  applyBlog(ctx);
  applyTyping(ctx);

  // 静的配信
  ctx.Route('public_files', '/public/:filename', PublicFileHandler);

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

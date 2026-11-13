import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { consumeOAuthState } from '../db.js';
import {
  clearAdminSessionCookie,
  isRequestAuthenticated,
  setAdminSessionCookie,
} from '../middleware/adminAuth.js';
import { exchangeCodeAndSaveChannel } from '../youtube.js';

export const authRouter = Router();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPopupResultPage(ok: boolean, title: string, detail: string, returnUrl: string): string {
  const safeTitle = escapeHtml(title);
  const safeDetail = escapeHtml(detail);
  const safeUrl = escapeHtml(returnUrl);
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#0b0f17; color:#f1f5f9; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
    .card { max-width:460px; width:100%; background:#131a27; border:1px solid ${ok ? '#16a34a55' : '#ef444455'}; border-radius:16px; padding:28px; box-shadow:0 20px 50px #00000080; text-align:center; }
    .badge { display:inline-block; padding:6px 12px; border-radius:999px; font-size:13px; font-weight:600; background:${ok ? '#16a34a22' : '#ef444422'}; color:${ok ? '#4ade80' : '#f87171'}; margin-bottom:14px; }
    h1 { margin:0 0 10px; font-size:20px; }
    p { margin:0 0 22px; color:#94a3b8; font-size:14px; line-height:1.5; }
    .btn { display:inline-block; padding:10px 18px; border-radius:10px; background:#ef4444; color:#fff; text-decoration:none; font-weight:600; font-size:14px; border:none; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${ok ? 'Готово' : 'Помилка OAuth'}</div>
    <h1>${safeTitle}</h1>
    <p>${safeDetail}</p>
    <a class="btn" href="${safeUrl}">Повернутися в панель</a>
  </div>
</body>
</html>`;
}

authRouter.get('/status', (req, res) => {
  res.json({
    passwordEnabled: Boolean(config.adminPassword),
    authenticated: isRequestAuthenticated(req),
  });
});

authRouter.post('/login', (req, res) => {
  if (!config.adminPassword) {
    res.json({ ok: true });
    return;
  }
  const password = String(req.body?.password || '');
  const a = Buffer.from(password);
  const b = Buffer.from(config.adminPassword);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Невірний пароль' });
    return;
  }
  setAdminSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/logout', (_req, res) => {
  clearAdminSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/google/callback', async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const oauthError = String(req.query.error || '');

  const stateData = state ? consumeOAuthState(state) : null;
  const fallbackOrigin = config.frontendUrl || config.publicBaseUrl;
  const returnOrigin = stateData?.returnOrigin || fallbackOrigin;

  if (oauthError) {
    const returnUrl = `${returnOrigin}/?tab=channels&oauth_error=${encodeURIComponent(oauthError)}`;
    if (stateData?.mode === 'desktop') {
      config.onOAuthCompleted?.({ ok: false, error: oauthError });
    }
    if (stateData?.mode === 'copy' || stateData?.mode === 'desktop') {
      res
        .status(400)
        .send(renderPopupResultPage(false, 'Авторизацію скасовано', `Google повернув: ${oauthError}`, returnUrl));
      return;
    }
    res.redirect(returnUrl);
    return;
  }

  if (!stateData) {
    res
      .status(400)
      .send(
        renderPopupResultPage(
          false,
          'Недійсний або прострочений state',
          'Згенеруйте нове посилання підключення каналу в панелі YT AutoPost Studio.',
          `${fallbackOrigin}/?tab=channels`
        )
      );
    return;
  }

  if (!code) {
    res
      .status(400)
      .send(
        renderPopupResultPage(
          false,
          'Код авторизації відсутній',
          'Google не повернув authorization code.',
          `${returnOrigin}/?tab=channels`
        )
      );
    return;
  }

  try {
    const channel = await exchangeCodeAndSaveChannel(code);
    const successUrl = `${returnOrigin}/?tab=channels&connected=${encodeURIComponent(channel.title)}`;
    if (stateData.mode === 'desktop') {
      config.onOAuthCompleted?.({ ok: true, channelTitle: channel.title });
      res.send(
        renderPopupResultPage(
          true,
          `Канал «${channel.title}» підключено!`,
          `Акаунт ${channel.googleEmail || channel.youtubeChannelId} збережено локально на вашому комп’ютері. Можете закрити цю вкладку браузера — програма YT AutoPost Studio уже оновилась.`,
          successUrl
        )
      );
      return;
    }
    if (stateData.mode === 'copy') {
      res.send(
        renderPopupResultPage(
          true,
          `Канал «${channel.title}» підключено!`,
          `Акаунт ${channel.googleEmail || channel.youtubeChannelId} збережено. Можете закрити це вікно інкогніто/профіль та повернутися в основну вкладку панелі.`,
          successUrl
        )
      );
      return;
    }
    res.redirect(successUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errUrl = `${returnOrigin}/?tab=channels&oauth_error=${encodeURIComponent(msg)}`;
    if (stateData.mode === 'desktop') {
      config.onOAuthCompleted?.({ ok: false, error: msg });
    }
    if (stateData.mode === 'copy' || stateData.mode === 'desktop') {
      res.status(500).send(renderPopupResultPage(false, 'Не вдалося підключити канал', msg, errUrl));
      return;
    }
    res.redirect(errUrl);
  }
});

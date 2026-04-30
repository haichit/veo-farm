// Injected into labs.google page context — has access to grecaptcha + makes Socket.IO connection.
(async function () {
  const TAG = '[Veo-Farm-Ext/Injected]';
  const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';
  const DEFAULT_SERVER = 'http://127.0.0.1:3456';

  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, '⚠️', ...a);
  const err = (...a) => console.error(TAG, '❌', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForGrecaptcha(timeoutMs = 30_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.grecaptcha?.enterprise?.execute) return;
      await sleep(200);
    }
    throw new Error('reCAPTCHA Enterprise not available after 30s');
  }

  async function solveRecaptcha(action = 'IMAGE_GENERATION') {
    log('Solving reCAPTCHA action=' + action);
    const token = await window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action });
    log('Token obtained (' + token.length + ' chars)');
    try {
      localStorage.removeItem('_grecaptcha');
    } catch {}
    return token;
  }

  function getSettings() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ serverUrl: DEFAULT_SERVER }), 500);
      const handler = (evt) => {
        if (evt.source !== window || evt.data?.type !== 'VEO_GET_SETTINGS_RESPONSE') return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(evt.data.settings || {});
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'VEO_GET_SETTINGS_REQUEST' }, '*');
    });
  }

  try {
    const settings = await getSettings();
    const serverUrl = settings.serverUrl ?? DEFAULT_SERVER;
    log('Server URL:', serverUrl);

    if (typeof window.io !== 'function') {
      err('socket.io client not loaded — extension files missing socket.io.min.js');
      return;
    }

    const socket = window.io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      log('✅ Connected (id=' + socket.id + ')');
      const ua = navigator.userAgent || '';
      const isHeadless = navigator.webdriver === true || ua.includes('HeadlessChrome');
      const browserType = isHeadless ? 'brave' : 'chrome';
      socket.emit('client:ready', {
        timestamp: new Date().toISOString(),
        browserType,
      });
    });

    socket.on('disconnect', (reason) => warn('Disconnected:', reason));
    socket.on('connect_error', (e) => warn('Connection error:', e.message));

    socket.on('server:request-captcha', async ({ requestId, action }) => {
      log('Captcha request:', action);
      try {
        await waitForGrecaptcha();
        const token = await solveRecaptcha(action || 'IMAGE_GENERATION');
        socket.emit('client:captcha-solved', {
          requestId,
          token,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        const msg = e?.message || String(e);
        err('Solve failed:', msg);
        socket.emit('client:captcha-error', { requestId, error: msg });
      }
    });

    socket.on('server:reload-page', ({ delay = 0 }) => {
      warn('Server requested page reload');
      try {
        localStorage.removeItem('_grecaptcha');
      } catch {}
      if (delay > 0) setTimeout(() => location.reload(), delay);
      else location.reload();
    });

    // Initial wait so the reCAPTCHA library is preloaded.
    await waitForGrecaptcha().catch((e) => warn('Initial wait:', e.message));

    // Expose for manual debugging.
    window.veoFarmCaptcha = {
      socket,
      solve: () => solveRecaptcha(),
      reload: () => location.reload(),
    };
    log('✅ Captcha solver ready');
  } catch (e) {
    err('Init failed:', e.message);
  }
})();

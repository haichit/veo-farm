// Injected into labs.google page context — has access to grecaptcha.
// Listens for VEO_SOLVE_REQUEST postMessage from content script, runs
// reCAPTCHA Enterprise, posts back VEO_CAPTCHA_RESULT with token or error.
//
// Connection to captcha-server lives in background.js (see background.js
// for rationale).
(function () {
  const TAG = '[Veo-Farm-Ext/Injected]';
  const RECAPTCHA_SITE_KEY = '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV';

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

  window.addEventListener('message', async (evt) => {
    if (evt.source !== window) return;
    if (evt.data?.type !== 'VEO_SOLVE_REQUEST') return;
    const { requestId, action } = evt.data;
    try {
      await waitForGrecaptcha();
      const token = await solveRecaptcha(action || 'IMAGE_GENERATION');
      window.postMessage({ type: 'VEO_CAPTCHA_RESULT', requestId, token }, '*');
    } catch (e) {
      const msg = e?.message || String(e);
      err('Solve failed:', msg);
      window.postMessage({ type: 'VEO_CAPTCHA_RESULT', requestId, error: msg }, '*');
    }
  });

  // Pre-warm grecaptcha so first solve is fast.
  waitForGrecaptcha().catch((e) => warn('Initial wait:', e.message));

  // Expose for manual debugging.
  window.veoFarmCaptcha = {
    solve: () => solveRecaptcha(),
    reload: () => location.reload(),
  };
  log('✅ Captcha solver ready');
})();

// Content script — injects injected.js (page-context grecaptcha solver),
// and bridges background <-> page for captcha solve requests.
//
// Connection to captcha-server now lives in background.js (extension
// origin, exempt from page-level Brave Shields). This content script just
// relays solve requests from background to the page and responses back.
(function () {
  const TAG = '[Veo-Farm-Ext/Content]';
  const log = (...a) => console.log(TAG, ...a);
  const err = (...a) => console.error(TAG, '❌', ...a);

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.type = 'text/javascript';
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load ' + src));
    });
  }

  async function inject() {
    try {
      await injectScript('injected.js');
    } catch (e) {
      err('Injection failed:', e.message);
    }
  }

  // ─── Background → Page ───
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'VEO_SOLVE_CAPTCHA') {
      const { requestId, action } = msg;
      const handler = (evt) => {
        if (evt.source !== window) return;
        if (evt.data?.type !== 'VEO_CAPTCHA_RESULT') return;
        if (evt.data?.requestId !== requestId) return;
        window.removeEventListener('message', handler);
        if (evt.data.token) sendResponse({ token: evt.data.token });
        else sendResponse({ error: evt.data.error || 'unknown' });
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'VEO_SOLVE_REQUEST', requestId, action }, '*');
      return true; // async response
    }
    if (msg?.type === 'VEO_RELOAD_PAGE') {
      try {
        localStorage.removeItem('_grecaptcha');
      } catch {}
      const delay = msg.delay || 0;
      if (delay > 0) setTimeout(() => location.reload(), delay);
      else location.reload();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // ─── Keepalive: hold a long-lived port to background so MV3 doesn't
  // suspend the service worker. The port disconnects after 5 minutes;
  // we reconnect immediately. This guarantees the SW stays alive while
  // there is a labs.google tab open.
  let keepalivePort = null;
  function openKeepalive() {
    try {
      keepalivePort = chrome.runtime.connect({ name: 'keepalive' });
      keepalivePort.onDisconnect.addListener(() => {
        keepalivePort = null;
        setTimeout(openKeepalive, 1000);
      });
    } catch (e) {
      err('Keepalive port failed:', e.message);
      setTimeout(openKeepalive, 5000);
    }
  }
  openKeepalive();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
  log('✅ Content script ready');
})();

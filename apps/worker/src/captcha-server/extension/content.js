// Content script — injects socket.io.min.js + injected.js into the page,
// and bridges page postMessage <-> chrome.runtime.
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
      await injectScript('socket.io.min.js');
      await injectScript('injected.js');
    } catch (e) {
      err('Injection failed:', e.message);
    }
  }

  // Bridge: page (window.postMessage) <-> background (chrome.runtime).
  window.addEventListener('message', (evt) => {
    if (evt.source !== window) return;
    if (evt.data?.type === 'VEO_GET_SETTINGS_REQUEST') {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        window.postMessage(
          { type: 'VEO_GET_SETTINGS_RESPONSE', settings: response || {} },
          '*',
        );
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
  log('✅ Content script ready');
})();

// Service worker — settings storage + HTTP long-polling to captcha-server.
//
// Why HTTP, not socket.io: page-context fetch from labs.google → 127.0.0.1
// is blocked by Brave Shields' adblock engine (ERR_BLOCKED_BY_CLIENT) and
// importScripts() of the bundled socket.io.min.js into a service worker
// fails after install. fetch() from the SW (extension origin) is exempt
// from page-level shields and works cleanly. Long-polling /client/poll
// gives near-realtime delivery of captcha requests.

const DEFAULT_SETTINGS = {
  serverUrl: 'https://127.0.0.1:3456',
  clearGrecaptcha: false,
};

let currentSettings = { ...DEFAULT_SETTINGS };
let clientId = null;
let polling = false;
let stopPolling = false;

const log = (...a) => console.log('[Veo-Farm-BG]', ...a);
const warn = (...a) => console.warn('[Veo-Farm-BG] ⚠️', ...a);
const err = (...a) => console.error('[Veo-Farm-BG] ❌', ...a);

function findLabsTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: 'https://labs.google/*' }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0] : null);
    });
  });
}

async function relayCaptchaRequest(requestId, action) {
  const tab = await findLabsTab();
  if (!tab?.id) {
    warn('No labs.google tab to relay to');
    await postResult(requestId, null, 'no labs.google tab open');
    return;
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id,
      { type: 'VEO_SOLVE_CAPTCHA', requestId, action: action || 'IMAGE_GENERATION' },
      async (response) => {
        if (chrome.runtime.lastError) {
          err('Tab message failed:', chrome.runtime.lastError.message);
          await postResult(requestId, null, chrome.runtime.lastError.message);
        } else if (response?.token) {
          await postResult(requestId, response.token, null);
        } else if (response?.error) {
          await postResult(requestId, null, response.error);
        } else {
          await postResult(requestId, null, 'no response from page');
        }
        resolve();
      },
    );
  });
}

async function postResult(requestId, token, error) {
  const url = (currentSettings.serverUrl || DEFAULT_SETTINGS.serverUrl) + '/client/result';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, token, error }),
    });
  } catch (e) {
    err('postResult failed:', e?.message || e);
  }
}

async function register() {
  const url = (currentSettings.serverUrl || DEFAULT_SETTINGS.serverUrl) + '/client/register';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserType: 'brave' }),
    });
    const data = await res.json();
    clientId = data.clientId;
    log('✅ Registered, clientId=', clientId);
    return clientId;
  } catch (e) {
    err('register failed:', e?.message || e);
    return null;
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  stopPolling = false;
  while (!stopPolling) {
    if (!clientId) {
      const id = await register();
      if (!id) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
    }
    const url =
      (currentSettings.serverUrl || DEFAULT_SETTINGS.serverUrl) +
      '/client/poll?clientId=' +
      encodeURIComponent(clientId);
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        // Server lost our registration (restart) — re-register.
        warn('clientId expired, re-registering');
        clientId = null;
        continue;
      }
      const data = await res.json();
      if (data.requestId) {
        log('Captcha request:', data.action, data.requestId.slice(0, 12));
        // Don't await — handle in parallel so we can keep polling.
        relayCaptchaRequest(data.requestId, data.action).catch((e) =>
          err('relay error:', e?.message || e),
        );
      }
      // Either idle or relayed — loop immediately.
    } catch (e) {
      warn('poll error:', e?.message || e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  polling = false;
}

// Bootstrap on install/startup AND on script load (covers --load-extension).
function bootstrap() {
  chrome.storage.local.get('settings', loadAndStart);
}
chrome.runtime.onInstalled.addListener(() => {
  log('onInstalled');
  bootstrap();
});
chrome.runtime.onStartup.addListener(() => {
  log('onStartup');
  bootstrap();
});
bootstrap();

// Long-lived port from content scripts keeps the SW alive.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'keepalive') return;
  log('keepalive port from', port.sender?.url);
  setTimeout(() => { try { port.disconnect(); } catch {} }, 4 * 60 * 1000);
  if (!polling) pollLoop();
});

// Belt-and-suspenders: alarm-based wake.
chrome.alarms?.create?.('keepalive', { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm.addListener(() => {
  if (!polling) pollLoop();
});

function loadAndStart(data) {
  data = data || {};
  if (data.settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    let migrated = false;
    if (currentSettings.serverUrl?.includes('localhost')) {
      currentSettings.serverUrl = currentSettings.serverUrl.replace('localhost', '127.0.0.1');
      migrated = true;
    }
    if (currentSettings.serverUrl?.startsWith('http://')) {
      currentSettings.serverUrl = currentSettings.serverUrl.replace('http://', 'https://');
      migrated = true;
    }
    if (migrated) chrome.storage.local.set({ settings: currentSettings });
    log('Loaded:', currentSettings, migrated ? '(migrated)' : '');
  }
  if (!polling) pollLoop();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_SETTINGS') {
    sendResponse(currentSettings);
    return true;
  }
  if (msg?.type === 'SAVE_SETTINGS') {
    currentSettings = { ...DEFAULT_SETTINGS, ...msg.settings };
    chrome.storage.local.set({ settings: currentSettings }, () => {
      sendResponse({ ok: true });
      // Re-register on settings change.
      clientId = null;
      stopPolling = true;
      setTimeout(() => { stopPolling = false; if (!polling) pollLoop(); }, 100);
    });
    return true;
  }
  return false;
});

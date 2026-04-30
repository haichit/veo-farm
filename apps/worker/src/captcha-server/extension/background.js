// Service worker — settings storage + page <-> background bridge.
const DEFAULT_SETTINGS = {
  serverUrl: 'http://127.0.0.1:3456',
  clearGrecaptcha: false,
};

let currentSettings = { ...DEFAULT_SETTINGS };

chrome.storage.local.get('settings', (data) => {
  if (data.settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    // Some Chrome versions block localhost mixed-content; rewrite to 127.0.0.1.
    if (currentSettings.serverUrl?.includes('localhost')) {
      currentSettings.serverUrl = currentSettings.serverUrl.replace('localhost', '127.0.0.1');
      chrome.storage.local.set({ settings: currentSettings });
    }
    console.log('[Veo-Farm-BG] Loaded:', currentSettings);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_SETTINGS') {
    sendResponse(currentSettings);
    return true;
  }
  if (msg?.type === 'SAVE_SETTINGS') {
    currentSettings = { ...DEFAULT_SETTINGS, ...msg.settings };
    chrome.storage.local.set({ settings: currentSettings }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});

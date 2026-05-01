// Service worker — settings storage + page <-> background bridge.
const DEFAULT_SETTINGS = {
  serverUrl: 'https://127.0.0.1:3456',
  clearGrecaptcha: false,
};

let currentSettings = { ...DEFAULT_SETTINGS };

chrome.storage.local.get('settings', (data) => {
  if (data.settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...data.settings };
    let migrated = false;
    // Migration 1: localhost → 127.0.0.1 (some Chrome versions block localhost mixed content).
    if (currentSettings.serverUrl?.includes('localhost')) {
      currentSettings.serverUrl = currentSettings.serverUrl.replace('localhost', '127.0.0.1');
      migrated = true;
    }
    // Migration 2: http:// → https:// (server is HTTPS only as of Day 7B).
    if (currentSettings.serverUrl?.startsWith('http://')) {
      currentSettings.serverUrl = currentSettings.serverUrl.replace('http://', 'https://');
      migrated = true;
    }
    if (migrated) chrome.storage.local.set({ settings: currentSettings });
    console.log('[Veo-Farm-BG] Loaded:', currentSettings, migrated ? '(migrated)' : '');
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

// Popup — load + save settings via background service worker.
const $ = (id) => document.getElementById(id);

function showStatus(text, ok = true) {
  const el = $('status');
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
  setTimeout(() => {
    el.textContent = '';
    el.className = '';
  }, 2500);
}

chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
  if (!settings) return;
  $('serverUrl').value = settings.serverUrl ?? 'http://127.0.0.1:3456';
  $('clearGrecaptcha').checked = !!settings.clearGrecaptcha;
});

$('save').addEventListener('click', () => {
  const settings = {
    serverUrl: $('serverUrl').value.trim() || 'http://127.0.0.1:3456',
    clearGrecaptcha: $('clearGrecaptcha').checked,
  };
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, (resp) => {
    if (resp?.ok) showStatus('Saved.', true);
    else showStatus('Save failed.', false);
  });
});

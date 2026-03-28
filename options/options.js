// Options page – API key management
const STORAGE_KEY = 'openaiApiKey';

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('api-key-input');
  const saveBtn = document.getElementById('save-key-btn');
  const statusEl = document.getElementById('key-status');
  const toggleBtn = document.getElementById('toggle-visibility');
  const eyeIcon = document.getElementById('eye-icon');

  // Load existing key
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const key = data[STORAGE_KEY];
    if (key) {
      input.value = key;
      setStatus('Key loaded from storage.', 'ok');
    }
  });

  // Show/hide toggle
  let visible = false;
  toggleBtn.addEventListener('click', () => {
    visible = !visible;
    input.type = visible ? 'text' : 'password';
    eyeIcon.textContent = visible ? 'Hide' : 'Show';
  });

  // Save key
  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) {
      setStatus('Please enter an API key.', 'err');
      return;
    }
    if (!key.startsWith('sk-')) {
      setStatus('Invalid key — should start with "sk-".', 'err');
      return;
    }
    saveBtn.disabled = true;
    chrome.storage.local.set({ [STORAGE_KEY]: key }, () => {
      setStatus('Saved!', 'ok');
      saveBtn.disabled = false;
      setTimeout(() => {
        if (statusEl.textContent === 'Saved!') {
          statusEl.textContent = '';
          statusEl.className = 'key-status';
        }
      }, 3000);
    });
  });

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.className = 'key-status' + (type === 'ok' ? ' status-ok' : type === 'err' ? ' status-err' : '');
  }
});

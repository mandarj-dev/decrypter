import './style.css';
import { decryptAES } from './decrypt.js';
import {
  getHistory,
  addHistoryEntry,
  removeHistoryEntry,
  clearHistory,
  formatTime,
} from './history.js';

const $ = (sel) => document.querySelector(sel);

const outputEl = $('#output-code');
const statusEl = $('#status');
const decryptBtn = $('#decrypt-btn');
const historyList = $('#history-list');
const clearHistoryBtn = $('#clear-history-btn');

let busy = false;

function setOutput(text) {
  outputEl.textContent = text || '';
}

function getOutput() {
  return outputEl.textContent || '';
}

function showToast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (type ? ` ${type}` : '');
}

function setBusy(loading) {
  busy = loading;
  decryptBtn.disabled = loading;
  decryptBtn.textContent = loading ? 'Decrypting…' : 'Decrypt';
}

function normalizeInput(raw) {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function unwrapNestedJson(obj) {
  if (typeof obj === 'string') {
    try {
      return JSON.parse(obj);
    } catch {
      return obj;
    }
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj.req_body === 'string') {
    try {
      return { ...obj, req_body: JSON.parse(obj.req_body) };
    } catch {
      return obj;
    }
  }
  return obj;
}

function formatOutputJson({ silent = false } = {}) {
  const raw = getOutput();
  if (!raw) {
    if (!silent) showToast('Nothing to format');
    return false;
  }
  try {
    let obj = JSON.parse(raw);
    obj = unwrapNestedJson(obj);
    setOutput(JSON.stringify(obj, null, 2));
    if (!silent) showToast('Formatted');
    return true;
  } catch {
    if (!silent) showToast('Not valid JSON');
    return false;
  }
}

function preview(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? oneLine.slice(0, 60) + '…' : oneLine;
}

function renderHistory() {
  const items = getHistory();
  clearHistoryBtn.hidden = items.length === 0;

  if (items.length === 0) {
    historyList.innerHTML =
      '<li class="history-empty">Decrypted results appear here for this session</li>';
    return;
  }

  historyList.innerHTML = items
    .map(
      (item) => `
    <li class="history-item" data-id="${item.id}">
      <span class="history-time">${formatTime(item.at)}</span>
      <button type="button" class="history-load" data-id="${item.id}">
        <span class="history-preview">${escapeHtml(preview(item.output))}</span>
        <span class="history-meta">from: ${escapeHtml(item.inputPreview || '—')}</span>
      </button>
      <button type="button" class="history-remove" data-id="${item.id}" title="Remove">×</button>
    </li>`
    )
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadFromHistory(id) {
  const item = getHistory().find((e) => e.id === id);
  if (!item) return;
  setOutput(item.output);
  setStatus('Loaded from history', 'success');
  formatOutputJson({ silent: true });
}

$('#decrypt-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;

  const key = $('#key').value.trim();
  const data = normalizeInput($('#data').value);

  if (!key) {
    setStatus('Secret key is required', 'error');
    showToast('Secret key is required');
    return;
  }
  if (!data) {
    setStatus('Encrypted data is required', 'error');
    showToast('Encrypted data is required');
    return;
  }

  try {
    setBusy(true);
    setStatus('Decrypting…');

    await new Promise((r) => setTimeout(r, 50));

    const decrypted = decryptAES(data, key);
    setOutput(decrypted);
    formatOutputJson({ silent: true });

    addHistoryEntry({ output: getOutput(), inputPreview: data });
    renderHistory();

    setStatus('Decrypted successfully', 'success');
    showToast('Decrypted');
  } catch (error) {
    setOutput('');
    const msg = error.message || 'Decryption failed';
    const friendly =
      msg.includes('invalid key') || msg.includes('corrupted')
        ? 'Check your key and ciphertext'
        : msg;
    setStatus(friendly, 'error');
    showToast('Decryption failed');
  } finally {
    setBusy(false);
  }
});

$('#copy-btn').addEventListener('click', async () => {
  const text = getOutput();
  if (!text) {
    showToast('Nothing to copy');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    showToast('Copy failed');
  }
});

$('#format-btn').addEventListener('click', () => formatOutputJson());

$('#clear-btn').addEventListener('click', () => {
  $('#key').value = '';
  $('#data').value = '';
  setOutput('');
  setStatus('Ready');
  $('#key').focus();
});

$('#paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showToast('Clipboard is empty');
      return;
    }
    $('#data').value = normalizeInput(text);
    $('#data').focus();
    showToast('Pasted');
  } catch {
    showToast('Clipboard access denied');
  }
});

$('#toggle-key').addEventListener('click', () => {
  const input = $('#key');
  const btn = $('#toggle-key');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
});

historyList.addEventListener('click', (e) => {
  const loadBtn = e.target.closest('.history-load');
  const removeBtn = e.target.closest('.history-remove');

  if (loadBtn) {
    loadFromHistory(loadBtn.dataset.id);
    return;
  }
  if (removeBtn) {
    removeHistoryEntry(removeBtn.dataset.id);
    renderHistory();
    showToast('Removed');
  }
});

clearHistoryBtn.addEventListener('click', () => {
  clearHistory();
  renderHistory();
  showToast('History cleared');
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    $('#decrypt-form').requestSubmit();
  }
});

renderHistory();
$('#data').focus();

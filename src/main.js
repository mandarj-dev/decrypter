import './style.css';
import { decryptAES } from './decrypt.js';
import { highlightJson } from './jsonHighlight.js';
import {
  getHistory,
  addHistoryEntry,
  removeHistoryEntry,
  clearHistory,
  formatTime,
} from './history.js';

const $ = (sel) => document.querySelector(sel);

const outputEl = $('#output-code');
const preEl = $('#output');
const statusBar = $('#status-bar');
const statusText = $('#status-text');
const decryptBtn = $('#decrypt-btn');
const historyList = $('#history-list');
const historyCount = $('#history-count');
const historyPanel = $('#history-panel');
const historyBody = $('#history-body');
const historyToggle = $('#history-toggle');
const clearHistoryBtn = $('#clear-history-btn');
const wrapBtn = $('#wrap-btn');

let busy = false;
let activeHistoryId = null;

function setOutput(text) {
  if (!text) {
    outputEl.textContent = '';
    preEl.classList.add('empty');
    return;
  }

  preEl.classList.remove('empty');
  try {
    JSON.parse(text);
    outputEl.innerHTML = highlightJson(text);
  } catch {
    outputEl.textContent = text;
  }
}

function getOutput() {
  return outputEl.textContent || '';
}

function showToast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), ms);
}

function setStatus(msg, type = 'ready') {
  statusText.textContent = msg;
  statusBar.className = 'status-bar' + (type ? ` ${type}` : '');
}

function setBusy(loading) {
  busy = loading;
  decryptBtn.disabled = loading;
  decryptBtn.classList.toggle('loading', loading);
  decryptBtn.textContent = loading ? 'Decrypting…' : 'Decrypt';
  if (loading) setStatus('Decrypting…', 'info');
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
    if (!silent) showToast('JSON formatted');
    return true;
  } catch {
    if (!silent) showToast('Not valid JSON');
    return false;
  }
}

function preview(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 72 ? oneLine.slice(0, 72) + '…' : oneLine;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateFieldStates() {
  $('#key').closest('.field').classList.toggle('field-filled', !!$('#key').value.trim());
  $('#data').closest('.field').classList.toggle('field-filled', !!$('#data').value.trim());
}

function setHistoryOpen(open) {
  historyPanel.classList.toggle('open', open);
  historyBody.hidden = !open;
  historyToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function renderHistory() {
  const items = getHistory();
  historyCount.textContent = String(items.length);
  clearHistoryBtn.hidden = items.length === 0;

  if (items.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No entries yet — decrypt something to build history</li>';
    return;
  }

  historyList.innerHTML = items
    .map(
      (item) => `
    <li class="history-item${item.id === activeHistoryId ? ' active' : ''}" data-id="${item.id}">
      <button type="button" class="history-load" data-id="${item.id}">
        <span class="history-time">${formatTime(item.at)}</span>
        <span class="history-preview">${escapeHtml(preview(item.output))}</span>
      </button>
      <button type="button" class="history-remove" data-id="${item.id}" title="Remove">×</button>
    </li>`
    )
    .join('');
}

function loadFromHistory(id) {
  const item = getHistory().find((e) => e.id === id);
  if (!item) return;

  activeHistoryId = id;
  if (item.input) $('#data').value = item.input;
  setOutput(item.output);
  updateFieldStates();
  renderHistory();
  setStatus('Restored from session history', 'success');
  showToast('Restored from history');
  preEl.focus();
}

async function runDecrypt() {
  if (busy) return;

  const key = $('#key').value.trim();
  const data = normalizeInput($('#data').value);

  if (!key) {
    setStatus('Secret key is required', 'error');
    showToast('Secret key is required');
    $('#key').focus();
    return;
  }
  if (!data) {
    setStatus('Encrypted data is required', 'error');
    showToast('Encrypted data is required');
    $('#data').focus();
    return;
  }

  try {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 40));

    const decrypted = decryptAES(data, key);
    setOutput(decrypted);
    formatOutputJson({ silent: true });

    const entry = addHistoryEntry({ output: getOutput(), input: data });
    activeHistoryId = entry.id;
    renderHistory();
    if (!historyPanel.classList.contains('open') && getHistory().length === 1) {
      setHistoryOpen(true);
    }

    setStatus('Decryption successful', 'success');
    showToast('Decrypted successfully');
    preEl.focus();
  } catch (error) {
    setOutput('');
    activeHistoryId = null;
    const msg = error.message || 'Decryption failed';
    const friendly =
      msg.includes('invalid key') || msg.includes('corrupted')
        ? 'Decryption failed — check your secret key and ciphertext'
        : msg;
    setStatus(friendly, 'error');
    showToast('Decryption failed');
  } finally {
    setBusy(false);
    renderHistory();
  }
}

$('#decrypt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runDecrypt();
});

$('#copy-btn').addEventListener('click', async () => {
  const text = getOutput();
  if (!text) {
    showToast('Nothing to copy');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    const btn = $('#copy-btn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1600);
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy failed');
  }
});

$('#format-btn').addEventListener('click', () => formatOutputJson());

$('#minify-btn').addEventListener('click', () => {
  const raw = getOutput();
  if (!raw) {
    showToast('Nothing to minify');
    return;
  }
  try {
    let obj = JSON.parse(raw);
    obj = unwrapNestedJson(obj);
    setOutput(JSON.stringify(obj));
    showToast('JSON minified');
  } catch {
    showToast('Not valid JSON');
  }
});

$('#wrap-btn').addEventListener('click', () => {
  const wrapped = preEl.classList.toggle('wrap');
  wrapBtn.setAttribute('aria-pressed', wrapped ? 'true' : 'false');
  wrapBtn.textContent = wrapped ? 'Wrap' : 'No wrap';
});

$('#download-btn').addEventListener('click', () => {
  const text = getOutput();
  if (!text) {
    showToast('Nothing to download');
    return;
  }
  let filename = 'decrypted.txt';
  let mime = 'text/plain';
  try {
    JSON.parse(text);
    filename = 'decrypted.json';
    mime = 'application/json';
  } catch { /* plain text */ }

  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`);
});

$('#clear-btn').addEventListener('click', () => {
  $('#data').value = '';
  setOutput('');
  activeHistoryId = null;
  updateFieldStates();
  renderHistory();
  setStatus('Ready — enter your secret key and encrypted data', 'ready');
  $('#data').focus();
  showToast('Cleared input and output');
});

$('#paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showToast('Clipboard is empty');
      return;
    }
    $('#data').value = normalizeInput(text);
    updateFieldStates();
    $('#data').focus();
    showToast('Pasted — press Decrypt or Ctrl+Enter');
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

$('#key').addEventListener('input', updateFieldStates);
$('#data').addEventListener('input', () => {
  activeHistoryId = null;
  updateFieldStates();
  renderHistory();
});

const dropZone = $('#drop-zone');
['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});
dropZone.addEventListener('drop', (e) => {
  const text = e.dataTransfer?.getData('text');
  if (text) {
    $('#data').value = normalizeInput(text);
    updateFieldStates();
    showToast('Dropped — press Decrypt or Ctrl+Enter');
  }
});

historyList.addEventListener('click', (e) => {
  const loadBtn = e.target.closest('.history-load');
  const removeBtn = e.target.closest('.history-remove');

  if (loadBtn) {
    loadFromHistory(loadBtn.dataset.id);
    return;
  }
  if (removeBtn) {
    const id = removeBtn.dataset.id;
    removeHistoryEntry(id);
    if (activeHistoryId === id) activeHistoryId = null;
    renderHistory();
    showToast('Removed from history');
  }
});

clearHistoryBtn.addEventListener('click', () => {
  clearHistory();
  activeHistoryId = null;
  renderHistory();
  showToast('History cleared');
});

historyToggle.addEventListener('click', () => {
  setHistoryOpen(!historyPanel.classList.contains('open'));
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runDecrypt();
    return;
  }

  if (
    e.key === 'Escape' &&
    document.activeElement !== $('#key') &&
    document.activeElement !== $('#data')
  ) {
    $('#clear-btn').click();
  }
});

renderHistory();
updateFieldStates();
setStatus('Ready — enter your secret key and encrypted data', 'ready');
$('#data').focus();

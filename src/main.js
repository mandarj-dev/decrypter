import { decryptAES } from './decrypt.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const outputEl = $('#output-code');
const preEl = $('#output');
const statusEl = $('.status-message');
const decryptBtn = $('#decrypt-btn');

// State
let isDecrypting = false;

function setOutput(text) { 
  outputEl.textContent = text || ''; 
  if (text) {
    preEl.classList.add('fade-in');
  }
}

function getOutput() { 
  return outputEl.textContent || ''; 
}

function showToast(msg, duration = 2800) {
  const el = document.getElementById('snackbar');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status-message ' + type;
  if (msg) {
    statusEl.classList.add('fade-in');
  }
}

function setLoading(loading) {
  isDecrypting = loading;
  decryptBtn.disabled = loading;
  if (loading) {
    decryptBtn.classList.add('loading');
    decryptBtn.innerHTML = '<span>Decrypting...</span>';
  } else {
    decryptBtn.classList.remove('loading');
    decryptBtn.innerHTML = '<span>Decrypt</span>';
  }
}

// Decrypt form submission
$('#decrypt-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (isDecrypting) return;
  
  const key = $('#key').value.trim();
  const data = $('#data').value.trim();
  
  if (!key || !data) {
    setStatus('Please provide both key and data', 'error');
    showToast('Missing required fields');
    return;
  }
  
  try {
    setLoading(true);
    setStatus('Decrypting...', 'info');
    
    // Small delay for better UX
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Decrypt using client-side JavaScript
    const decrypted = decryptAES(data, key);
    
    setOutput(decrypted);
    setStatus('Decryption successful', 'success');
    showToast('✓ Decrypted successfully');
    
    // Auto-format if it looks like JSON
    try {
      JSON.parse(decrypted);
      setTimeout(() => {
        showToast('Tip: Click Format to beautify JSON', 4000);
      }, 1000);
    } catch (_) {}
    
  } catch (error) {
    setOutput('');
    setStatus(error.message || 'Decryption failed', 'error');
    showToast('✗ Decryption failed');
  } finally {
    setLoading(false);
  }
});

// Copy button
$('#copy-btn').addEventListener('click', async () => {
  const text = getOutput();
  if (!text) {
    showToast('Nothing to copy');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(text);
    showToast('✓ Copied to clipboard');
    
    // Visual feedback
    const btn = $('#copy-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>Copied!</span>';
    btn.classList.add('success');
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('success');
    }, 2000);
  } catch (err) {
    showToast('Copy failed');
  }
});

// Toggle wrap button
let isWrapped = false;
$('#wrap-btn').addEventListener('click', () => {
  isWrapped = !isWrapped;
  preEl.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
  $('#wrap-btn').innerHTML = `<span>${isWrapped ? 'No Wrap' : 'Wrap'}</span>`;
  showToast(isWrapped ? 'Word wrap enabled' : 'Word wrap disabled', 1500);
});

// Format JSON button
$('#format-btn').addEventListener('click', () => {
  let raw = getOutput();
  if (!raw) {
    showToast('Nothing to format');
    return;
  }
  
  try {
    let obj = JSON.parse(raw);
    // If obj is a string that looks like JSON, try parsing again
    if (typeof obj === 'string') {
      try { 
        obj = JSON.parse(obj); 
      } catch(_) {}
    }
    setOutput(JSON.stringify(obj, null, 2));
    showToast('✓ JSON formatted');
  } catch (e) {
    showToast('Not valid JSON');
  }
});

// Minify JSON button
$('#minify-btn').addEventListener('click', () => {
  let raw = getOutput();
  if (!raw) {
    showToast('Nothing to minify');
    return;
  }
  
  try {
    let obj = JSON.parse(raw);
    if (typeof obj === 'string') { 
      try { 
        obj = JSON.parse(obj); 
      } catch(_) {} 
    }
    setOutput(JSON.stringify(obj));
    showToast('✓ JSON minified');
  } catch (e) { 
    showToast('Not valid JSON'); 
  }
});

// Download button
$('#download-btn').addEventListener('click', () => {
  const text = getOutput();
  if (!text) {
    showToast('Nothing to download');
    return;
  }
  
  let filename = 'decrypted.txt';
  let mimeType = 'text/plain';
  
  try { 
    JSON.parse(text); 
    filename = 'decrypted.json';
    mimeType = 'application/json';
  } catch(_) {}
  
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; 
  a.download = filename; 
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast(`✓ Downloaded ${filename}`);
});

// Clear button
$('#clear-btn').addEventListener('click', () => {
  $('#key').value = '';
  $('#data').value = '';
  setOutput('');
  setStatus('', '');
  $('#key').focus();
  showToast('Cleared', 1500);
});

// Paste button
$('#paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showToast('Clipboard is empty');
      return;
    }
    
    // Try to paste into data field, or key if data is already filled
    const dataField = $('#data');
    if (dataField.value.trim()) {
      dataField.value = text;
      dataField.focus();
    } else {
      dataField.value = text;
      dataField.focus();
    }
    
    showToast('✓ Pasted from clipboard');
  } catch (err) { 
    showToast('Clipboard access denied');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Enter to decrypt
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    $('#decrypt-form').dispatchEvent(new Event('submit'));
  }
  
  // Escape to clear
  if (e.key === 'Escape' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    $('#clear-btn').click();
  }
});

// Auto-focus and initialize
window.addEventListener('load', () => {
  $('#data').focus();
  setStatus('Enter your secret key and encrypted data to begin', 'info');
  
  // Add smooth entrance animation
  document.body.style.opacity = '0';
  setTimeout(() => {
    document.body.style.transition = 'opacity 0.3s ease-in';
    document.body.style.opacity = '1';
  }, 10);
});

// Input validation feedback
$('#key').addEventListener('input', () => {
  const key = $('#key').value.trim();
  if (key.length > 0) {
    $('#key').style.borderColor = 'var(--accent)';
  } else {
    $('#key').style.borderColor = '';
  }
});

$('#data').addEventListener('input', () => {
  const data = $('#data').value.trim();
  if (data.length > 0) {
    $('#data').style.borderColor = 'var(--accent)';
  } else {
    $('#data').style.borderColor = '';
  }
});

import './style.css';
import './logs-ui.css';
import './design-system.css';
import { decryptAES } from './decrypt.js';
import { extractEncryptedInput } from './inputParser.js';
import { highlightJson } from './jsonHighlight.js';
import {
  mountJsonViewer,
  setJsonText,
  getJsonText,
  expandAll,
  collapseAll,
  getActivePath,
  getValueAtActivePath,
  setTreeWrap,
} from './jsonViewer.js';
import {
  getHistory,
  addHistoryEntry,
  removeHistoryEntry,
  clearHistory,
  formatTime,
} from './history.js';
import { API_ROUTES } from './apiRoutes.js';
import { parseApiLogs, decryptLogEntry } from './logParser.js';
import { buildLogView, kindLabel } from './logView.js';
import { enrichLogEntry, getCachedView } from './logEnrich.js';
import { buildLogSummary, buildFilterOptions } from './logSummary.js';

// Remove stale service workers that cache old HTML/CSS/JS.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
}

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
const apiDrawer = $('#api-drawer');
const apiDrawerBackdrop = $('#api-drawer-backdrop');
const apiDrawerTab = $('#api-drawer-tab');
const apiDrawerClose = $('#api-drawer-close');
const apiRoutesTbody = $('#api-routes-tbody');
const decryptPanel = $('#mode-decrypt-panel');
const logsPanel = $('#mode-logs-panel');
const chromeLogsToolbar = $('#chrome-logs-toolbar');
const uploadedFilesEl = $('#uploaded-files');
const logDropzone = $('#log-dropzone');
const logFileInput = $('#log-file-input');
const logEntryList = $('#log-entry-list');
const logEntryCount = $('#log-entry-count');
const logStatusBar = $('#log-status-bar');
const logStatusText = $('#log-status-text');
const logParseBtn = $('#log-parse-btn');
const logClearBtn = $('#log-clear-btn');
const logFilter = $('#log-filter');
const logStatusFilter = $('#log-status-filter');
const logHostFilter = $('#log-host-filter');
const logClientFilter = $('#log-client-filter');
const logAdvancedFilters = $('#log-advanced-filters');
const logFiltersClear = $('#log-filters-clear');
const logInsights = $('#log-insights');
const logInsightsMeta = $('#log-insights-meta');
const logInsightsBody = $('#log-insights-body');
const logsAlert = $('#logs-alert');
const logsAlertTitle = $('#logs-alert-title');
const logsAlertText = $('#logs-alert-text');
const logsAlertActions = $('#logs-alert-actions');
const logsAlertDismiss = $('#logs-alert-dismiss');
const logsMain = $('#logs-main');
const logsEmptyState = $('#logs-empty-state');
const logsDetail = $('#logs-detail');
const mobileCloseBtn = $('#mobile-close-btn');
const logsClock = $('#logs-clock');
const logUploadBtn = $('#log-upload-btn');
const logViewerEmpty = $('#log-viewer-empty');
const logViewerBody = $('#log-viewer-body');
const logNavPos = $('#log-nav-pos');
const logPrevBtn = $('#log-prev-btn');
const logNextBtn = $('#log-next-btn');
const logSelectVisible = $('#log-select-visible');
const logSelectCount = $('#log-select-count');
const logExportSelectedBtn = $('#log-export-selected-btn');
const logExportSelectedDetailBtn = $('#log-export-selected-detail-btn');
const logClearSelectedBtn = $('#log-clear-selected-btn');

let busy = false;
let activeHistoryId = null;
let currentMode = 'decrypt';
/** @type {Map<string, File>} */
const uploadedFiles = new Map();
/** @type {Array<object>} */
let logEntries = [];
let activeLogId = null;
/** @type {'all' | 'success' | 'error' | 'other' | 'pay'} */
let outcomeFilter = 'all';
/** @type {'all' | 'return' | 'exchange' | 'pay' | 'status' | 'failed'} */
let kindFilter = 'all';
/** @type {string} */
let statusCodeFilter = 'all';
/** @type {string} */
let hostFilter = 'all';
/** @type {string} */
let clientFilter = 'all';
/** @type {Set<string>} */
const collapsedGroups = new Set();
/** @type {Set<string>} */
const selectedLogIds = new Set();
/** @type {object | null} */
let activeLogView = null;

function setOutput(text) {
  const value = text || '';
  if (outputEl) outputEl.textContent = value;
  if (preEl) preEl.classList.toggle('empty', !value);
  setJsonText(value);
}

function getOutput() {
  return getJsonText() || outputEl?.textContent || '';
}

function clearLogViewer() {
  activeLogView = null;
  if (logViewerEmpty) logViewerEmpty.hidden = false;
  if (logViewerBody) {
    logViewerBody.hidden = true;
    logViewerBody.innerHTML = '';
  }
  closeLogDetailModal();
  updateLogNav();
}

function getActiveLogEntry() {
  if (!activeLogId) return null;
  return logEntries.find((e) => e.id === activeLogId) ?? null;
}

function getLogOutputJson() {
  const entry = getActiveLogEntry();
  if (!entry) return '';
  return JSON.stringify(serializeLogEntry(entry), null, 2);
}

function getLogRawText() {
  const entry = getActiveLogEntry();
  return entry?.raw || '';
}

async function copyText(text, successMsg = 'Copied to clipboard') {
  if (!text) {
    showToast('Nothing to copy');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
    return true;
  } catch {
    showToast('Copy failed');
    return false;
  }
}

function resolveLogCopyText(kind) {
  const entry = getActiveLogEntry();
  const view = activeLogView || (entry ? getCachedView(entry) : null);
  if (!entry && !view) return '';

  switch (kind) {
    case 'payload':
      return JSON.stringify(view?.payload ?? null, null, 2);
    case 'response':
      return JSON.stringify(view?.response ?? null, null, 2);
    case 'request':
      return JSON.stringify(view?.request ?? entry?.request ?? null, null, 2);
    case 'raw':
      return entry?.raw || view?.raw || '';
    case 'formatted':
      return entry ? JSON.stringify(serializeLogEntry(entry), null, 2) : '';
    default:
      return '';
  }
}

function renderRawCopyBtn(kind, label = 'Copy') {
  return `<button type="button" class="btn btn-sm lv-copy-btn" data-copy="${escapeHtml(kind)}">${escapeHtml(label)}</button>`;
}

function serializeLogEntry(entry) {
  const view = getCachedView(entry);
  return {
    timestamp: entry.timestamp,
    method: entry.method,
    path: entry.path,
    url: entry.url,
    sessionId: entry.sessionId,
    userAgent: entry.userAgent,
    source: entry.source,
    outcome: entry.outcome,
    kind: entry.kind || view.kind,
    statusCode: entry.statusCode,
    statusMessage: entry.statusMessage || entry?.response?.message || '',
    orderId: entry.orderId || view.title,
    decryptedCount: entry.decryptedCount ?? 0,
    failedCount: entry.failedCount ?? 0,
    request: entry.request,
    response: entry.response,
  };
}

function updateSelectionUi() {
  const visible = filteredEntries();
  const selectedVisible = visible.filter((e) => selectedLogIds.has(e.id)).length;
  const count = selectedLogIds.size;

  if (logSelectCount) logSelectCount.textContent = `${count} selected`;
  if (logExportSelectedBtn) logExportSelectedBtn.disabled = count === 0;
  if (logExportSelectedDetailBtn) logExportSelectedDetailBtn.disabled = count === 0;
  if (logClearSelectedBtn) logClearSelectedBtn.disabled = count === 0;

  if (logSelectVisible) {
    logSelectVisible.checked = visible.length > 0 && selectedVisible === visible.length;
    logSelectVisible.indeterminate =
      selectedVisible > 0 && selectedVisible < visible.length;
  }
}

function toggleLogSelection(id, selected) {
  if (selected) selectedLogIds.add(id);
  else selectedLogIds.delete(id);
  updateSelectionUi();
}

function exportSelectedLogs() {
  const selected = logEntries.filter((e) => selectedLogIds.has(e.id));
  if (!selected.length) {
    showToast('No logs selected');
    return;
  }

  selected.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const payload = {
    exportedAt: new Date().toISOString(),
    count: selected.length,
    summary: {
      success: selected.filter((e) => e.outcome === 'success').length,
      error: selected.filter((e) => e.outcome === 'error').length,
      other: selected.filter((e) => e.outcome !== 'success' && e.outcome !== 'error').length,
      statusCodes: selected.reduce((acc, e) => {
        const key = e.statusCode == null ? 'none' : String(e.statusCode);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    },
    entries: selected.map(serializeLogEntry),
  };

  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `selected-logs-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${selected.length} log${selected.length === 1 ? '' : 's'}`);
}

function updateLogNav() {
  const items = filteredEntries();
  const idx = items.findIndex((e) => e.id === activeLogId);
  if (logNavPos) {
    logNavPos.textContent = items.length ? `${Math.max(idx, 0) + (idx >= 0 ? 1 : 0)} / ${items.length}` : '0 / 0';
  }
  if (logPrevBtn) logPrevBtn.disabled = idx <= 0;
  if (logNextBtn) logNextBtn.disabled = idx < 0 || idx >= items.length - 1;
}

function navigateLog(delta) {
  const items = filteredEntries();
  if (!items.length) return;
  let idx = items.findIndex((e) => e.id === activeLogId);
  if (idx < 0) idx = delta > 0 ? -1 : 0;
  const next = items[idx + delta];
  if (next) selectLogEntry(next.id, { rebuildList: collapsedGroups.has(next.source) });
}

function prettyJsonHtml(value) {
  const text = JSON.stringify(value ?? null, null, 2);
  try {
    return highlightJson(text);
  } catch {
    return escapeHtml(text);
  }
}

function renderAccordion(title, bodyHtml, { open = false, id = '' } = {}) {
  return `
    <details class="lv-accordion"${open ? ' open' : ''} ${id ? `data-acc="${id}"` : ''}>
      <summary>
        <span>${escapeHtml(title)}</span>
        <span class="lv-acc-chevron" aria-hidden="true">›</span>
      </summary>
      <div class="lv-acc-body">${bodyHtml}</div>
    </details>`;
}

function renderKvRow(label, value, cls = '') {
  return `<div class="kv-row"><span class="kl">${escapeHtml(label)}</span><span class="kv ${cls}">${escapeHtml(String(value ?? '—'))}</span></div>`;
}

function renderTimeline(steps) {
  return `
    <div class="lv-timeline" role="list">
      ${steps
        .map(
          (step, i) => `
        <div class="lv-step${step.done ? ' done' : ''}${step.failed ? ' failed' : ''}" role="listitem">
          ${i > 0 ? `<span class="lv-step-line${steps[i - 1]?.done ? ' done' : ''}${steps[i - 1]?.failed ? ' failed' : ''}" aria-hidden="true"></span>` : ''}
          <span class="lv-step-dot" aria-hidden="true">${step.failed ? '!' : step.done ? '✓' : ''}</span>
          <span class="lv-step-label">${escapeHtml(step.label)}</span>
        </div>`
        )
        .join('')}
    </div>`;
}

function renderProducts(products) {
  if (!products?.length) return '<p class="lv-muted">No product details in this request</p>';
  return products
    .map(
      (p) => `
    <div class="lv-product">
      <div class="lv-product-thumb">${
        p.image
          ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" />`
          : '<span class="lv-thumb-fallback">SKU</span>'
      }</div>
      <div class="lv-product-info">
        <div class="lv-product-name">${escapeHtml(p.name)}</div>
        <div class="lv-product-meta">
          ${p.sku ? `<span>SKU ${escapeHtml(p.sku)}</span>` : ''}
          <span>Qty ${escapeHtml(String(p.qty))}</span>
          ${p.price ? `<span>${escapeHtml(p.price)}</span>` : ''}
        </div>
        ${p.reason ? `<span class="lv-tag">${escapeHtml(p.reason)}</span>` : ''}
        ${p.note ? `<div class="lv-muted">${escapeHtml(p.note)}</div>` : ''}
      </div>
    </div>`
    )
    .join('');
}

function renderRefund(refund) {
  if (!refund) return '<p class="lv-muted">No refund summary</p>';
  const rows = [
    ['Original amount', refund.original],
    ['Discount', refund.discount],
    ['Tax', refund.tax],
    ['Reverse fees', refund.reverseFees],
  ].filter(([, v]) => v != null);

  return `
    <div class="lv-refund">
      ${rows
        .map(
          ([label, value]) => `
        <div class="lv-refund-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>`
        )
        .join('')}
      ${
        refund.total
          ? `<div class="lv-refund-row total">
          <span>Return total</span>
          <strong>${escapeHtml(refund.total)}</strong>
        </div>`
          : ''
      }
      ${
        refund.mode
          ? `<div class="lv-refund-mode">Refund mode: <strong>${escapeHtml(refund.mode)}</strong>${
              refund.upi ? ` · ${escapeHtml(refund.upi)}` : ''
            }${refund.bankName ? ` · ${escapeHtml(refund.bankName)}` : ''}</div>`
          : ''
      }
    </div>`;
}

function renderAddress(address) {
  if (!address) return '<p class="lv-muted">No pickup address</p>';
  return `
    <div class="lv-address">
      ${address.name ? `<div class="lv-address-name">${escapeHtml(address.name)}</div>` : ''}
      ${address.lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
      <div class="lv-address-contact">
        ${address.phone ? `<span>${escapeHtml(address.phone)}</span>` : ''}
        ${address.email ? `<span>${escapeHtml(address.email)}</span>` : ''}
      </div>
    </div>`;
}

function renderLogViewer(entry) {
  const view = getCachedView(entry);
  activeLogView = view;
  const rawText = entry.raw || view.raw || '';

  const ok = view.outcome === 'success';
  const outcomeLabel = ok ? 'Success' : view.outcome === 'error' ? 'Failed' : 'Other';
  const kind = kindLabel(view.kind);
  const statusPillClass = ok ? 'ok' : 'err';
  const typeClass =
    view.kind === 'pay' ? 'payment' : view.kind === 'status' ? 'payment-status' : view.kind;
  const isPaymentKind = view.kind === 'pay' || view.kind === 'status';
  const hostLabel = entry.host || '';

  const metaBits = [
    view.timestamp
      ? `<span class="lv-meta-chip"><span class="lv-meta-k">Time</span><span class="lv-meta-v">${escapeHtml(view.timestamp)}</span></span>`
      : '',
    view.endpoint
      ? `<span class="lv-meta-chip"><span class="lv-meta-k">Endpoint</span><span class="lv-meta-v"><code>${escapeHtml(view.endpoint)}</code></span></span>`
      : '',
    view.pickupDate && view.pickupDate !== '—'
      ? `<span class="lv-meta-chip"><span class="lv-meta-k">Pickup</span><span class="lv-meta-v">${escapeHtml(view.pickupDate)}</span></span>`
      : '',
    hostLabel
      ? `<span class="lv-meta-chip"><span class="lv-meta-k">Host</span><span class="lv-meta-v">${escapeHtml(hostLabel)}</span></span>`
      : '',
    view.storeUrl
      ? `<span class="lv-meta-chip"><span class="lv-meta-k">Store</span><span class="lv-meta-v"><a href="${escapeHtml(view.storeUrl)}" target="_blank" rel="noopener">Open store</a></span></span>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const header = `
    <header class="lv-header detail-header lv-hero">
      <div class="lv-title-row detail-header-top">
        <div class="lv-hero-text">
          <h2 class="lv-title detail-order">${escapeHtml(view.title)}</h2>
          ${
            view.statusMessage
              ? `<p class="lv-status-msg">${escapeHtml(view.statusMessage)}</p>`
              : ''
          }
        </div>
        <div class="lv-badges">
          <span class="lv-badge status-pill ${statusPillClass}">${ok ? '✓ ' : '✗ '}${escapeHtml(outcomeLabel)}</span>
          ${
            view.statusCode != null
              ? `<span class="lv-badge lv-badge-code">${escapeHtml(String(view.statusCode))}</span>`
              : ''
          }
          <span class="lv-badge type-pill ${escapeHtml(typeClass)}">${escapeHtml(kind)}</span>
          ${view.encrypted ? '<span class="lv-badge lv-badge-enc">encrypted</span>' : ''}
        </div>
      </div>
      ${metaBits ? `<div class="lv-meta-bar">${metaBits}</div>` : ''}
    </header>`;

  const payment = view.payment;
  const paymentSection =
    payment && view.kind === 'pay'
      ? renderAccordion(
          'Payment Details',
          `<div class="kv-grid">
            ${renderKvRow('Client', payment.clientName)}
            ${renderKvRow('Email', payment.email)}
            ${renderKvRow('Phone', payment.phone)}
            ${renderKvRow('Amount', payment.amount != null ? `₹${payment.amount}` : '—', 'purple')}
            ${renderKvRow('Gateway', payment.gateway)}
            ${renderKvRow('Gateway Order ID', payment.gatewayOrderId, 'purple')}
            ${renderKvRow('Username / Key', payment.gatewayUsername)}
            ${renderKvRow('Status', payment.status)}
            ${renderKvRow('Created At', payment.createdAt)}
          </div>`,
          { open: true, id: 'payment' }
        )
      : '';

  const statusSection =
    payment && view.kind === 'status'
      ? [
          renderAccordion(
            'Transaction Details',
            `<div class="kv-grid">
              ${renderKvRow('Payment ID', payment.transactionId, 'teal')}
              ${renderKvRow('Order ID', payment.orderId)}
              ${renderKvRow('Payment Source', payment.paymentSource)}
              ${renderKvRow('Captured Via', payment.capturedSource)}
              ${renderKvRow('Captured At', payment.capturedAt)}
              ${renderKvRow('Updated At', payment.updatedAt)}
              ${renderKvRow('Status', payment.payStatus, payment.payStatus === 'success' ? 'green' : '')}
            </div>`,
            { open: true, id: 'txn' }
          ),
          renderAccordion(
            'Signature Verification',
            `<div class="sig-match ${payment.sigMatch ? 'ok' : 'fail'}">${
              payment.sigMatch
                ? '✓ Signatures match — payment authentic'
                : '✗ Signature mismatch — verify payment'
            }</div>
            <div class="kv-grid">
              ${renderKvRow('Gateway Signature', payment.signature || '—')}
              ${renderKvRow('Generated Signature', payment.generatedSignature || '—')}
            </div>`,
            { open: !payment.sigMatch, id: 'sig' }
          ),
        ].join('')
      : '';

  const responseSummary = `
    <div class="lv-response-summary outcome-${view.outcome}">
      <pre class="lv-pre lv-pre-compact raw-box"><code>${prettyJsonHtml(view.response)}</code></pre>
    </div>`;

  const responseBlock = isPaymentKind
    ? ''
    : renderAccordion('Response JSON', responseSummary, { open: !ok, id: 'response' });

  const timelinePanel = isPaymentKind
    ? ''
    : `<section class="lv-panel lv-timeline-panel">
        <div class="lv-panel-label">Request timeline</div>
        ${renderTimeline(view.timeline)}
      </section>`;

  const productNotes = view.products
    .map((p) => p.note)
    .filter(Boolean)
    .join('; ');
  const notesDuplicate =
    view.notes &&
    productNotes &&
    view.notes.trim().toLowerCase() === productNotes.trim().toLowerCase();

  const orderCol = [
    view.products.length
      ? renderAccordion('Product Details', renderProducts(view.products), { open: true, id: 'products' })
      : '',
    view.notes && !notesDuplicate
      ? renderAccordion('Customer Notes', `<div class="lv-notes notes-box">${escapeHtml(view.notes)}</div>`, {
          open: true,
          id: 'notes',
        })
      : '',
    view.refund
      ? renderAccordion('Refund Summary', renderRefund(view.refund), { open: true, id: 'refund' })
      : '',
    view.address
      ? renderAccordion('Pickup Address', renderAddress(view.address), { open: false, id: 'address' })
      : '',
  ]
    .filter(Boolean)
    .join('');

  const techCol = [paymentSection, statusSection, responseBlock].filter(Boolean).join('');

  const rawBlock = renderAccordion(
    'Raw Payload',
    `<div class="lv-raw">
        <div class="lv-raw-toolbar">
          ${renderRawCopyBtn('raw', 'Copy raw log')}
          ${renderRawCopyBtn('formatted', 'Copy formatted')}
        </div>
        <div class="lv-raw-block">
          <div class="lv-raw-head">
            <div class="lv-raw-label">Request body</div>
            ${renderRawCopyBtn('payload')}
          </div>
          <pre class="lv-pre raw-box"><code>${prettyJsonHtml(view.payload)}</code></pre>
        </div>
        <div class="lv-raw-block">
          <div class="lv-raw-head">
            <div class="lv-raw-label">Full request</div>
            ${renderRawCopyBtn('request')}
          </div>
          <pre class="lv-pre raw-box"><code>${prettyJsonHtml(view.request)}</code></pre>
        </div>
        <div class="lv-raw-block">
          <div class="lv-raw-head">
            <div class="lv-raw-label">Response</div>
            ${renderRawCopyBtn('response')}
          </div>
          <pre class="lv-pre raw-box"><code>${prettyJsonHtml(view.response)}</code></pre>
        </div>
        <div class="lv-raw-block">
          <div class="lv-raw-head">
            <div class="lv-raw-label">Original log block</div>
            ${renderRawCopyBtn('raw')}
          </div>
          <pre class="lv-pre lv-pre-raw raw-box"><code>${escapeHtml(rawText)}</code></pre>
        </div>
      </div>`,
    { open: false, id: 'raw' }
  );

  const hasOrder = Boolean(orderCol);
  const hasTech = Boolean(techCol);

  if (logViewerEmpty) logViewerEmpty.hidden = true;
  if (logViewerBody) {
    logViewerBody.hidden = false;
    logViewerBody.innerHTML = `<div class="detail">
      ${header}
      ${timelinePanel}
      ${
        hasOrder || hasTech
          ? `<div class="lv-columns${hasOrder && hasTech ? '' : ' lv-columns-single'}">
        ${hasOrder ? `<div class="lv-col lv-col-order">${orderCol}</div>` : ''}
        ${hasTech ? `<div class="lv-col lv-col-tech">${techCol}</div>` : ''}
      </div>`
          : ''
      }
      ${rawBlock}
    </div>`;
  }
  const logViewer = $('#log-viewer');
  if (logViewer) logViewer.scrollTop = 0;
  updateLogNav();
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

function setLogStatus(msg, type = 'ready') {
  if (logStatusText) logStatusText.textContent = msg;
  if (logStatusBar) logStatusBar.className = 'status-bar' + (type ? ` ${type}` : '');
}

/**
 * Persistent alert banner for log reader errors / warnings / guidance.
 * @param {{ title: string, text?: string, type?: 'info'|'success'|'warning'|'error', actions?: Array<{id:string,label:string,primary?:boolean}> }} opts
 */
function setLogsAlert({ title, text = '', type = 'info', actions = [] } = {}) {
  if (!logsAlert) return;
  logsAlert.hidden = false;
  logsAlert.className = `lr-alert is-${type}`;
  if (logsAlertTitle) logsAlertTitle.textContent = title || '';
  if (logsAlertText) {
    logsAlertText.textContent = text || '';
    logsAlertText.hidden = !text;
  }
  if (logsAlertActions) {
    logsAlertActions.innerHTML = actions
      .map(
        (a) =>
          `<button type="button" class="btn btn-sm${a.primary ? ' btn-primary' : ''}" data-alert-action="${escapeAttr(
            a.id
          )}">${escapeHtml(a.label)}</button>`
      )
      .join('');
  }
}

function clearLogsAlert() {
  if (!logsAlert) return;
  logsAlert.hidden = true;
  if (logsAlertActions) logsAlertActions.innerHTML = '';
}

function setBusy(loading) {
  busy = loading;
  decryptBtn.disabled = loading;
  decryptBtn.classList.toggle('loading', loading);
  decryptBtn.classList.toggle('btn-loading', loading);
  if (!loading) decryptBtn.textContent = 'Decrypt';
  if (loading) setStatus('Decrypting response…', 'info');
}

function flashCopySuccess(btn) {
  if (!btn) return;
  const original = btn.textContent;
  btn.classList.add('copy-success');
  btn.textContent = '✓ Copied';
  clearTimeout(flashCopySuccess._t);
  flashCopySuccess._t = setTimeout(() => {
    btn.classList.remove('copy-success');
    btn.textContent = original;
  }, 1400);
}

function syncLogsWorkspaceState() {
  const hasParsed = logEntries.length > 0;
  logsMain?.classList.toggle('has-content', hasParsed);
  if (logsEmptyState) {
    logsEmptyState.hidden = hasParsed;
    logsEmptyState.classList.toggle('show-files', uploadedFiles.size > 0 && !hasParsed);
  }
  renderUploadedFileCards();
}

function renderUploadedFileCards() {
  if (!uploadedFilesEl) return;
  const files = [...uploadedFiles.values()];
  if (!files.length) {
    uploadedFilesEl.hidden = true;
    uploadedFilesEl.innerHTML = '';
    return;
  }

  uploadedFilesEl.hidden = false;
  uploadedFilesEl.innerHTML =
    files
      .map(
        (file) => `
    <div class="file-card">
      <span class="file-card-check" aria-hidden="true">✓</span>
      <span class="file-card-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="file-card-size">${escapeHtml(formatBytes(file.size))}</span>
      <button type="button" class="file-card-remove" data-remove-file="${escapeHtml(file.name)}" aria-label="Remove ${escapeHtml(file.name)}">×</button>
    </div>`
      )
      .join('') +
    `<div class="uploaded-files-actions">
      <button type="button" class="btn btn-primary" id="parse-from-files-btn"${logParseBtn?.disabled ? ' disabled' : ''}>Parse Logs</button>
    </div>`;
}

function setMode(mode) {
  currentMode = mode === 'logs' ? 'logs' : 'decrypt';
  const isLogs = currentMode === 'logs';

  document.body.classList.toggle('mode-logs', isLogs);
  document.body.classList.toggle('mode-decrypt', !isLogs);

  decryptPanel.hidden = isLogs;
  logsPanel.hidden = !isLogs;

  // Shared secret key between workflows
  syncSharedSecretKey(isLogs ? 'to-logs' : 'to-decrypt');

  document.querySelectorAll('.mode-option').forEach((btn) => {
    const active = btn.dataset.mode === currentMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  document.title = isLogs ? 'Log Reader — Decryption & Log Reader' : 'Decryption & Log Reader';

  if (isLogs) {
    syncLogsWorkspaceState();
    setLogStatus(
      uploadedFiles.size || logEntries.length
        ? logStatusText.textContent
        : 'Ready — upload log files and enter your secret key',
      'ready'
    );
  } else {
    $('#data')?.focus();
  }
}

function syncSharedSecretKey(direction) {
  const decryptKey = $('#key');
  const logKey = $('#log-key');
  if (!decryptKey || !logKey) return;
  if (direction === 'to-logs') logKey.value = decryptKey.value;
  else decryptKey.value = logKey.value;
}

function bindSharedSecretKey() {
  const decryptKey = $('#key');
  const logKey = $('#log-key');
  if (!decryptKey || !logKey) return;
  decryptKey.addEventListener('input', () => {
    logKey.value = decryptKey.value;
  });
  logKey.addEventListener('input', () => {
    decryptKey.value = logKey.value;
    updateFieldStates();
  });
}

function applyInputCleanup({ notify = false } = {}) {
  const field = $('#data');
  const { value, cleaned } = extractEncryptedInput(field.value);
  if (cleaned && value) {
    field.value = value;
    if (notify) showToast('Extracted encrypted data from JSON wrapper');
  }
  updateFieldStates();
  return value;
}

function setPastedInput(raw, source = 'Pasted') {
  const { value, cleaned } = extractEncryptedInput(raw);
  $('#data').value = value;
  updateFieldStates();
  if (cleaned) {
    showToast('Extracted encrypted data from JSON wrapper');
  } else {
    showToast(`${source} — press Decrypt or Ctrl+Enter`);
  }
  $('#data').focus();
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

async function pasteAndDecrypt() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      showToast('Clipboard is empty');
      return;
    }
    setPastedInput(text);
    runDecrypt();
  } catch {
    showToast('Clipboard access denied');
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

function methodBadgeClass(method) {
  const m = (method || '').toUpperCase();
  if (m === 'GET') return 'method-get';
  if (m === 'POST') return 'method-post';
  return 'method-other';
}

function renderApiRoutes(highlightMasked = '') {
  apiRoutesTbody.innerHTML = API_ROUTES.map((route, index) => {
    const highlighted = highlightMasked && route.masked.includes(highlightMasked);
    return `
      <tr class="${highlighted ? 'highlight' : ''}" data-masked="${escapeHtml(route.masked)}">
        <td>${index + 1}</td>
        <td><code class="api-route-masked">${escapeHtml(route.masked)}</code></td>
        <td><span class="method-badge ${methodBadgeClass(route.method)}">${route.method}</span></td>
        <td><code class="api-route-original">${escapeHtml(route.original)}</code></td>
      </tr>`;
  }).join('');
}

function setApiDrawerOpen(open, { highlight = '' } = {}) {
  apiDrawer.classList.toggle('open', open);
  apiDrawerBackdrop.hidden = !open;
  apiDrawerBackdrop.classList.toggle('show', open);
  apiDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  apiDrawerTab?.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.style.overflow = open ? 'hidden' : '';

  if (open) {
    renderApiRoutes(highlight);
    if (highlight) {
      requestAnimationFrame(() => {
        const row = apiRoutesTbody.querySelector('.highlight');
        row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
    apiDrawerClose.focus();
  }
}

function parseApiDrawerHash() {
  const hash = location.hash.slice(1);
  if (!hash) return { open: false };

  if (hash === 'api-routes') return { open: true };
  if (hash.startsWith('api-routes/')) {
    return { open: true, highlight: decodeURIComponent(hash.slice('api-routes/'.length)) };
  }

  if (hash.includes('calculate-refund') || hash.startsWith('api/')) {
    return { open: true, highlight: decodeURIComponent(hash.replace(/^api\//, '')) };
  }

  return { open: false };
}

function syncApiDrawerFromHash() {
  const { open, highlight = '' } = parseApiDrawerHash();
  setApiDrawerOpen(open, { highlight });
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
  const data = applyInputCleanup({ notify: true });

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

    const kb = (new Blob([getOutput()]).size / 1024).toFixed(1);
    setStatus(`Decryption successful · ${kb} KB`, 'success');
    showToast('Decrypted successfully');
    $('#jv-tree')?.focus();
  } catch (error) {
    setOutput('');
    activeHistoryId = null;
    const msg = error.message || 'Decryption failed';
    const friendly =
      msg.includes('invalid key') || msg.includes('corrupted')
        ? 'Decryption failed — invalid key or encrypted payload'
        : msg;
    setStatus(friendly, 'error');
    showToast('Decryption failed');
  } finally {
    setBusy(false);
    renderHistory();
  }
}

/* ── Log reader ── */

function updateLogFileUi() {
  const files = [...uploadedFiles.values()];
  logParseBtn.disabled = files.length === 0;
  logClearBtn.disabled = files.length === 0 && logEntries.length === 0;
  syncLogsWorkspaceState();
  if (logEntries.length) renderLogEntries();
  else if (logEntryList) {
    logEntryList.innerHTML = '<div class="log-empty">Upload and parse log files to begin</div>';
    updateSelectionUi();
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function removeUploadedFile(name) {
  uploadedFiles.delete(name);
  const removedIds = logEntries.filter((e) => e.source === name).map((e) => e.id);
  logEntries = logEntries.filter((e) => e.source !== name);
  removedIds.forEach((id) => selectedLogIds.delete(id));
  collapsedGroups.delete(name);
  if (activeLogId && !logEntries.some((e) => e.id === activeLogId)) {
    activeLogId = filteredEntries()[0]?.id ?? null;
    if (activeLogId) selectLogEntry(activeLogId);
    else {
      clearLogViewer();
    }
  }
  updateLogFileUi();
  showToast(`Removed ${name}`);
}

function addLogFiles(fileList) {
  const accepted = [...fileList].filter(
    (f) =>
      f.type === 'text/plain' ||
      /\.(txt|log)$/i.test(f.name) ||
      !f.type
  );
  if (accepted.length === 0) {
    setLogsAlert({
      title: 'Unsupported file type',
      text: 'Only .txt and .log files are accepted.',
      type: 'error',
    });
    showToast('Please drop .txt or .log files');
    return;
  }

  for (const file of accepted) {
    uploadedFiles.set(file.name, file);
    collapsedGroups.delete(file.name);
  }
  updateLogFileUi();
  showToast(`Added ${accepted.length} file${accepted.length === 1 ? '' : 's'}`);
  setLogStatus(`${uploadedFiles.size} file(s) ready — click Parse Logs`, 'info');
  setLogsAlert({
    title: `${uploadedFiles.size} file${uploadedFiles.size === 1 ? '' : 's'} ready`,
    text: 'Add a secret key if needed, then parse to decrypt and inspect entries.',
    type: 'info',
    actions: [{ id: 'parse', label: 'Parse now', primary: true }],
  });
}

function entryMatchesFilter(entry, q) {
  if (!q) return true;
  const hay = [
    entry.method,
    entry.path,
    entry.url,
    entry.timestamp,
    entry.source,
    entry.outcome,
    entry.kind,
    entry.statusCode,
    entry.statusMessage,
    entry.orderId,
    entry.productPreview,
    entry.responsePreview,
    entry.host,
    entry.clientName,
    entry.issueLabel,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function entryMatchesKind(entry) {
  if (kindFilter === 'all') return true;
  if (kindFilter === 'failed') return entry.outcome === 'error' || entry.kind === 'failed';
  return entry.kind === kindFilter;
}

function entryMatchesFacets(entry) {
  if (statusCodeFilter !== 'all') {
    const key = entry.statusCode == null ? 'none' : String(entry.statusCode);
    if (key !== statusCodeFilter) return false;
  }
  if (hostFilter !== 'all' && (entry.host || 'unknown') !== hostFilter) return false;
  if (clientFilter !== 'all') {
    const client = entry.clientName || entry.host || 'Unknown';
    if (client !== clientFilter) return false;
  }
  return true;
}

/** Entries after outcome/kind/search — used for insights + facet options. */
function facetBaseEntries() {
  const q = (logFilter.value || '').trim().toLowerCase();
  return logEntries.filter((e) => {
    if (outcomeFilter === 'pay') {
      if (e.kind !== 'pay' && e.kind !== 'status') return false;
    } else if (outcomeFilter !== 'all' && e.outcome !== outcomeFilter) {
      return false;
    }
    if (!entryMatchesKind(e)) return false;
    return entryMatchesFilter(e, q);
  });
}

function filteredEntries() {
  return facetBaseEntries().filter(entryMatchesFacets);
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function fillSelectOptions(select, values, { allLabel, formatLabel } = {}) {
  if (!select) return;
  const current = select.value || 'all';
  const opts = [`<option value="all">${escapeHtml(allLabel || 'All')}</option>`];
  for (const value of values) {
    const label = formatLabel ? formatLabel(value) : value === 'none' ? 'No status' : value;
    opts.push(`<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`);
  }
  select.innerHTML = opts.join('');
  select.value = values.includes(current) || current === 'all' ? current : 'all';
  if (select.value !== current && current !== 'all') {
    // keep selection if still valid after rebuild
  }
}

function renderInsightChips(items, { facet, errorTone = false } = {}) {
  if (!items.length) return '<p class="log-insight-empty">None</p>';
  return `<div class="log-insight-chips">${items
    .map(({ label, count }) => {
      const value = label === '—' ? 'none' : label;
      const active =
        (facet === 'status' && statusCodeFilter === value) ||
        (facet === 'host' && hostFilter === label) ||
        (facet === 'client' && clientFilter === label);
      return `<button type="button" class="log-insight-chip${active ? ' active' : ''}${
        errorTone ? ' is-error' : ''
      }" data-facet="${escapeAttr(facet)}" data-value="${escapeAttr(
        facet === 'status' ? value : label
      )}" title="${escapeAttr(label)}">
        <span class="chip-label">${escapeHtml(label === 'none' ? 'No status' : label)}</span>
        <span class="chip-count">${count}</span>
      </button>`;
    })
    .join('')}</div>`;
}

function renderLogInsights() {
  const hasLogs = logEntries.length > 0;
  if (!hasLogs) {
    if (logInsightsBody) logInsightsBody.innerHTML = '';
    if (logInsightsMeta) logInsightsMeta.textContent = '';
    return;
  }

  const base = facetBaseEntries();
  const summary = buildLogSummary(base);
  const options = buildFilterOptions(base);

  fillSelectOptions(logStatusFilter, options.statuses, {
    allLabel: 'Status',
    formatLabel: (v) => (v === 'none' ? 'No status' : v),
  });
  fillSelectOptions(logHostFilter, options.hosts, { allLabel: 'Host' });
  fillSelectOptions(logClientFilter, options.clients, { allLabel: 'Client' });

  // Re-apply current facet filters if still present in options
  if (logStatusFilter && statusCodeFilter !== 'all') {
    if ([...logStatusFilter.options].some((o) => o.value === statusCodeFilter)) {
      logStatusFilter.value = statusCodeFilter;
    } else {
      statusCodeFilter = 'all';
      logStatusFilter.value = 'all';
    }
  }
  if (logHostFilter && hostFilter !== 'all') {
    if ([...logHostFilter.options].some((o) => o.value === hostFilter)) {
      logHostFilter.value = hostFilter;
    } else {
      hostFilter = 'all';
      logHostFilter.value = 'all';
    }
  }
  if (logClientFilter && clientFilter !== 'all') {
    if ([...logClientFilter.options].some((o) => o.value === clientFilter)) {
      logClientFilter.value = clientFilter;
    } else {
      clientFilter = 'all';
      logClientFilter.value = 'all';
    }
  }

  if (logInsightsMeta) {
    logInsightsMeta.textContent = summary.error
      ? `${summary.error} failed · ${summary.uniqueIssueClients} clients`
      : `${summary.total} shown · ${summary.uniqueClients} clients`;
  }

  if (!logInsightsBody) return;

  const blocks = [
    {
      label: 'Status codes',
      html: renderInsightChips(summary.statusCodes, { facet: 'status' }),
    },
    {
      label: summary.error ? `Clients with issues (${summary.uniqueIssueClients})` : 'Top clients',
      html: renderInsightChips(summary.error ? summary.issueClients : summary.clients, {
        facet: 'client',
        errorTone: Boolean(summary.error),
      }),
    },
    {
      label: 'Hosts',
      html: renderInsightChips(summary.hosts, { facet: 'host' }),
    },
  ];

  if (summary.topMessages.length) {
    blocks.push({
      label: 'Top error messages',
      html: renderInsightChips(summary.topMessages, { facet: 'message', errorTone: true }),
    });
  }
  if (summary.errorEndpoints.length) {
    blocks.push({
      label: 'Failing endpoints',
      html: renderInsightChips(summary.errorEndpoints, { facet: 'endpoint' }),
    });
  }

  logInsightsBody.innerHTML = blocks
    .map(
      (b) => `<div class="log-insight-block">
      <div class="log-insight-label">${escapeHtml(b.label)}</div>
      ${b.html}
    </div>`
    )
    .join('');
}

function updateOutcomeCounts() {
  const q = (logFilter.value || '').trim().toLowerCase();
  // Outcome chip totals stay stable across kind filters — only text search applies.
  const forOutcome = logEntries.filter((e) => entryMatchesFilter(e, q));
  const counts = { all: forOutcome.length, success: 0, error: 0, other: 0, pay: 0 };
  for (const e of forOutcome) {
    if (e.outcome === 'success') counts.success++;
    else if (e.outcome === 'error') counts.error++;
    else counts.other++;
    if (e.kind === 'pay' || e.kind === 'status') counts.pay++;
  }

  const allEl = $('#count-all');
  const successEl = $('#count-success');
  const errorEl = $('#count-error');
  const otherEl = $('#count-other');
  const payEl = $('#count-pay');
  if (allEl) allEl.textContent = String(counts.all);
  if (successEl) successEl.textContent = String(counts.success);
  if (errorEl) errorEl.textContent = String(counts.error);
  if (otherEl) otherEl.textContent = String(counts.other);
  if (payEl) payEl.textContent = String(counts.pay);

  document.querySelectorAll('.sstat[data-outcome], .log-outcome-chip[data-outcome]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.outcome === outcomeFilter);
  });
  document.querySelectorAll('.log-kind-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.kind === kindFilter);
  });
}

function openLogDetailModal() {
  logsDetail?.classList.add('modal-open');
  mobileCloseBtn?.classList.add('modal-open');
}

function closeLogDetailModal() {
  logsDetail?.classList.remove('modal-open');
  mobileCloseBtn?.classList.remove('modal-open');
}

function selectLogEntry(id, { rebuildList = false } = {}) {
  const entry = logEntries.find((e) => e.id === id);
  activeLogId = entry ? id : null;

  if (entry?.source && collapsedGroups.has(entry.source)) {
    collapsedGroups.delete(entry.source);
    rebuildList = true;
  }

  if (rebuildList) {
    renderLogEntries();
  } else {
    markActiveEntryInDom(id);
    updateLogNav();
  }

  if (!entry) {
    clearLogViewer();
    closeLogDetailModal();
    return;
  }

  renderLogViewer(entry);
  openLogDetailModal();
  setLogStatus(
    `${entry.method} ${entry.path} — ${entry.outcome}` +
      (entry.statusMessage ? `: ${entry.statusMessage}` : '') +
      (entry.decryptedCount
        ? ` · decrypted ${entry.decryptedCount}`
        : entry.encryptedCount
          ? ` · ${entry.encryptedCount} encrypted`
          : ''),
    entry.outcome === 'error' || entry.failedCount ? 'error' : 'success'
  );

  requestAnimationFrame(() => {
    scrollActiveLogIntoList(id);
  });
}

/** Scroll list item into view without scrolling page ancestors. */
function scrollActiveLogIntoList(id) {
  const scroller = logEntryList;
  if (!scroller) return;
  const item = scroller.querySelector(`.log-entry-btn[data-id="${CSS.escape(id)}"]`)?.closest('.log-entry-item');
  if (!item) return;

  const itemRect = item.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const pad = 8;

  if (itemRect.top < scrollerRect.top + pad) {
    scroller.scrollTop -= scrollerRect.top + pad - itemRect.top;
  } else if (itemRect.bottom > scrollerRect.bottom - pad) {
    scroller.scrollTop += itemRect.bottom - (scrollerRect.bottom - pad);
  }
}

function markActiveEntryInDom(id) {
  logEntryList.querySelectorAll('.log-entry-item.active').forEach((el) => {
    el.classList.remove('active');
  });
  if (!id) return;
  const btn = logEntryList.querySelector(`.log-entry-btn[data-id="${CSS.escape(id)}"]`);
  btn?.closest('.log-entry-item')?.classList.add('active');
}

function renderLogEntryItem(entry) {
  const outcome = entry.outcome || 'other';
  const kind = entry.kind || 'other';
  const checked = selectedLogIds.has(entry.id);
  const statusClass = outcome === 'success' ? 'ok' : outcome === 'error' ? 'err' : 'other';
  const timeLabel = formatLogListTime(entry.timestamp) || entry.timeShort || '';
  const desc = entry.productPreview || entry.responsePreview || entry.path || '';

  return `
    <li class="log-entry-item outcome-${outcome}${entry.id === activeLogId ? ' active' : ''}${checked ? ' selected' : ''}" data-entry-id="${escapeHtml(entry.id)}">
      <label class="log-entry-check" data-stop="1">
        <input type="checkbox" class="log-entry-checkbox" data-id="${escapeHtml(entry.id)}" ${checked ? 'checked' : ''} />
      </label>
      <button type="button" class="log-entry-btn" data-id="${escapeHtml(entry.id)}">
        <span class="log-entry-top">
          <span class="log-status ${statusClass}" aria-hidden="true"></span>
          <span class="log-entry-order log-order">${escapeHtml(entry.orderId || entry.path || 'Log')}</span>
          <span class="log-type-badge log-badge-kind kind-${escapeHtml(kind)} ${escapeHtml(kind)}">${escapeHtml(kindLabel(kind))}</span>
        </span>
        <span class="log-entry-msg log-desc" title="${escapeHtml(desc)}">${escapeHtml(preview(desc))}</span>
        <span class="log-entry-meta log-time">
          <span>${escapeHtml(timeLabel)}</span>
          ${entry.host ? `<span>${escapeHtml(entry.host)}</span>` : ''}
        </span>
      </button>
    </li>`;
}

function formatLogListTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    const time = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    return `${day} · ${time}`;
  } catch {
    return String(ts);
  }
}

function groupEntriesBySource(entries) {
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.source || '(unknown)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }
  return groups;
}

function renderLogEntries() {
  const items = filteredEntries();
  logEntryCount.textContent = String(items.length);
  updateOutcomeCounts();
  updateSelectionUi();
  renderLogInsights();

  const fileNames = [...uploadedFiles.keys()];
  const grouped = groupEntriesBySource(items);

  // Include uploaded files with no matching filtered entries, and orphan sources.
  const orderedNames = [];
  for (const name of fileNames) {
    if (!orderedNames.includes(name)) orderedNames.push(name);
  }
  for (const name of grouped.keys()) {
    if (!orderedNames.includes(name)) orderedNames.push(name);
  }

  if (fileNames.length === 0 && logEntries.length === 0) {
    logEntryList.innerHTML =
      '<div class="log-empty">Upload and parse log files to begin</div>';
    return;
  }

  if (orderedNames.length === 0 || (items.length === 0 && logEntries.length > 0)) {
    logEntryList.innerHTML = `<div class="lr-empty-filter">
      <p>No logs match the current filters. Try clearing search or facet filters.</p>
      <button type="button" class="btn btn-sm" id="log-empty-reset">Clear filters</button>
    </div>`;
    return;
  }

  logEntryList.innerHTML = orderedNames
    .map((name) => {
      const file = uploadedFiles.get(name);
      const entries = grouped.get(name) || [];
      const allForFile = logEntries.filter((e) => e.source === name);
      const parsed = allForFile.length > 0;
      const collapsed = collapsedGroups.has(name);
      const successN = entries.filter((e) => e.outcome === 'success').length;
      const errorN = entries.filter((e) => e.outcome === 'error').length;
      const otherN = entries.length - successN - errorN;

      let summary;
      if (!parsed) {
        summary = file
          ? `${formatBytes(file.size)} · pending parse`
          : 'pending parse';
      } else if (entries.length === 0) {
        summary = `0 shown · ${allForFile.length} total`;
      } else {
        summary = `${entries.length} req`;
        if (successN) summary += ` · ${successN} ok`;
        if (errorN) summary += ` · ${errorN} err`;
        if (otherN) summary += ` · ${otherN} other`;
      }

      const body = collapsed
        ? ''
        : !parsed
          ? `<div class="log-group-pending">Ready — click <strong>Parse &amp; decrypt</strong></div>`
          : entries.length === 0
            ? `<div class="log-group-pending">No requests match the current filters</div>`
            : `<ul class="log-entry-list">${entries.map(renderLogEntryItem).join('')}</ul>`;

      return `
        <section class="log-group${collapsed ? ' collapsed' : ''}${!parsed ? ' pending' : ''}" data-source="${escapeHtml(name)}">
          <div class="log-group-header">
            <button type="button" class="log-group-toggle" data-source="${escapeHtml(name)}" aria-expanded="${collapsed ? 'false' : 'true'}">
              <span class="log-group-chevron" aria-hidden="true">▾</span>
              <span class="log-group-text">
                <span class="log-group-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                <span class="log-group-summary">${escapeHtml(summary)}</span>
              </span>
            </button>
            <button type="button" class="log-group-remove" data-name="${escapeHtml(name)}" title="Remove file">×</button>
          </div>
          <div class="log-group-body">${body}</div>
        </section>`;
    })
    .join('');
}

async function parseAndDecryptLogs() {
  if (uploadedFiles.size === 0) {
    setLogsAlert({
      title: 'Nothing to parse',
      text: 'Upload at least one .txt or .log file first.',
      type: 'warning',
      actions: [{ id: 'upload', label: 'Upload', primary: true }],
    });
    showToast('Upload log files first');
    return;
  }

  const secretKey = $('#log-key').value.trim();
  logParseBtn.disabled = true;
  logParseBtn.classList.add('loading');
  setLogStatus('Parsing log files…', 'info');
  setLogsAlert({
    title: 'Parsing logs…',
    text: 'Decrypting payloads and classifying outcomes.',
    type: 'info',
  });

  try {
    await new Promise((r) => setTimeout(r, 30));

    const all = [];
    const fileNames = [...uploadedFiles.keys()];
    for (const file of uploadedFiles.values()) {
      const text = await file.text();
      const parsed = parseApiLogs(text, { source: file.name });
      const decrypted = parsed
        .map((entry) => enrichLogEntry(decryptLogEntry(entry, secretKey)))
        .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      all.push(...decrypted);
    }

    if (!all.length) {
      logEntries = [];
      activeLogId = null;
      renderLogEntries();
      clearLogViewer();
      setLogsAlert({
        title: 'No log entries found',
        text: 'These files did not contain recognizable API request/response blocks.',
        type: 'warning',
        actions: [{ id: 'clear', label: 'Clear files' }],
      });
      setLogStatus('No entries parsed', 'warning');
      showToast('No log entries found');
      return;
    }

    logEntries = all;

    // Collapse every file except the first to keep the list snappy
    collapsedGroups.clear();
    fileNames.forEach((name, i) => {
      if (i > 0) collapsedGroups.add(name);
    });

    const decryptedTotal = all.reduce((s, e) => s + (e.decryptedCount || 0), 0);
    const failedTotal = all.reduce((s, e) => s + (e.failedCount || 0), 0);
    const encryptedLeft = all.reduce(
      (s, e) => s + Math.max(0, (e.encryptedCount || 0) - (e.decryptedCount || 0)),
      0
    );
    const successCount = all.filter((e) => e.outcome === 'success').length;
    const errorCount = all.filter((e) => e.outcome === 'error').length;

    activeLogId = all[0]?.id ?? null;
    renderLogEntries();
    if (activeLogId) selectLogEntry(activeLogId, { rebuildList: false });
    else clearLogViewer();

    let msg = `Parsed ${all.length} · ${successCount} success · ${errorCount} error`;
    if (decryptedTotal) msg += ` · decrypted ${decryptedTotal}`;
    if (failedTotal || (encryptedLeft && !secretKey)) {
      msg += secretKey
        ? ` · ${failedTotal} decrypt failed`
        : ` · ${encryptedLeft} still encrypted (add key)`;
    }

    setLogStatus(msg, errorCount ? 'error' : 'success');
    showToast(`Loaded ${all.length} log entries`);

    if (!secretKey && encryptedLeft > 0) {
      setLogsAlert({
        title: `${encryptedLeft} payload${encryptedLeft === 1 ? '' : 's'} still encrypted`,
        text: `Loaded ${all.length} entries (${errorCount} failed). Add a secret key and parse again to decrypt.`,
        type: 'warning',
        actions: [
          { id: 'focus-key', label: 'Focus key' },
          { id: 'show-failed', label: 'Show failed', primary: true },
        ],
      });
    } else if (failedTotal > 0) {
      setLogsAlert({
        title: `${failedTotal} decrypt failure${failedTotal === 1 ? '' : 's'}`,
        text: `Parsed ${all.length} entries · ${errorCount} request failures. Check the key or inspect Failed filter.`,
        type: 'warning',
        actions: [{ id: 'show-failed', label: 'Show failed', primary: true }],
      });
    } else if (errorCount > 0) {
      setLogsAlert({
        title: `${errorCount} failed request${errorCount === 1 ? '' : 's'}`,
        text: `Parsed ${all.length} entries successfully. Open Insights or filter Failed to triage.`,
        type: 'error',
        actions: [
          { id: 'show-failed', label: 'Show failed', primary: true },
          { id: 'open-insights', label: 'Open insights' },
        ],
      });
    } else {
      setLogsAlert({
        title: `Loaded ${all.length} log entries`,
        text: `${successCount} succeeded · use filters and Insights to explore.`,
        type: 'success',
      });
    }
  } catch (err) {
    setLogStatus(err.message || 'Failed to parse logs', 'error');
    setLogsAlert({
      title: 'Parse failed',
      text: err.message || 'Could not read or parse the uploaded log files.',
      type: 'error',
      actions: [{ id: 'retry-parse', label: 'Retry', primary: true }],
    });
    showToast('Failed to parse logs');
  } finally {
    logParseBtn.disabled = uploadedFiles.size === 0;
    logParseBtn.classList.remove('loading');
    updateLogFileUi();
  }
}

function clearLogs() {
  uploadedFiles.clear();
  logEntries = [];
  activeLogId = null;
  outcomeFilter = 'all';
  kindFilter = 'all';
  statusCodeFilter = 'all';
  hostFilter = 'all';
  clientFilter = 'all';
  collapsedGroups.clear();
  selectedLogIds.clear();
  logFilter.value = '';
  if (logStatusFilter) logStatusFilter.value = 'all';
  if (logHostFilter) logHostFilter.value = 'all';
  if (logClientFilter) logClientFilter.value = 'all';
  logFileInput.value = '';
  updateLogFileUi();
  clearLogViewer();
  renderLogInsights();
  clearLogsAlert();
  setLogStatus('Ready — upload log files and enter your secret key', 'ready');
  showToast('Cleared logs');
}

$('#decrypt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runDecrypt();
});

$('#copy-btn')?.addEventListener('click', async () => {
  const text = getOutput();
  if (!text) {
    showToast('Nothing to copy');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    flashCopySuccess($('#copy-btn'));
  } catch {
    showToast('Copy failed');
  }
});

$('#format-btn')?.addEventListener('click', () => {
  formatOutputJson();
  closeJsonMenu();
});

$('#minify-btn')?.addEventListener('click', () => {
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
  closeJsonMenu();
});

let wrapOn = false;
$('#wrap-btn')?.addEventListener('click', () => {
  wrapOn = !wrapOn;
  setTreeWrap(wrapOn);
  $('#wrap-btn')?.setAttribute('aria-pressed', wrapOn ? 'true' : 'false');
  closeJsonMenu();
});

$('#jv-expand-btn')?.addEventListener('click', () => expandAll());
$('#jv-collapse-btn')?.addEventListener('click', () => collapseAll());

function closeJsonMenu() {
  const menu = $('#jv-more-menu');
  const btn = $('#jv-more-btn');
  if (menu) menu.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
}

$('#jv-more-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = $('#jv-more-menu');
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  $('#jv-more-btn')?.setAttribute('aria-expanded', open ? 'true' : 'false');
});

$('#jv-more-menu')?.addEventListener('click', async (e) => {
  const item = e.target.closest('[data-menu]');
  if (!item) return;
  const kind = item.getAttribute('data-menu');
  const path = getActivePath();
  if (kind === 'copy-path') {
    await navigator.clipboard.writeText(path || 'root');
    showToast('Path copied');
  } else if (kind === 'copy-value') {
    const val = getValueAtActivePath();
    const text = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    await navigator.clipboard.writeText(text ?? '');
    showToast('Value copied');
  }
  closeJsonMenu();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.jv-menu')) closeJsonMenu();
});

$('#jv-search-toggle')?.addEventListener('click', () => {
  const wrap = $('#jv-search-wrap');
  wrap?.classList.add('open');
  $('#jv-search-toggle')?.classList.add('active');
  $('#jv-search')?.focus();
});

$('#jv-search-clear')?.addEventListener('click', () => {
  const wrap = $('#jv-search-wrap');
  wrap?.classList.remove('open');
  $('#jv-search-toggle')?.classList.remove('active');
});

$('#download-btn')?.addEventListener('click', () => {
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
  closeJsonMenu();
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
    setPastedInput(text);
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

$('#toggle-log-key').addEventListener('click', () => {
  const input = $('#log-key');
  const btn = $('#toggle-log-key');
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
    setPastedInput(text, 'Dropped');
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

apiDrawerTab.addEventListener('click', () => {
  const opening = !apiDrawer.classList.contains('open');
  if (opening) {
    history.replaceState(null, '', '#api-routes');
    setApiDrawerOpen(true);
  } else {
    history.replaceState(null, '', location.pathname);
    setApiDrawerOpen(false);
  }
});

apiDrawerClose.addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  setApiDrawerOpen(false);
});

apiDrawerBackdrop.addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  setApiDrawerOpen(false);
});

window.addEventListener('hashchange', syncApiDrawerFromHash);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (currentMode === 'logs') parseAndDecryptLogs();
    else runDecrypt();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && currentMode === 'decrypt') {
    e.preventDefault();
    $('#jv-search-wrap')?.classList.add('open');
    $('#jv-search-toggle')?.classList.add('active');
    $('#jv-search')?.focus();
    return;
  }

  if (currentMode === 'logs' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'k')) {
      e.preventDefault();
      navigateLog(-1);
      return;
    }
    if (!typing && (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j')) {
      e.preventDefault();
      navigateLog(1);
      return;
    }
  }

  if (e.key === 'Escape' && apiDrawer.classList.contains('open')) {
    history.replaceState(null, '', location.pathname);
    setApiDrawerOpen(false);
    return;
  }

  if (e.key === 'Escape' && currentMode === 'logs' && logsDetail?.classList.contains('modal-open')) {
    closeLogDetailModal();
    return;
  }

  if (
    e.key === 'Escape' &&
    currentMode === 'decrypt' &&
    document.activeElement !== $('#key') &&
    document.activeElement !== $('#data')
  ) {
    $('#clear-btn').click();
  }
});

document.addEventListener('click', (e) => {
  const modeBtn = e.target.closest('.mode-option[data-mode]');
  if (modeBtn) {
    e.preventDefault();
    setMode(modeBtn.dataset.mode);
  }
});

logUploadBtn?.addEventListener('click', () => logFileInput.click());
logDropzone.addEventListener('click', () => logFileInput.click());
logDropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    logFileInput.click();
  }
});

logsEmptyState?.addEventListener('click', (e) => {
  const rem = e.target.closest('[data-remove-file]');
  if (rem) {
    e.preventDefault();
    removeUploadedFile(rem.getAttribute('data-remove-file'));
    return;
  }
  if (e.target.closest('#parse-from-files-btn')) {
    e.preventDefault();
    parseAndDecryptLogs();
  }
});

bindSharedSecretKey();

mountJsonViewer({
  tree: $('#jv-tree'),
  searchInput: $('#jv-search'),
  searchClear: $('#jv-search-clear'),
  searchMeta: $('#jv-search-meta'),
  toolbar: $('#jv-toolbar'),
  breadcrumb: $('#jv-breadcrumb'),
  empty: $('#jv-empty'),
  body: $('#jv-body'),
  stats: $('#jv-stats'),
  onToast: showToast,
  onPasteDecrypt: () => pasteAndDecrypt(),
});

$('#jv-search')?.addEventListener('input', (e) => {
  const clear = $('#jv-search-clear');
  if (clear) clear.hidden = !e.target.value;
});
logFileInput.addEventListener('change', () => {
  if (logFileInput.files?.length) addLogFiles(logFileInput.files);
  logFileInput.value = '';
});

function bindLogDropTarget(el) {
  if (!el) return;
  ['dragenter', 'dragover'].forEach((evt) => {
    el.addEventListener(evt, (e) => {
      e.preventDefault();
      logDropzone.classList.add('drag-over');
      logsMain?.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    el.addEventListener(evt, (e) => {
      e.preventDefault();
      logDropzone.classList.remove('drag-over');
      logsMain?.classList.remove('drag-over');
    });
  });
  el.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files?.length) addLogFiles(files);
  });
}

bindLogDropTarget(logDropzone);
bindLogDropTarget(logsMain);

// Avoid double-handling when drop bubbles from the hero dropzone into logs-main.
logDropzone.addEventListener('drop', (e) => e.stopPropagation());

function applyListFilters() {
  const visible = filteredEntries();
  if (activeLogId && !visible.some((e) => e.id === activeLogId)) {
    activeLogId = visible[0]?.id ?? null;
    renderLogEntries();
    if (activeLogId) selectLogEntry(activeLogId, { rebuildList: false });
    else clearLogViewer();
  } else {
    renderLogEntries();
    updateLogNav();
  }
}

let filterTimer = 0;
logParseBtn.addEventListener('click', () => parseAndDecryptLogs());
logClearBtn.addEventListener('click', () => clearLogs());
logFilter.addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => applyListFilters(), 120);
});

document.querySelector('#stats-strip')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.sstat[data-outcome]');
  if (!btn) return;
  outcomeFilter = /** @type {'all' | 'success' | 'error' | 'other' | 'pay'} */ (btn.dataset.outcome);
  applyListFilters();
});

document.querySelector('.log-kind-filters')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.log-kind-chip[data-kind]');
  if (!btn) return;
  kindFilter = /** @type {'all' | 'return' | 'exchange' | 'pay' | 'status' | 'failed'} */ (
    btn.dataset.kind
  );
  applyListFilters();
});

function resetFacetFilters() {
  statusCodeFilter = 'all';
  hostFilter = 'all';
  clientFilter = 'all';
  if (logStatusFilter) logStatusFilter.value = 'all';
  if (logHostFilter) logHostFilter.value = 'all';
  if (logClientFilter) logClientFilter.value = 'all';
}

logStatusFilter?.addEventListener('change', () => {
  statusCodeFilter = logStatusFilter.value || 'all';
  applyListFilters();
});

logHostFilter?.addEventListener('change', () => {
  hostFilter = logHostFilter.value || 'all';
  applyListFilters();
});

logClientFilter?.addEventListener('change', () => {
  clientFilter = logClientFilter.value || 'all';
  applyListFilters();
});

logFiltersClear?.addEventListener('click', () => {
  resetFacetFilters();
  applyListFilters();
});

logsAlertDismiss?.addEventListener('click', () => clearLogsAlert());

logsAlertActions?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-alert-action]');
  if (!btn) return;
  const action = btn.dataset.alertAction;
  if (action === 'upload') {
    logFileInput?.click();
  } else if (action === 'parse' || action === 'retry-parse') {
    parseAndDecryptLogs();
  } else if (action === 'clear') {
    clearLogs();
  } else if (action === 'focus-key') {
    $('#log-key')?.focus();
  } else if (action === 'show-failed') {
    outcomeFilter = 'error';
    kindFilter = 'failed';
    applyListFilters();
    clearLogsAlert();
  } else if (action === 'open-insights') {
    if (logInsights) logInsights.open = true;
    logInsights?.scrollIntoView({ block: 'nearest' });
  }
});

logInsightsBody?.addEventListener('click', (e) => {
  const chip = e.target.closest('.log-insight-chip[data-facet]');
  if (!chip) return;
  const facet = chip.dataset.facet;
  const value = chip.dataset.value || '';

  if (facet === 'status') {
    statusCodeFilter = statusCodeFilter === value ? 'all' : value;
    if (logStatusFilter) logStatusFilter.value = statusCodeFilter;
  } else if (facet === 'host') {
    hostFilter = hostFilter === value ? 'all' : value;
    if (logHostFilter) logHostFilter.value = hostFilter;
  } else if (facet === 'client') {
    clientFilter = clientFilter === value ? 'all' : value;
    if (logClientFilter) logClientFilter.value = clientFilter;
  } else if (facet === 'message' || facet === 'endpoint') {
    const next = (logFilter.value || '').trim() === value ? '' : value;
    logFilter.value = next;
  }

  applyListFilters();
});

mobileCloseBtn?.addEventListener('click', () => closeLogDetailModal());

function updateLogsClock() {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  if (logsClock) logsClock.textContent = time;
  const floatClock = $('#float-clock');
  if (floatClock) floatClock.textContent = time;
}
updateLogsClock();
setInterval(updateLogsClock, 1000);

/* ── Floating chrome ── */
const floatDock = $('#float-dock');
const floatChrome = $('#float-chrome');
const floatFab = $('#float-fab');
const floatTray = $('#float-tray');
const floatTrayClose = $('#float-tray-close');
const floatSlotModes = $('#float-slot-modes');
const floatSlotLogs = $('#float-slot-logs');
const workspaceSwitch = $('#workspace-switch');
const logsToolbarActions = $('#logs-toolbar-actions');

function mountFloatChromeSlots() {
  if (floatSlotModes && workspaceSwitch && workspaceSwitch.parentElement !== floatSlotModes) {
    floatSlotModes.appendChild(workspaceSwitch);
  }
  if (floatSlotLogs && logsToolbarActions && logsToolbarActions.parentElement !== floatSlotLogs) {
    floatSlotLogs.appendChild(logsToolbarActions);
  }
}

function setFloatTrayOpen(open) {
  if (!floatChrome || !floatFab || !floatTray) return;
  floatTray.hidden = !open;
  floatChrome.classList.toggle('is-open', open);
  floatFab.setAttribute('aria-expanded', open ? 'true' : 'false');
  floatFab.setAttribute('aria-label', open ? 'Hide log tools' : 'Show log tools');
  floatChrome.classList.add('is-visible');
  if (floatDock) floatDock.classList.add('is-visible');
  clearTimeout(bumpFloatChrome._hide);
  if (!open) bumpFloatChrome();
}

function bumpFloatChrome() {
  if (floatDock) floatDock.classList.add('is-visible');
  if (floatChrome) floatChrome.classList.add('is-visible');
  clearTimeout(bumpFloatChrome._hide);
  if (floatChrome?.classList.contains('is-open')) return;
  bumpFloatChrome._hide = setTimeout(() => {
    if (floatChrome?.classList.contains('is-open')) return;
    floatDock?.classList.remove('is-visible');
    floatChrome?.classList.remove('is-visible');
  }, 2600);
}

mountFloatChromeSlots();
bumpFloatChrome();

floatFab?.addEventListener('click', () => {
  setFloatTrayOpen(Boolean(floatTray?.hidden));
});

floatTrayClose?.addEventListener('click', () => setFloatTrayOpen(false));

document.addEventListener(
  'scroll',
  () => {
    bumpFloatChrome();
  },
  { capture: true, passive: true }
);

['mousemove', 'pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
  document.addEventListener(evt, () => bumpFloatChrome(), { passive: true });
});

floatDock?.addEventListener('mouseenter', () => {
  floatDock.classList.add('is-visible');
  clearTimeout(bumpFloatChrome._hide);
});
floatDock?.addEventListener('mouseleave', () => {
  if (!floatChrome?.classList.contains('is-open')) bumpFloatChrome();
});

floatChrome?.addEventListener('mouseenter', () => {
  floatChrome.classList.add('is-visible');
  floatDock?.classList.add('is-visible');
  clearTimeout(bumpFloatChrome._hide);
});
floatChrome?.addEventListener('mouseleave', () => {
  if (!floatChrome.classList.contains('is-open')) bumpFloatChrome();
});

logPrevBtn?.addEventListener('click', () => navigateLog(-1));
logNextBtn?.addEventListener('click', () => navigateLog(1));

logEntryList.addEventListener('click', (e) => {
  if (e.target.closest('#log-empty-reset')) {
    e.preventDefault();
    outcomeFilter = 'all';
    kindFilter = 'all';
    resetFacetFilters();
    if (logFilter) logFilter.value = '';
    applyListFilters();
    return;
  }

  if (e.target.closest('[data-stop]')) {
    e.stopPropagation();
    return;
  }

  const removeBtn = e.target.closest('.log-group-remove');
  if (removeBtn) {
    e.preventDefault();
    removeUploadedFile(removeBtn.dataset.name);
    return;
  }

  const toggleBtn = e.target.closest('.log-group-toggle');
  if (toggleBtn) {
    const source = toggleBtn.dataset.source;
    if (collapsedGroups.has(source)) collapsedGroups.delete(source);
    else collapsedGroups.add(source);
    renderLogEntries();
    return;
  }

  const entryBtn = e.target.closest('.log-entry-btn');
  if (entryBtn) selectLogEntry(entryBtn.dataset.id, { rebuildList: false });
});

logEntryList.addEventListener('change', (e) => {
  const checkbox = e.target.closest('.log-entry-checkbox');
  if (!checkbox) return;
  e.stopPropagation();
  toggleLogSelection(checkbox.dataset.id, checkbox.checked);
  const item = checkbox.closest('.log-entry-item');
  item?.classList.toggle('selected', checkbox.checked);
});

logSelectVisible?.addEventListener('change', () => {
  const visible = filteredEntries();
  if (logSelectVisible.checked) {
    visible.forEach((e) => selectedLogIds.add(e.id));
  } else {
    visible.forEach((e) => selectedLogIds.delete(e.id));
  }
  // Update checkboxes in place when possible
  logEntryList.querySelectorAll('.log-entry-checkbox').forEach((box) => {
    const on = selectedLogIds.has(box.dataset.id);
    box.checked = on;
    box.closest('.log-entry-item')?.classList.toggle('selected', on);
  });
  updateSelectionUi();
});

logClearSelectedBtn?.addEventListener('click', () => {
  selectedLogIds.clear();
  logEntryList.querySelectorAll('.log-entry-checkbox').forEach((box) => {
    box.checked = false;
    box.closest('.log-entry-item')?.classList.remove('selected');
  });
  updateSelectionUi();
  showToast('Selection cleared');
});

logExportSelectedBtn?.addEventListener('click', () => exportSelectedLogs());
logExportSelectedDetailBtn?.addEventListener('click', () => exportSelectedLogs());

$('#log-copy-btn').addEventListener('click', async () => {
  await copyText(getLogOutputJson(), 'Formatted log copied');
});

$('#log-copy-raw-btn')?.addEventListener('click', async () => {
  await copyText(getLogRawText(), 'Raw log copied');
});

logViewerBody?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn || !logViewerBody.contains(btn)) return;
  e.preventDefault();
  e.stopPropagation();
  const kind = btn.getAttribute('data-copy');
  const labels = {
    payload: 'Request body copied',
    request: 'Full request copied',
    response: 'Response copied',
    raw: 'Raw log copied',
    formatted: 'Formatted log copied',
  };
  await copyText(resolveLogCopyText(kind), labels[kind] || 'Copied to clipboard');
});

$('#log-download-btn').addEventListener('click', () => {
  const text = getLogOutputJson();
  if (!text) {
    showToast('Nothing to download');
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'log-entry.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded log-entry.json');
});

renderHistory();
renderApiRoutes();
syncApiDrawerFromHash();
updateFieldStates();
updateLogFileUi();
setMode('decrypt');
setStatus('Ready — enter your secret key and encrypted data', 'ready');
$('#data').focus();

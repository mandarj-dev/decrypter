/**
 * Collapsible JSON tree viewer for the decrypt workspace.
 */

import { escHtml } from './jsonHighlight.js';

/** @type {{
 *   data: any,
 *   text: string,
 *   collapsed: Set<string>,
 *   search: string,
 *   matches: string[],
 *   matchIndex: number,
 *   activePath: string,
 *   els: Record<string, HTMLElement|null>,
 * }} */
const state = {
  data: null,
  text: '',
  collapsed: new Set(),
  search: '',
  matches: [],
  matchIndex: -1,
  activePath: '',
  els: {},
};

function isObject(v) {
  return v !== null && typeof v === 'object';
}

function pathJoin(parent, key, isIndex = false) {
  if (!parent) return isIndex ? `[${key}]` : String(key);
  if (isIndex) return `${parent}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(String(key))) return `${parent}.${key}`;
  return `${parent}[${JSON.stringify(String(key))}]`;
}

function breadcrumbParts(path) {
  if (!path || path === '$') return [];
  const parts = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === '.') {
      i++;
      continue;
    }
    if (path[i] === '[') {
      const end = path.indexOf(']', i);
      if (end < 0) break;
      const inner = path.slice(i + 1, end);
      if (inner.startsWith('"')) {
        try {
          parts.push(JSON.parse(inner));
        } catch {
          parts.push(inner);
        }
      } else {
        parts.push(inner);
      }
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j++;
    parts.push(path.slice(i, j));
    i = j;
  }
  return parts;
}

export function analyzeJson(value) {
  let objects = 0;
  let arrays = 0;
  let keys = 0;

  function walk(v) {
    if (Array.isArray(v)) {
      arrays++;
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      objects++;
      for (const [k, child] of Object.entries(v)) {
        keys++;
        void k;
        walk(child);
      }
    }
  }

  walk(value);
  return { objects, arrays, keys };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function preview(v) {
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (v && typeof v === 'object') {
    const n = Object.keys(v).length;
    return `{ ${n} key${n === 1 ? '' : 's'} }`;
  }
  return '';
}

function collectCollapsedDefaults(value, path = '', depth = 0, into = new Set()) {
  if (!isObject(value)) return into;
  if (depth >= 2) into.add(path || '$');
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectCollapsedDefaults(item, pathJoin(path, i, true), depth + 1, into));
  } else {
    Object.entries(value).forEach(([k, child]) =>
      collectCollapsedDefaults(child, pathJoin(path, k), depth + 1, into)
    );
  }
  return into;
}

function collectExpandablePaths(value, path = '', into = []) {
  if (!isObject(value)) return into;
  const p = path || '$';
  into.push(p);
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectExpandablePaths(item, pathJoin(path, i, true), into));
  } else {
    Object.entries(value).forEach(([k, child]) => collectExpandablePaths(child, pathJoin(path, k), into));
  }
  return into;
}

function collectSearchMatches(value, query, path = '', into = []) {
  if (!query) return into;
  const q = query.toLowerCase();

  if (!isObject(value)) {
    const s = value === null ? 'null' : String(value);
    if (s.toLowerCase().includes(q)) into.push(path || '$');
    return into;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      const p = pathJoin(path, i, true);
      collectSearchMatches(item, query, p, into);
    });
    return into;
  }

  for (const [k, child] of Object.entries(value)) {
    const p = pathJoin(path, k);
    if (String(k).toLowerCase().includes(q)) into.push(p);
    collectSearchMatches(child, query, p, into);
  }
  return into;
}

function valueAtPath(root, path) {
  if (!path || path === '$') return root;
  const parts = breadcrumbParts(path);
  let cur = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function highlightText(text, query) {
  const s = String(text);
  if (!query) return escHtml(s);
  const q = query.toLowerCase();
  const lower = s.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return escHtml(s);
  return (
    escHtml(s.slice(0, idx)) +
    `<mark class="jv-mark">${escHtml(s.slice(idx, idx + query.length))}</mark>` +
    escHtml(s.slice(idx + query.length))
  );
}

function renderPrimitive(value, query) {
  const t = typeOf(value);
  if (t === 'string') return `<span class="jv-str">"${highlightText(value, query)}"</span>`;
  if (t === 'number') return `<span class="jv-num">${highlightText(value, query)}</span>`;
  if (t === 'boolean') return `<span class="jv-lit">${value}</span>`;
  if (t === 'null') return `<span class="jv-lit">null</span>`;
  return `<span class="jv-lit">${escHtml(String(value))}</span>`;
}

function renderNode(key, value, path, { isLast = true, showKey = true } = {}) {
  const query = state.search;
  const t = typeOf(value);
  const isMatch = state.matches.includes(path);
  const isActive = state.activePath === path;
  const rowClass = [
    'jv-row',
    isMatch ? 'is-match' : '',
    isActive ? 'is-active' : '',
    state.matchIndex >= 0 && state.matches[state.matchIndex] === path ? 'is-current-match' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const keyHtml = showKey
    ? `<span class="jv-key" data-path="${escHtml(path)}">${highlightText(key, query)}</span><span class="jv-colon">:</span> `
    : '';

  if (!isObject(value)) {
    return `<div class="${rowClass}" data-path="${escHtml(path)}" data-leaf="1">
      <span class="jv-gutter"></span>
      ${keyHtml}${renderPrimitive(value, query)}
      ${isLast ? '' : '<span class="jv-comma">,</span>'}
      <span class="jv-actions">
        <button type="button" class="jv-act" data-act="copy-value" data-path="${escHtml(path)}" title="Copy value">val</button>
        <button type="button" class="jv-act" data-act="copy-path" data-path="${escHtml(path)}" title="Copy path">path</button>
      </span>
    </div>`;
  }

  const collapsedPath = path || '$';
  const collapsed = state.collapsed.has(collapsedPath);
  const openToken = Array.isArray(value) ? '[' : '{';
  const closeToken = Array.isArray(value) ? ']' : '}';
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);

  if (collapsed) {
    return `<div class="${rowClass} is-collapsed" data-path="${escHtml(collapsedPath)}">
      <button type="button" class="jv-toggle" data-toggle="${escHtml(collapsedPath)}" aria-expanded="false">▶</button>
      ${keyHtml}<span class="jv-bracket">${openToken}</span>
      <button type="button" class="jv-preview" data-toggle="${escHtml(collapsedPath)}">${escHtml(preview(value))}</button>
      <span class="jv-bracket">${closeToken}</span>${isLast ? '' : '<span class="jv-comma">,</span>'}
      <span class="jv-actions">
        <button type="button" class="jv-act" data-act="copy-value" data-path="${escHtml(collapsedPath)}" title="Copy value">val</button>
        <button type="button" class="jv-act" data-act="copy-path" data-path="${escHtml(collapsedPath)}" title="Copy path">path</button>
      </span>
    </div>`;
  }

  const children = entries
    .map(([k, child], idx) => {
      const childPath = Array.isArray(value) ? pathJoin(path, k, true) : pathJoin(path, k);
      return renderNode(String(k), child, childPath, {
        isLast: idx === entries.length - 1,
        showKey: true,
      });
    })
    .join('');

  return `<div class="${rowClass} is-open" data-path="${escHtml(collapsedPath)}">
    <button type="button" class="jv-toggle" data-toggle="${escHtml(collapsedPath)}" aria-expanded="true">▼</button>
    ${keyHtml}<span class="jv-bracket">${openToken}</span>
    <span class="jv-actions">
      <button type="button" class="jv-act" data-act="copy-value" data-path="${escHtml(collapsedPath)}" title="Copy value">val</button>
      <button type="button" class="jv-act" data-act="copy-path" data-path="${escHtml(collapsedPath)}" title="Copy path">path</button>
    </span>
  </div>
  <div class="jv-children">${children}</div>
  <div class="jv-row jv-close" data-path="${escHtml(collapsedPath)}">
    <span class="jv-gutter"></span>
    <span class="jv-bracket">${closeToken}</span>${isLast ? '' : '<span class="jv-comma">,</span>'}
  </div>`;
}

function renderTree() {
  const { tree } = state.els;
  if (!tree) return;

  if (state.data === null || state.data === undefined || state.text === '') {
    tree.innerHTML = '';
    return;
  }

  if (!isObject(state.data)) {
    tree.innerHTML = `<div class="jv-root">${renderPrimitive(state.data, state.search)}</div>`;
    return;
  }

  tree.innerHTML = `<div class="jv-root">${renderNode('root', state.data, '', {
    isLast: true,
    showKey: false,
  })}</div>`;
}

function updateBreadcrumb() {
  const { breadcrumb } = state.els;
  if (!breadcrumb) return;
  const parts = breadcrumbParts(state.activePath);
  if (!parts.length) {
    breadcrumb.innerHTML = `<span class="jv-crumb-muted">root</span>`;
    return;
  }
  let built = '';
  breadcrumb.innerHTML = parts
    .map((p, i) => {
      const asIndex = /^\d+$/.test(String(p));
      built = pathJoin(built, p, asIndex);
      const sep = i === 0 ? '' : `<span class="jv-crumb-sep">›</span>`;
      return `${sep}<button type="button" class="jv-crumb" data-path="${escHtml(built)}">${escHtml(String(p))}</button>`;
    })
    .join('');
}

function updateSearchUi() {
  const { searchMeta, searchInput } = state.els;
  if (searchInput && searchInput.value !== state.search) {
    // keep user typing
  }
  if (!searchMeta) return;
  if (!state.search) {
    searchMeta.textContent = '';
    searchMeta.hidden = true;
    return;
  }
  searchMeta.hidden = false;
  const n = state.matches.length;
  const cur = n ? state.matchIndex + 1 : 0;
  searchMeta.innerHTML = `<span>${n} match${n === 1 ? '' : 'es'}</span>
    <button type="button" class="btn btn-sm jv-search-nav" data-search-nav="-1" ${n ? '' : 'disabled'}>↑</button>
    <button type="button" class="btn btn-sm jv-search-nav" data-search-nav="1" ${n ? '' : 'disabled'}>↓</button>
    <span class="jv-search-pos">${cur}/${n}</span>`;
}

function updateStats() {
  const { stats } = state.els;
  if (!stats) return;
  if (state.text === '') {
    stats.innerHTML = '';
    return;
  }
  const bytes = new Blob([state.text]).size;
  if (state.data !== null && (isObject(state.data) || typeof state.data !== 'undefined')) {
    try {
      const a = analyzeJson(state.data);
      stats.innerHTML = `<span>Objects <strong>${a.objects}</strong></span>
        <span>Arrays <strong>${a.arrays}</strong></span>
        <span>Keys <strong>${a.keys}</strong></span>
        <span class="jv-stats-sep">·</span>
        <span>${formatBytes(bytes)} · JSON</span>`;
      return;
    } catch {
      /* fall through */
    }
  }
  stats.innerHTML = `<span>${formatBytes(bytes)} · text</span>`;
}

function ensureAncestorsExpanded(path) {
  const parts = breadcrumbParts(path);
  let built = '';
  state.collapsed.delete('$');
  state.collapsed.delete('');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const asIndex = /^\d+$/.test(String(part));
    built = pathJoin(built, part, asIndex);
    // expand this node and parents
    state.collapsed.delete(built);
    // also delete parent path variants
  }
  // Expand all parent containers along the path
  let cur = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const asIndex = /^\d+$/.test(String(part));
    cur = pathJoin(cur, part, asIndex);
    state.collapsed.delete(cur || '$');
  }
}

function scrollToPath(path) {
  const { tree } = state.els;
  if (!tree || !path) return;
  const el = tree.querySelector(`[data-path="${CSS.escape(path)}"]`);
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function refresh() {
  renderTree();
  updateBreadcrumb();
  updateSearchUi();
  updateStats();
  updateEmptyState();
}

function updateEmptyState() {
  const { empty, body } = state.els;
  const has = Boolean(state.text);
  if (empty) empty.hidden = has;
  if (body) body.hidden = !has;
}

/**
 * @param {Record<string, HTMLElement|null>} els
 */
export function mountJsonViewer(els) {
  state.els = els;
  const { tree, searchInput, searchClear, toolbar, breadcrumb, empty } = els;

  tree?.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const p = toggle.getAttribute('data-toggle') || '$';
      if (state.collapsed.has(p)) state.collapsed.delete(p);
      else state.collapsed.add(p);
      refresh();
      return;
    }

    const act = e.target.closest('[data-act]');
    if (act) {
      const path = act.getAttribute('data-path') || '';
      const kind = act.getAttribute('data-act');
      const val = valueAtPath(state.data, path === '$' ? '' : path);
      if (kind === 'copy-path') {
        navigator.clipboard?.writeText(path || 'root');
        els.onToast?.('Path copied');
      } else if (kind === 'copy-value') {
        const text = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
        navigator.clipboard?.writeText(text ?? '');
        els.onToast?.('Value copied');
      }
      return;
    }

    const crumb = e.target.closest('.jv-crumb[data-path]');
    if (crumb && breadcrumb?.contains(crumb)) {
      const path = crumb.getAttribute('data-path') || '';
      state.activePath = path;
      ensureAncestorsExpanded(path);
      refresh();
      scrollToPath(path);
      return;
    }

    const row = e.target.closest('.jv-row[data-path], .jv-key[data-path]');
    if (row) {
      const path = row.getAttribute('data-path') || '';
      state.activePath = path === '$' ? '' : path;
      updateBreadcrumb();
      tree.querySelectorAll('.jv-row.is-active').forEach((n) => n.classList.remove('is-active'));
      tree.querySelectorAll(`.jv-row[data-path="${CSS.escape(path)}"]`).forEach((n) => n.classList.add('is-active'));
    }
  });

  breadcrumb?.addEventListener('click', (e) => {
    const crumb = e.target.closest('.jv-crumb[data-path]');
    if (!crumb) return;
    const path = crumb.getAttribute('data-path') || '';
    state.activePath = path;
    ensureAncestorsExpanded(path);
    refresh();
    scrollToPath(path);
  });

  searchInput?.addEventListener('input', () => {
    setSearch(searchInput.value);
  });

  searchClear?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    setSearch('');
  });

  toolbar?.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-search-nav]');
    if (nav) {
      const dir = Number(nav.getAttribute('data-search-nav') || 0);
      goMatch(dir);
    }
  });

  empty?.addEventListener('click', (e) => {
    if (e.target.closest('[data-paste-decrypt]')) {
      els.onPasteDecrypt?.();
    }
  });

  refresh();
}

export function setJsonText(text, { toast } = {}) {
  state.text = text || '';
  state.activePath = '';
  state.search = '';
  state.matches = [];
  state.matchIndex = -1;
  if (state.els.searchInput) state.els.searchInput.value = '';

  if (!text) {
    state.data = null;
    state.collapsed = new Set();
    refresh();
    return { ok: true, json: false };
  }

  try {
    state.data = JSON.parse(text);
    state.collapsed = collectCollapsedDefaults(state.data);
    state.collapsed.delete('');
    state.collapsed.delete('$');
    refresh();
    return { ok: true, json: true };
  } catch {
    state.data = text;
    state.collapsed = new Set();
    refresh();
    // render as plain text block
    if (state.els.tree) {
      state.els.tree.innerHTML = `<pre class="jv-plain custom-scroll">${escHtml(text)}</pre>`;
    }
    updateEmptyState();
    updateStats();
    toast?.('Not valid JSON — showing plain text');
    return { ok: true, json: false };
  }
}

export function getJsonText() {
  return state.text;
}

export function expandAll() {
  state.collapsed.clear();
  refresh();
}

export function collapseAll() {
  state.collapsed = new Set(collectExpandablePaths(state.data));
  refresh();
}

export function setSearch(query) {
  state.search = String(query || '');
  state.matches = state.search ? collectSearchMatches(state.data, state.search) : [];
  state.matchIndex = state.matches.length ? 0 : -1;
  if (state.matchIndex >= 0) {
    ensureAncestorsExpanded(state.matches[state.matchIndex]);
  }
  refresh();
  if (state.matchIndex >= 0) scrollToPath(state.matches[state.matchIndex]);
}

export function goMatch(dir) {
  if (!state.matches.length) return;
  state.matchIndex = (state.matchIndex + dir + state.matches.length) % state.matches.length;
  const path = state.matches[state.matchIndex];
  state.activePath = path;
  ensureAncestorsExpanded(path);
  refresh();
  scrollToPath(path);
}

export function formatJsonText() {
  if (!state.text) return '';
  try {
    const obj = JSON.parse(state.text);
    const next = JSON.stringify(obj, null, 2);
    setJsonText(next);
    return next;
  } catch {
    return state.text;
  }
}

export function getActivePath() {
  return state.activePath || '';
}

export function getValueAtActivePath() {
  return valueAtPath(state.data, state.activePath || '');
}

export function setTreeWrap(on) {
  state.els.tree?.classList.toggle('is-wrap', Boolean(on));
}

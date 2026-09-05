import { decryptAES } from './decrypt.js';

const CIPHER_PREFIX = 'U2FsdGVkX1';
const HEADER_RE = /^\[([^\]]+)\]\s+(\w+)\s+(\S+)/;

/**
 * Extract a JSON value starting at `start` (must point at `{` or `[`).
 * @returns {{ value: unknown, end: number } | null}
 */
function extractJson(text, start) {
  const open = text[start];
  if (open !== '{' && open !== '[') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return { value: JSON.parse(slice), end: i + 1 };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function findSectionJson(block, label) {
  const marker = `${label}:`;
  const idx = block.indexOf(marker);
  if (idx === -1) return null;

  let i = idx + marker.length;
  while (i < block.length && /\s/.test(block[i])) i++;
  if (block[i] !== '{' && block[i] !== '[') return null;

  const extracted = extractJson(block, i);
  return extracted ? extracted.value : null;
}

/**
 * Parse Response section — JSON object, literal null, or fetch/transport errors.
 * @returns {{ response: unknown, transportError: string }}
 */
function parseResponseSection(block) {
  const marker = 'Response:';
  const idx = block.indexOf(marker);
  if (idx === -1) return { response: null, transportError: '' };

  let i = idx + marker.length;
  while (i < block.length && /\s/.test(block[i])) i++;

  if (block[i] === '{' || block[i] === '[') {
    const extracted = extractJson(block, i);
    if (extracted) return { response: extracted.value, transportError: '' };
  }

  // e.g. Response: null\nError: FetchError - ... Failed to fetch
  const after = block.slice(i);
  const firstLine = (after.split(/\r?\n/)[0] || '').trim();
  const errorLine = metaLine(block, 'Error');
  const transportError = errorLine || (/failed to fetch|fetcherror|networkerror|no response/i.test(after)
    ? firstLine || 'Request failed'
    : '');

  if (firstLine === 'null' || transportError) {
    return {
      response: null,
      transportError: transportError || 'Response was null',
    };
  }

  return { response: null, transportError: '' };
}

function metaLine(block, label) {
  const re = new RegExp(`^${label}:\\s*(.*)$`, 'im');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function looksEncrypted(value) {
  return typeof value === 'string' && value.trim().startsWith(CIPHER_PREFIX);
}

/**
 * Recursively decrypt AES strings and unwrap nested JSON strings (e.g. req_body).
 * @returns {{ value: unknown, decryptedCount: number, failedCount: number }}
 */
export function decryptLogValue(value, secretKey) {
  let decryptedCount = 0;
  let failedCount = 0;

  function walk(node) {
    if (looksEncrypted(node)) {
      if (!secretKey) return node;
      try {
        const plain = decryptAES(node.trim(), secretKey);
        decryptedCount++;
        try {
          return walk(JSON.parse(plain));
        } catch {
          return plain;
        }
      } catch {
        failedCount++;
        return node;
      }
    }

    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return walk(JSON.parse(trimmed));
        } catch {
          return node;
        }
      }
      return node;
    }

    if (Array.isArray(node)) {
      return node.map(walk);
    }

    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = walk(v);
      }
      return out;
    }

    return node;
  }

  return { value: walk(value), decryptedCount, failedCount };
}

/**
 * Count encrypted ciphertext strings in a value tree.
 */
export function countEncrypted(value) {
  let n = 0;
  function walk(node) {
    if (looksEncrypted(node)) {
      n++;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  }
  walk(value);
  return n;
}

/**
 * Classify an API log response as success / error / other.
 * Based on fields like success, status_code, status, error, message,
 * plus transport failures (Response: null / Failed to fetch).
 * @param {unknown} response
 * @param {{ transportError?: string }} [opts]
 * @returns {'success' | 'error' | 'other'}
 */
export function classifyLogStatus(response, { transportError = '' } = {}) {
  if (transportError) return 'error';

  if (response == null) return 'other';

  if (typeof response === 'string') {
    const lower = response.toLowerCase();
    if (/\b(error|failed|failure|unauthorized|forbidden|not found|denied|invalid|credentials?)\b/.test(lower)) {
      return 'error';
    }
    if (/\b(success|ok|inserted successfully)\b/.test(lower)) return 'success';
    return 'other';
  }

  if (typeof response !== 'object' || Array.isArray(response)) return 'other';

  const r = /** @type {Record<string, unknown>} */ (response);

  if (r.success === false) return 'error';
  if (typeof r.error === 'string' || (r.error && typeof r.error === 'object')) return 'error';
  if (typeof r.Error === 'string') return 'error';

  const code = Number(r.status_code ?? r.statusCode ?? r.code);
  if (Number.isFinite(code)) {
    if (code >= 400) return 'error';
    if (code >= 200 && code < 300 && r.success !== false) {
      if (r.success === true) return 'success';
      return 'success';
    }
  }

  if (r.success === true) return 'success';

  const status = String(r.status ?? '').toLowerCase();
  if (status === 'success' || status === 'ok' || status === 'created' || status === 'captured') {
    return 'success';
  }
  if (
    status === 'error' ||
    status === 'failed' ||
    status === 'failure' ||
    status === 'cancelled' ||
    status === 'canceled'
  ) {
    return 'error';
  }

  const message = String(r.message ?? '').toLowerCase();
  if (
    message &&
    /\b(error|failed|failure|not available|not found|invalid|unauthorized|forbidden|denied|credentials?|unable|cannot)\b/.test(
      message
    )
  ) {
    return 'error';
  }
  if (message && /\bsuccess(fully)?\b/.test(message)) return 'success';

  return 'other';
}

function responseMeta(response, transportError = '') {
  if (transportError) {
    return { statusCode: null, statusMessage: transportError };
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return { statusCode: null, statusMessage: '' };
  }
  const r = /** @type {Record<string, unknown>} */ (response);
  const code = r.status_code ?? r.statusCode ?? r.code ?? null;
  const message =
    (typeof r.message === 'string' && r.message) ||
    (typeof r.error === 'string' && r.error) ||
    (typeof r.status === 'string' && r.status) ||
    '';
  return {
    statusCode: code == null || code === '' ? null : Number(code) || code,
    statusMessage: String(message).trim(),
  };
}

/**
 * Parse an API log file into structured entries.
 * @param {string} text
 * @param {{ source?: string }} [opts]
 * @returns {Array<object>}
 */
export function parseApiLogs(text, { source = '' } = {}) {
  const blocks = String(text || '')
    .split(/-{20,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block, index) => {
    const firstLine = block.split('\n')[0] || '';
    const header = firstLine.match(HEADER_RE);

    const request = findSectionJson(block, 'Request');
    const { response, transportError } = parseResponseSection(block);
    const outcome = classifyLogStatus(response, { transportError });
    const meta = responseMeta(response, transportError);

    // Keep a synthetic response object so the viewer can show transport failures
    const normalizedResponse =
      response ??
      (transportError
        ? { success: false, message: transportError, transport_error: true }
        : null);

    return {
      id: `${source || 'log'}-${index}-${header?.[1] || index}`,
      index,
      source,
      timestamp: header?.[1] || '',
      method: header?.[2] || '',
      path: header?.[3] || '',
      request,
      response: normalizedResponse,
      userAgent: metaLine(block, 'User Agent'),
      url: metaLine(block, 'URL'),
      sessionId: metaLine(block, 'Session ID'),
      encryptedCount:
        countEncrypted(request) + countEncrypted(normalizedResponse),
      outcome,
      statusCode: meta.statusCode,
      statusMessage: meta.statusMessage,
      transportError: transportError || '',
      raw: block,
    };
  });
}

/**
 * Apply secret key decryption across request/response of an entry.
 */
export function decryptLogEntry(entry, secretKey) {
  const req = decryptLogValue(entry.request, secretKey);
  const res = decryptLogValue(entry.response, secretKey);
  const response = res.value;
  const transportError = entry.transportError || '';
  const outcome = classifyLogStatus(response, { transportError });
  const meta = responseMeta(response, transportError);

  return {
    ...entry,
    request: req.value,
    response,
    decryptedCount: req.decryptedCount + res.decryptedCount,
    failedCount: req.failedCount + res.failedCount,
    outcome,
    statusCode: meta.statusCode,
    statusMessage: meta.statusMessage || transportError,
  };
}

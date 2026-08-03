const ENCRYPTED_KEYS = [
  'data',
  'encrypted',
  'ciphertext',
  'payload',
  'encryptedData',
  'encrypted_data',
  'response',
  'result',
  'body',
  'message',
  'content',
];

const CIPHER_PREFIX = 'U2FsdGVkX1';

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, '');
}

function looksLikeEncryptedBase64(value) {
  const compact = collapseWhitespace(value);
  if (!compact || compact.startsWith('{') || compact.startsWith('[')) return false;
  if (compact.startsWith(CIPHER_PREFIX)) return true;
  return /^[A-Za-z0-9+/]+=*$/.test(compact) && compact.length > 16;
}

function findEncryptedValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (looksLikeEncryptedBase64(trimmed)) return collapseWhitespace(trimmed);
    try {
      return findEncryptedValue(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEncryptedValue(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== 'object') return null;

  for (const key of ENCRYPTED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = findEncryptedValue(value[key]);
      if (found) return found;
    }
  }

  for (const nested of Object.values(value)) {
    const found = findEncryptedValue(nested);
    if (found) return found;
  }

  return null;
}

/**
 * Normalize pasted ciphertext — unwrap JSON wrappers like { "data": "U2FsdGVkX1..." }.
 * @param {string} raw
 * @returns {{ value: string, cleaned: boolean }}
 */
export function extractEncryptedInput(raw) {
  let value = stripQuotes(String(raw ?? '').trim());
  if (!value) return { value: '', cleaned: false };

  if (looksLikeEncryptedBase64(value)) {
    const compact = collapseWhitespace(value);
    return { value: compact, cleaned: compact !== value };
  }

  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      const extracted = findEncryptedValue(parsed);
      if (extracted) return { value: extracted, cleaned: true };
    } catch {
      // Fall through to raw value.
    }
  }

  return { value, cleaned: false };
}

const STORAGE_KEY = 'decrypter-history';
const MAX_ITEMS = 50;

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getHistory() {
  return load();
}

export function addHistoryEntry({ output, inputPreview }) {
  const items = load();
  const entry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    output,
    inputPreview: inputPreview.slice(0, 80),
  };
  items.unshift(entry);
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
  save(items);
  return entry;
}

export function removeHistoryEntry(id) {
  const items = load().filter((e) => e.id !== id);
  save(items);
  return items;
}

export function clearHistory() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

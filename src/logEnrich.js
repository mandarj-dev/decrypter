/**
 * Lightweight display fields cached on each log entry after parse.
 * Avoids calling buildLogView for every list row / filter pass.
 */
import { buildLogView, detectEntryKind } from './logView.js';

export function enrichLogEntry(entry) {
  const view = buildLogView(entry);
  let host = '';
  try {
    host = entry.url ? new URL(entry.url).hostname.replace('.shipdelight.in', '') : '';
  } catch {
    host = '';
  }

  const timeShort = entry.timestamp
    ? entry.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z')
    : '';

  return {
    ...entry,
    kind: entry.kind || view.kind,
    orderId: view.title,
    productPreview: view.productPreview,
    host,
    timeShort,
    responsePreview: entry.statusMessage || entry?.response?.message || '',
    _view: view,
  };
}

export function getCachedView(entry) {
  if (entry?._view) return entry._view;
  return buildLogView(entry);
}

export { detectEntryKind };

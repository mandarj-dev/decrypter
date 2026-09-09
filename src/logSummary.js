/**
 * Aggregate log analytics for the Log Reader insights panel.
 */

function bump(map, key, by = 1) {
  const k = key == null || key === '' ? '—' : String(key);
  map.set(k, (map.get(k) || 0) + by);
}

function sortedEntries(map, limit = 8) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

/**
 * @param {Array<object>} entries
 */
export function buildLogSummary(entries) {
  const statusCodes = new Map();
  const hosts = new Map();
  const clients = new Map();
  const issueClients = new Map();
  const messages = new Map();
  const endpoints = new Map();
  const kinds = new Map();

  let success = 0;
  let error = 0;
  let other = 0;

  for (const e of entries) {
    const code = e.statusCode == null ? 'none' : String(e.statusCode);
    bump(statusCodes, code);

    const host = e.host || 'unknown';
    bump(hosts, host);

    const client = e.clientName || e.host || 'Unknown';
    bump(clients, client);

    bump(kinds, e.kind || 'other');

    if (e.outcome === 'success') success++;
    else if (e.outcome === 'error') {
      error++;
      bump(issueClients, client);
      const msg = String(e.statusMessage || e.responsePreview || 'Error').trim() || 'Error';
      bump(messages, msg.length > 72 ? `${msg.slice(0, 72)}…` : msg);
      bump(endpoints, e.path || '—');
    } else other++;
  }

  return {
    total: entries.length,
    success,
    error,
    other,
    statusCodes: sortedEntries(statusCodes, 14),
    hosts: sortedEntries(hosts, 10),
    clients: sortedEntries(clients, 10),
    issueClients: sortedEntries(issueClients, 10),
    topMessages: sortedEntries(messages, 6),
    errorEndpoints: sortedEntries(endpoints, 6),
    kinds: sortedEntries(kinds, 8),
    uniqueClients: clients.size,
    uniqueHosts: hosts.size,
    uniqueIssueClients: issueClients.size,
  };
}

/**
 * Unique option lists for filter dropdowns.
 * @param {Array<object>} entries
 */
export function buildFilterOptions(entries) {
  const statuses = new Set();
  const hosts = new Set();
  const clients = new Set();

  for (const e of entries) {
    statuses.add(e.statusCode == null ? 'none' : String(e.statusCode));
    if (e.host) hosts.add(e.host);
    const client = e.clientName || e.host;
    if (client) clients.add(client);
  }

  const sortAlpha = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  const sortStatus = (a, b) => {
    if (a === 'none') return 1;
    if (b === 'none') return -1;
    return Number(a) - Number(b) || a.localeCompare(b);
  };

  return {
    statuses: [...statuses].sort(sortStatus),
    hosts: [...hosts].sort(sortAlpha),
    clients: [...clients].sort(sortAlpha),
  };
}

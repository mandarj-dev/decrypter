/**
 * Helpers to turn a parsed/decrypted log entry into a simplified view model.
 */

function asObject(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function deepFind(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '') {
      return obj[key];
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = deepFind(value, keys);
      if (found != null && found !== '') return found;
    }
  }
  return undefined;
}

/**
 * Normalize request payload — prefer req_body, else decrypted data object.
 */
export function getRequestPayload(entry) {
  const req = asObject(entry?.request) || {};
  if (req.req_body != null) {
    const body = asObject(req.req_body) || req.req_body;
    return { payload: body, wrapper: req };
  }
  if (req.data != null) {
    const data = asObject(req.data);
    if (data) return { payload: data, wrapper: req };
    return { payload: { data: req.data }, wrapper: req, encrypted: typeof req.data === 'string' };
  }
  return { payload: req, wrapper: req };
}

export function detectEntryKind(entry) {
  const path = String(entry?.path || '').toLowerCase();
  const { payload } = getRequestPayload(entry);
  const type = String(payload?.type || '').toLowerCase();

  if (path.includes('payment-gateway') || path.includes('razorpay-payment') || path.includes('payment')) {
    if (path.includes('status') || path.includes('verify')) return 'status';
    return 'pay';
  }
  if (type === 'exchange' || path.includes('exchange')) return 'exchange';
  if (type === 'return' || path.includes('return')) return 'return';
  if (entry?.outcome === 'error') return 'failed';
  return 'other';
}

function formatMoney(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    const day = d.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    const time = d.toLocaleString('en-GB', {
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

/** Best-effort client / store label for filters and issue summaries. */
export function extractClientName(entry, payload, payment) {
  if (payment?.clientName && payment.clientName !== '—') return String(payment.clientName);
  const fromPayload = deepFind(payload, [
    'client_name',
    'clientName',
    'shop_name',
    'store_name',
    'merchant_name',
    'prefill_client_name',
  ]);
  if (fromPayload) return String(fromPayload);
  const addr = payload?.address;
  if (addr?.name) return String(addr.name);
  if (addr?.email) return String(addr.email);
  if (addr?.email_id) return String(addr.email_id);
  return '';
}

function extractPayment(entry, kind, payload) {
  const res = entry?.response && typeof entry.response === 'object' ? entry.response : {};
  const d = res.data && typeof res.data === 'object' ? res.data : {};
  const req = asObject(entry?.request) || {};
  const reqData = asObject(req.data) || payload || {};

  if (kind === 'pay') {
    return {
      clientName: d.client_name || d.prefill_client_name || '—',
      amount: d.amount ?? null,
      gateway: d.payment_gateway || '—',
      gatewayOrderId: d.order_id || '—',
      gatewayUsername: d.payment_gateway_username || '—',
      createdAt: d.created_at || null,
      email: d.email || '—',
      phone: d.phone_no || '—',
      status: d.status || '—',
    };
  }

  if (kind === 'status') {
    const signature = res.payment_gateway_signature || '';
    const generatedSignature = res.payment_gateway_generated_signature || '';
    return {
      transactionId: res.payment_gateway_transaction_id || reqData.razorpay_payment_id || '—',
      orderId: reqData.order_id || reqData.razorpay_order_id || '—',
      paymentSource: res.payment_source || '—',
      capturedSource: res.payment_captured_source || '—',
      capturedAt: res.payment_captured_at || '—',
      updatedAt: res.updated_at || '—',
      payStatus: res.status || '—',
      signature,
      generatedSignature,
      sigMatch: Boolean(signature && generatedSignature && signature === generatedSignature),
    };
  }

  return null;
}

function buildTimeline(entry, kind, payload) {
  const success = entry.outcome === 'success';
  const error = entry.outcome === 'error';

  if (kind === 'pay' || kind === 'status') {
    return [
      { label: 'Request Received', done: true },
      { label: 'Validated', done: !error || success },
      { label: success ? 'Payment OK' : error ? 'Payment Failed' : 'Processed', done: success, failed: error },
      { label: 'Completed', done: success, failed: error && false },
    ];
  }

  const hasPickup = Boolean(payload?.scheduled_pickup_date);
  return [
    { label: 'Request Received', done: true },
    { label: 'Parsed & Validated', done: true, failed: error && !success },
    {
      label: success ? 'Order Created' : error ? 'Create Failed' : 'Processing',
      done: success,
      failed: error,
    },
    {
      label: hasPickup ? 'Pickup Scheduled' : 'Awaiting Pickup',
      done: success && hasPickup,
      failed: error,
    },
  ];
}

function extractProducts(payload) {
  const packages = Array.isArray(payload?.packages) ? payload.packages : [];
  return packages.map((pkg) => ({
    name: pkg.description || pkg.product_description || payload?.product_description || 'Product',
    sku: pkg.sku || '',
    qty: pkg.quantity ?? 1,
    price: formatMoney(pkg.price),
    reason: pkg.reason || '',
    note: pkg.note || pkg.notes || '',
    image: pkg.image_url || '',
    variantId: pkg.variant_id,
    productId: pkg.product_id,
  }));
}

function extractAddress(payload) {
  const a = payload?.address;
  if (!a || typeof a !== 'object') return null;
  const lines = [
    [a.address1, a.address2].filter(Boolean).join(', '),
    [a.city, a.state].filter(Boolean).join(', '),
    a.pincode ? String(a.pincode) : '',
  ].filter(Boolean);
  return {
    name: a.name || a.firstname || [a.firstname, a.lastname].filter(Boolean).join(' ') || '',
    phone: a.phone || '',
    email: a.email || a.email_id || '',
    lines,
    full: lines.join(', '),
  };
}

function extractRefund(payload) {
  const summary = payload?.refund_summary?.reverse_order || payload?.refund_summary || null;
  const payment = payload?.refund_payment || {};
  if (!summary && !payment.refund_mode && payload?.pending_payment_amount == null) return null;

  const reverse = payload?.refund_summary?.reverse_order || summary;
  return {
    original: formatMoney(reverse?.total_amount),
    discount: formatMoney(reverse?.total_discount ?? 0),
    tax: formatMoney(reverse?.total_tax ?? 0),
    reverseFees: formatMoney(reverse?.reverse_fees ?? payload?.reverse_fees ?? 0),
    total: formatMoney(
      reverse?.final_total_amount ?? payload?.pending_payment_amount ?? reverse?.total_amount
    ),
    mode: payment.refund_mode || '',
    bankName: payment.bank_name || '',
    accountName: payment.account_name || '',
    upi: payment.upi_id || '',
  };
}

/**
 * Build a view-model for the simplified log detail viewer.
 * @param {object} entry
 */
export function buildLogView(entry) {
  const { payload, encrypted } = getRequestPayload(entry);
  const kind = detectEntryKind(entry);
  const orderId =
    payload?.orderno ||
    payload?.order_id ||
    deepFind(payload, ['orderno', 'order_id', 'orderId']) ||
    entry?.response?.data?.return_exchange_order_id ||
    entry?.response?.data?.order_id ||
    null;

  const products = extractProducts(payload);
  const payment = extractPayment(entry, kind, payload);
  const title =
    (kind === 'pay' && payment?.gatewayOrderId && payment.gatewayOrderId !== '—'
      ? payment.gatewayOrderId
      : null) ||
    (kind === 'status' && payment?.transactionId && payment.transactionId !== '—'
      ? payment.transactionId
      : null) ||
    orderId ||
    (kind === 'pay' ? 'Payment request' : kind === 'status' ? 'Payment status' : null) ||
    entry.path ||
    'Log entry';

  const productPreview =
    (kind === 'pay' && payment
      ? `${payment.clientName || ''} · ₹${payment.amount ?? '—'}`
      : null) ||
    (kind === 'status' && payment
      ? `${payment.paymentSource || ''} · ${payment.payStatus || ''}`
      : null) ||
    products[0]?.name ||
    payload?.product_description ||
    entry?.statusMessage ||
    entry.path ||
    '';

  const clientName = extractClientName(entry, payload, payment);

  return {
    title: String(title),
    kind,
    outcome: entry.outcome || 'other',
    statusCode: entry.statusCode,
    statusMessage: entry.statusMessage || entry?.response?.message || '',
    timestamp: formatTimestamp(entry.timestamp),
    timestampRaw: entry.timestamp,
    endpoint: entry.path || '',
    method: entry.method || '',
    pickupDate: payload?.scheduled_pickup_date || '—',
    storeUrl: entry.url || '',
    source: entry.source || '',
    encrypted: Boolean(encrypted),
    clientName,
    timeline: buildTimeline(entry, kind, payload),
    products,
    productPreview: String(productPreview).trim(),
    address: extractAddress(payload),
    refund: extractRefund(payload),
    payment,
    notes: payload?.notes || products.map((p) => p.note).filter(Boolean).join('; ') || '',
    request: entry.request,
    response: entry.response,
    payload,
    raw: entry.raw || '',
  };
}

export function kindLabel(kind) {
  switch (kind) {
    case 'return':
      return 'return';
    case 'exchange':
      return 'exchange';
    case 'pay':
      return 'payment';
    case 'status':
      return 'pay · status';
    case 'failed':
      return 'failed';
    default:
      return 'other';
  }
}

const API_BASE = 'https://api.mxmerchant.com/checkout/v3';
const CACHE_MS = 5 * 60 * 1000;

let cache;

const configured = () => Boolean(process.env.MX_API_KEY && process.env.MX_API_SECRET);
const authHeaders = () => ({
  accept: 'application/json',
  authorization: `Basic ${Buffer.from(`${process.env.MX_API_KEY}:${process.env.MX_API_SECRET}`).toString('base64')}`
});
const mmddyyyy = value => {
  const date = new Date(value);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
};
const request = async pathname => {
  const response = await fetch(`${API_BASE}${pathname}`, { headers: authHeaders(), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`MX Merchant returned HTTP ${response.status}`);
  return response.json();
};

export async function getMxChargebacks({ force = false } = {}) {
  if (!configured()) return { configured: false, connected: false, records: [], count: 0, total: 0 };
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.value;

  try {
    let merchantId = process.env.MX_MERCHANT_ID;
    if (!merchantId) {
      const merchants = await request('/merchant?limit=100&offset=0');
      merchantId = merchants.records?.find(record => record.canProcessPayment)?.id || merchants.records?.[0]?.id;
    }
    if (!merchantId) throw new Error('No MX merchant account is available');

    const startDate = encodeURIComponent(process.env.MX_CHARGEBACK_START_DATE || `01/01/${new Date().getUTCFullYear()}`);
    const endDate = encodeURIComponent(mmddyyyy(new Date()));
    const records = [];
    let offset = 0;
    let recordCount = 0;
    do {
      const page = await request(`/report/chargeback?merchantId=${encodeURIComponent(merchantId)}&dateTypeFilter=Custom&startDate=${startDate}&endDate=${endDate}&limit=1000&offset=${offset}`);
      const batch = Array.isArray(page.records) ? page.records : [];
      records.push(...batch);
      recordCount = Number(page.recordCount || records.length);
      offset += batch.length;
      if (!batch.length) break;
    } while (offset < recordCount);

    const normalized = records.map((record, index) => ({
      processor_case_id: `mx-${merchantId}-${record.applicationId || record.created || index}`,
      transaction_id: '',
      amount: Number(record.amount || 0),
      status: 'open',
      reason: record.reasonCodeDescription || record.reasonCode || 'MX Merchant chargeback',
      occurred_at: record.workOfDate || record.created,
      processor_type: 'mx_merchant',
      first_name: '',
      last_name: '',
      email: '',
      product_name: record.cardType ? `${record.cardType} ending ${record.last4 || 'unknown'}` : 'MX Merchant dispute'
    }));
    const value = {
      configured: true,
      connected: true,
      merchantId: String(merchantId),
      records: normalized,
      count: normalized.length,
      total: normalized.reduce((sum, record) => sum + record.amount, 0),
      syncedAt: new Date().toISOString()
    };
    cache = { fetchedAt: Date.now(), value };
    return value;
  } catch (error) {
    const value = { configured: true, connected: false, records: [], count: 0, total: 0, error: error.message };
    if (cache?.value?.connected) return { ...cache.value, stale: true, error: error.message };
    return value;
  }
}

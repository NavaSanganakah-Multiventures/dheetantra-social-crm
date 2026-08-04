const CF_API = 'https://api.cloudflare.com/client/v4';

export type CFCreds = { token: string | null; accountId: string | null };

export class CloudflareApiError extends Error {
  status: number;
  errors: any[];
  constructor(status: number, message: string, errors: any[] = []) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.errors = errors;
  }
}

export async function getCloudflareCredentials(env: any): Promise<CFCreds> {
  const token = await env.SECRETS_KV?.get('CLOUDFLARE_API_TOKEN');
  const accountId = await env.SECRETS_KV?.get('CLOUDFLARE_ACCOUNT_ID');
  return { token, accountId };
}

async function cfFetchCreds(creds: CFCreds, path: string, options: RequestInit = {}) {
  if (!creds.token) {
    throw new CloudflareApiError(500, 'Cloudflare API token not configured. Set CLOUDFLARE_API_TOKEN in SECRETS_KV.');
  }

  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    // 8s per-call cap: onboarding/verify chains run several sequential CF
    // calls inside user requests (30s Worker budget). Without a timeout a
    // hung/rate-limited Cloudflare response can kill the request mid-onboarding
    // with CF state mutated but DB not updated. Callers may override via
    // options.signal (which takes precedence over the default timeout).
    signal: options.signal || AbortSignal.timeout(8000),
  });

  const data: any = await res.json().catch(() => null);

  if (!res.ok || (data && data.success === false)) {
    const errors = data?.errors || [];
    // Include Cloudflare error codes (e.g. "[81009] Invalid rule operation")
    // so failures are diagnosable from the domain error_message in the admin UI.
    const message = errors.map((e: any) => `${e?.code ? `[${e.code}] ` : ''}${e.message}`).join('; ') || `Cloudflare API error (${res.status})`;
    throw new CloudflareApiError(res.status, message, errors);
  }

  return data?.result;
}

// Public helper for one-off calls: fetches credentials itself.
// Multi-step flows (onboarding, verification) should fetch credentials once
// and pass them in to avoid repeated KV reads.
export async function cfFetch(env: any, path: string, options: RequestInit = {}) {
  const creds = await getCloudflareCredentials(env);
  return cfFetchCreds(creds, path, options);
}

// ==========================================
// ZONES
// ==========================================

export async function createZone(env: any, domain: string, type: 'full' | 'partial', creds?: CFCreds) {
  const c = creds ?? await getCloudflareCredentials(env);
  if (!c.accountId) {
    throw new CloudflareApiError(500, 'Cloudflare account ID not configured. Set CLOUDFLARE_ACCOUNT_ID in SECRETS_KV.');
  }
  return cfFetchCreds(c, '/zones', {
    method: 'POST',
    body: JSON.stringify({ name: domain, account: { id: c.accountId }, type }),
  });
}

// Adopt an already-existing Cloudflare zone by domain name (idempotent onboarding)
export async function findZone(env: any, domain: string, creds?: CFCreds) {
  const zones = await cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones?name=${encodeURIComponent(domain)}`);
  if (Array.isArray(zones) && zones.length) return zones[0];
  return null;
}

export async function getZone(env: any, zoneId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}`);
}

export async function deleteZone(env: any, zoneId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}`, { method: 'DELETE' });
}

// ==========================================
// EMAIL ROUTING
// ==========================================

export async function enableEmailRouting(env: any, zoneId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}/email/routing/enable`, { method: 'POST', body: '{}' });
}

export async function addEmailRoutingDns(env: any, zoneId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}/email/routing/dns`, { method: 'POST' });
}

export async function listRoutingRules(env: any, zoneId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}/email/routing/rules`);
}

export async function deleteRoutingRule(env: any, zoneId: string, ruleId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}/email/routing/rules/${ruleId}`, { method: 'DELETE' });
}

export async function createCatchAllRule(env: any, zoneId: string, workerName: string, creds?: CFCreds) {
  // Catch-all is a zone singleton and is ONLY manageable through the dedicated
  // /email/routing/rules/catch_all endpoint (PUT = upsert). POSTing a rule
  // with matchers [{type:'all'}] to /email/routing/rules is rejected by
  // Cloudflare with "Invalid rule operation", which blocked every domain's
  // onboarding. This mirrors what wrangler does for `addresses = ["*@domain"]`.
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: 'PUT',
    body: JSON.stringify({
      matchers: [{ type: 'all' }],
      actions: [{ type: 'worker', value: [workerName] }],
      enabled: true,
      name: 'DheeTantra inbox catch-all',
    }),
  });
}

// Catch-all rules cannot be removed via DELETE /rules/{id}; the supported
// teardown is resetting the singleton to a disabled drop rule (idempotent).
export async function resetCatchAllRule(env: any, zoneId: string, creds?: CFCreds) {
  return cfFetchCreds(creds ?? await getCloudflareCredentials(env), `/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: 'PUT',
    body: JSON.stringify({
      matchers: [{ type: 'all' }],
      actions: [{ type: 'drop' }],
      enabled: false,
      name: '',
    }),
  });
}

// ==========================================
// DNS RECORDS (for displaying MX/SPF/DKIM/DMARC)
// ==========================================

export async function listZoneDnsRecords(env: any, zoneId: string, creds?: CFCreds): Promise<any[]> {
  const c = creds ?? await getCloudflareCredentials(env);
  const records: any[] = [];
  let page = 1;
  for (;;) {
    const result = await cfFetchCreds(c, `/zones/${zoneId}/dns_records?per_page=100&page=${page}`);
    if (!Array.isArray(result)) break;
    records.push(...result);
    if (result.length < 100) break;
    page++;
  }
  return records;
}

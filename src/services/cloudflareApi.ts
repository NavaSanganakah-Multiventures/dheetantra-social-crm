const CF_API = 'https://api.cloudflare.com/client/v4';

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

export async function getCloudflareCredentials(env: any) {
  const token = await env.SECRETS_KV?.get('CLOUDFLARE_API_TOKEN');
  const accountId = await env.SECRETS_KV?.get('CLOUDFLARE_ACCOUNT_ID');
  return { token, accountId };
}

export async function cfFetch(env: any, path: string, options: RequestInit = {}) {
  const { token } = await getCloudflareCredentials(env);
  if (!token) {
    throw new CloudflareApiError(500, 'Cloudflare API token not configured. Set CLOUDFLARE_API_TOKEN in SECRETS_KV.');
  }

  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data: any = await res.json().catch(() => null);

  if (!res.ok || (data && data.success === false)) {
    const errors = data?.errors || [];
    const message = errors.map((e: any) => e.message).join('; ') || `Cloudflare API error (${res.status})`;
    throw new CloudflareApiError(res.status, message, errors);
  }

  return data?.result;
}

// ==========================================
// ZONES
// ==========================================

export async function createZone(env: any, domain: string, type: 'full' | 'partial') {
  const { accountId } = await getCloudflareCredentials(env);
  if (!accountId) {
    throw new CloudflareApiError(500, 'Cloudflare account ID not configured. Set CLOUDFLARE_ACCOUNT_ID in SECRETS_KV.');
  }
  return cfFetch(env, '/zones', {
    method: 'POST',
    body: JSON.stringify({ name: domain, account: { id: accountId }, type }),
  });
}

// Adopt an already-existing Cloudflare zone by domain name (idempotent onboarding)
export async function findZone(env: any, domain: string) {
  const zones = await cfFetch(env, `/zones?name=${encodeURIComponent(domain)}`);
  if (Array.isArray(zones) && zones.length) return zones[0];
  return null;
}

export async function getZone(env: any, zoneId: string) {
  return cfFetch(env, `/zones/${zoneId}`);
}

export async function deleteZone(env: any, zoneId: string) {
  return cfFetch(env, `/zones/${zoneId}`, { method: 'DELETE' });
}

// ==========================================
// EMAIL ROUTING
// ==========================================

export async function enableEmailRouting(env: any, zoneId: string) {
  return cfFetch(env, `/zones/${zoneId}/email/routing/enable`, { method: 'POST', body: '{}' });
}

export async function addEmailRoutingDns(env: any, zoneId: string) {
  return cfFetch(env, `/zones/${zoneId}/email/routing/dns`, { method: 'POST' });
}

export async function listRoutingRules(env: any, zoneId: string) {
  return cfFetch(env, `/zones/${zoneId}/email/routing/rules`);
}

export async function deleteRoutingRule(env: any, zoneId: string, ruleId: string) {
  return cfFetch(env, `/zones/${zoneId}/email/routing/rules/${ruleId}`, { method: 'DELETE' });
}

export async function createCatchAllRule(env: any, zoneId: string, workerName: string) {
  return cfFetch(env, `/zones/${zoneId}/email/routing/rules`, {
    method: 'POST',
    body: JSON.stringify({
      matchers: [{ type: 'all' }],
      actions: [{ type: 'worker', value: [workerName] }],
      enabled: true,
      name: 'DheeTantra inbox catch-all',
    }),
  });
}

// ==========================================
// DNS RECORDS (for displaying MX/SPF/DKIM/DMARC)
// ==========================================

export async function listZoneDnsRecords(env: any, zoneId: string): Promise<any[]> {
  const records: any[] = [];
  let page = 1;
  for (;;) {
    const result = await cfFetch(env, `/zones/${zoneId}/dns_records?per_page=100&page=${page}`);
    if (!Array.isArray(result)) break;
    records.push(...result);
    if (result.length < 100) break;
    page++;
  }
  return records;
}

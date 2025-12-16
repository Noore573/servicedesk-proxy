import { env } from './env.js';

/* =========================
   TYPES
========================= */

// Normalized account shape
export interface NormalizedAccount {
  externalId: string;
  name: string | null;
  site: string | null;
  isActive: boolean;
}

// ServiceDesk request type (raw, pass-through)
export type ServiceDeskRequest = any;

// Fetch response helpers
interface ListInfo {
  has_more_rows?: boolean;
  row_count?: number;
  start_index?: number;
}

interface RequestsResponse {
  requests?: ServiceDeskRequest[];
  list_info?: ListInfo;
}

/* =========================
   LOGGING
========================= */

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }));
}

/* =========================
   FETCH WITH RETRY
========================= */

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  timeoutMs = 15000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }

      if (attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        log('warn', `Retrying request in ${backoffMs}ms`, { url });
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
  }

  throw lastError || new Error('Request failed');
}

/* =========================
   ACCOUNTS (UNCHANGED)
========================= */

export async function fetchAllAccounts(maxPages = 10): Promise<NormalizedAccount[]> {
  const allAccounts: NormalizedAccount[] = [];
  let page = 1;
  const rowCount = 100;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const inputData = JSON.stringify({
      list_info: {
        row_count: rowCount,
        start_index: (page - 1) * rowCount + 1,
      },
    });

    const url = new URL(`${env.SERVICEDESK_BASE_URL}/api/v3/accounts`);
    url.searchParams.set('input_data', inputData);

    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        authtoken: env.SERVICEDESK_AUTHTOKEN,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Accounts fetch failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data.accounts)) {
      allAccounts.push(...data.accounts.map((a: any) => ({
        externalId: a.id?.toString() ?? '',
        name: a.name ?? null,
        site: a.site?.name ?? null,
        isActive: a.status?.name?.toLowerCase() === 'active',
      })));
    }

    hasMore = data.list_info?.has_more_rows === true;
    page++;
  }

  return allAccounts;
}

/* =========================
   REQUESTS (NEW)
========================= */

export async function fetchAllRequests(accountName: string): Promise<ServiceDeskRequest[]> {
  const allRequests: ServiceDeskRequest[] = [];
  let startIndex = 1;
  const rowCount = 100;
  let hasMore = true;

  log('info', 'Starting requests fetch', { accountName });

  while (hasMore) {
    const inputData = JSON.stringify({
      list_info: {
        start_index: startIndex,
        row_count: rowCount,
        search_fields: {
          'account.name': accountName,
        },
      },
    });

    const url = new URL(`${env.SERVICEDESK_BASE_URL}/api/v3/requests`);
    url.searchParams.set('input_data', inputData);

    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        authtoken: env.SERVICEDESK_AUTHTOKEN,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Requests fetch failed: ${response.statusText}`);
    }

    const data: RequestsResponse = await response.json();
    const batch = data.requests ?? [];

    allRequests.push(...batch);

    hasMore = data.list_info?.has_more_rows === true;
    startIndex += rowCount;
  }

  log('info', 'Requests fetch completed', { total: allRequests.length });
  return allRequests;
}

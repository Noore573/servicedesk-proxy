import { env } from './env.js';

// Normalized account shape for internal use
export interface NormalizedAccount {
  externalId: string;
  name: string | null;
  site: string | null;
  isActive: boolean;
}

// ServiceDesk Plus API response types
interface ServiceDeskAccount {
  id?: string;
  name?: string;
  site?: { name?: string };
  status?: { name?: string };
  [key: string]: unknown;
}

interface ListInfo {
  has_more_rows?: boolean;
  total_count?: number;
  row_count?: number;
  page?: number;
}

interface AccountsResponse {
  accounts?: ServiceDeskAccount[];
  list_info?: ListInfo;
  response_status?: { status_code?: number; status?: string };
}

// Fetch with timeout and retry logic
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
      
      // Don't retry on abort or non-transient errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        log('warn', `Retry attempt ${attempt + 1} after ${backoffMs}ms`, { url });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

// Structured logging helper
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

// Normalize a single account to internal shape
function normalizeAccount(account: ServiceDeskAccount): NormalizedAccount {
  return {
    externalId: account.id?.toString() ?? '',
    name: account.name ?? null,
    site: account.site?.name ?? null,
    isActive: account.status?.name?.toLowerCase() === 'active',
  };
}

// Fetch all accounts with pagination
export async function fetchAllAccounts(maxPages = 10): Promise<NormalizedAccount[]> {
  const allAccounts: NormalizedAccount[] = [];
  let page = 1;
  const rowCount = 100; // Rows per page
  let hasMore = true;

  log('info', 'Starting accounts fetch', { maxPages, rowCount });

  while (hasMore && page <= maxPages) {
    const inputData = JSON.stringify({
      list_info: {
        row_count: rowCount,
        start_index: (page - 1) * rowCount + 1,
        sort_field: 'name',
        sort_order: 'asc',
      },
    });

    const url = new URL(`${env.SERVICEDESK_BASE_URL}/api/v3/accounts`);
    url.searchParams.set('input_data', inputData);

    log('info', 'Fetching accounts page', { page, startIndex: (page - 1) * rowCount + 1 });

    const response = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'authtoken': env.SERVICEDESK_AUTHTOKEN,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log('error', 'ServiceDesk API error', { 
        status: response.status, 
        statusText: response.statusText,
        // Never log the actual error body in production as it might contain sensitive info
        hasError: true 
      });
      throw new Error(`ServiceDesk API returned ${response.status}: ${response.statusText}`);
    }

    const data: AccountsResponse = await response.json();

    if (data.accounts && Array.isArray(data.accounts)) {
      const normalized = data.accounts.map(normalizeAccount);
      allAccounts.push(...normalized);
      log('info', 'Page fetched successfully', { 
        page, 
        accountsInPage: data.accounts.length,
        totalSoFar: allAccounts.length 
      });
    }

    // Check if there are more rows
    hasMore = data.list_info?.has_more_rows === true;
    page++;
  }

  log('info', 'Accounts fetch complete', { 
    totalAccounts: allAccounts.length, 
    pagesProcessed: page - 1,
    reachedMaxPages: page > maxPages 
  });

  return allAccounts;
}

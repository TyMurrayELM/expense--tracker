import crypto from 'crypto';

interface NetSuiteConfig {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

export class NetSuiteClient {
  private config: NetSuiteConfig;
  private baseUrl: string;

  constructor(config: NetSuiteConfig) {
    this.config = config;
    // Remove _SB1 suffix if present for the base URL
    const cleanAccountId = config.accountId.replace(/_SB\d+$/, '');
    this.baseUrl = `https://${cleanAccountId}.suitetalk.api.netsuite.com`;
  }

  private generateOAuthHeader(method: string, url: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('base64');

    // Parse URL to separate base URL and query params
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.origin}${urlObj.pathname}`;
    
    const params: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_token: this.config.tokenId,
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0',
    };

    // Add query parameters to OAuth params for signature
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Create base string
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const baseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;

    // Create signing key
    const signingKey = `${encodeURIComponent(this.config.consumerSecret)}&${encodeURIComponent(this.config.tokenSecret)}`;

    // Generate signature
    const signature = crypto
      .createHmac('sha256', signingKey)
      .update(baseString)
      .digest('base64');

    // Build OAuth header (only OAuth params, not query params)
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_token: this.config.tokenId,
      oauth_signature_method: 'HMAC-SHA256',
      oauth_timestamp: timestamp,
      oauth_nonce: nonce,
      oauth_version: '1.0',
      oauth_signature: signature,
    };

    const authHeader = 'OAuth realm="' + this.config.accountId + '",' +
      Object.keys(oauthParams)
        .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
        .join(',');

    return authHeader;
  }

  async makeRequest(endpoint: string, method: string = 'GET', body?: any) {
    const url = `${this.baseUrl}${endpoint}`;
    const authHeader = this.generateOAuthHeader(method, url);

    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'transient',
    };

    const options: RequestInit = {
      method,
      headers,
      // Without a timeout a half-open connection hangs the whole sync until the
      // platform kills the function (and leaves the sync_log stuck "running").
      signal: AbortSignal.timeout(30000),
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NetSuite API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async searchVendorBillsFull(fromDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      throw new Error(`Invalid date format: ${fromDate}. Expected YYYY-MM-DD.`);
    }

    // Single query fetches bill details + every expense line + vendor name.
    // line_amount uses foreignamount as-is (not negated, not ABS'd): NetSuite
    // stores vendor-bill expense lines with POSITIVE foreignamount, so the raw
    // value is already the reported spend, while genuine credit/discount lines
    // stay negative (ABS would flip a -$50 adjustment into +$50 of spend, and
    // negation would turn every normal expense line negative).
    const query = `
      SELECT
        t.id,
        t.tranid,
        t.trandate,
        t.entity,
        ABS(t.foreigntotal) as bill_total,
        tl.foreignamount as line_amount,
        t.memo as header_memo,
        BUILTIN.DF(t.status) as status_display,
        BUILTIN.DF(t.currency) as currency_display,
        BUILTIN.DF(t.entity) as vendor_name,
        BUILTIN.DF(tl.department) as department_name,
        BUILTIN.DF(tl.location) as location_name,
        BUILTIN.DF(tl.account) as account_name,
        tl.memo as line_memo,
        tl.linesequencenumber
      FROM transaction t
      LEFT JOIN transactionLine tl ON t.id = tl.transaction AND tl.mainline = 'F'
      WHERE t.type = 'VendBill'
        AND t.trandate >= TO_DATE('${fromDate}', 'YYYY-MM-DD')
      ORDER BY t.id, tl.linesequencenumber
    `;

    console.log('Executing bulk SuiteQL query for vendor bills with details...');

    try {
      const allRows: any[] = [];
      const PAGE_SIZE = 1000;
      // Safety bound far above any realistic expense-line-row count. This query
      // returns one row per expense line, so the total can be several times the
      // bill count. If we ever hit this cap we throw (below) rather than silently
      // truncating: a partial result would make the caller treat the missing
      // bills as deleted "stragglers" and remove them from Supabase.
      const MAX_PAGES = 200;

      let complete = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * PAGE_SIZE;
        console.log(`Fetching page ${page + 1} at offset ${offset}...`);

        const response = await this.makeRequest(
          `/services/rest/query/v1/suiteql?limit=${PAGE_SIZE}&offset=${offset}`,
          'POST',
          { q: query }
        );

        const items = response.items || [];
        allRows.push(...items);

        console.log(`Page ${page + 1}: received ${items.length} rows (total so far: ${allRows.length})`);

        if (items.length < PAGE_SIZE) {
          console.log('Last page reached');
          complete = true;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (!complete) {
        throw new Error(
          `NetSuite vendor-bill query exceeded ${MAX_PAGES} pages (${MAX_PAGES * PAGE_SIZE} rows) ` +
          `without reaching the end; aborting to avoid a truncated sync that would delete valid bills.`
        );
      }

      // Return one record per row (one per expense line)
      const records = allRows.map(row => ({
        id: row.id,
        tranid: row.tranid,
        trandate: row.trandate,
        entity: row.entity,
        line_amount: row.line_amount != null ? parseFloat(row.line_amount) : null,
        bill_total: parseFloat(row.bill_total) || 0,
        header_memo: row.header_memo,
        status: row.status_display,
        currency: row.currency_display || 'USD',
        vendor_name: row.vendor_name || `Vendor ID: ${row.entity}`,
        department: row.department_name || null,
        branch: row.location_name || null,
        category: row.account_name || null,
        line_memo: row.line_memo || null,
        linesequencenumber: row.linesequencenumber != null ? row.linesequencenumber.toString() : null,
      }));

      console.log(`Bulk query complete: ${records.length} rows (expense lines)`);
      return records;
    } catch (error) {
      console.error('Bulk SuiteQL Error:', error);
      throw error;
    }
  }

}

export function createNetSuiteClient(): NetSuiteClient {
  const required = ['NETSUITE_ACCOUNT_ID', 'NETSUITE_CONSUMER_KEY', 'NETSUITE_CONSUMER_SECRET', 'NETSUITE_TOKEN_ID', 'NETSUITE_TOKEN_SECRET'] as const;
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const config: NetSuiteConfig = {
    accountId: process.env.NETSUITE_ACCOUNT_ID!,
    consumerKey: process.env.NETSUITE_CONSUMER_KEY!,
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET!,
    tokenId: process.env.NETSUITE_TOKEN_ID!,
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET!,
  };

  return new NetSuiteClient(config);
}

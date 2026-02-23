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

  async searchVendorBills(fromDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      throw new Error(`Invalid date format: ${fromDate}. Expected YYYY-MM-DD.`);
    }

    // Use SuiteQL with only the most basic fields that are guaranteed to exist
    const query = `
      SELECT 
        id,
        tranid,
        trandate,
        entity
      FROM transaction
      WHERE
        type = 'VendBill'
        AND trandate >= TO_DATE('${fromDate}', 'YYYY-MM-DD')
      ORDER BY trandate DESC
    `;

    console.log('Executing SuiteQL query:', query);

    try {
      const allItems: any[] = [];
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 10;

      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * PAGE_SIZE;
        console.log(`Fetching page ${page + 1} at offset ${offset}...`);

        const response = await this.makeRequest(
          `/services/rest/query/v1/suiteql?limit=${PAGE_SIZE}&offset=${offset}`,
          'POST',
          { q: query }
        );

        const items = response.items || [];
        allItems.push(...items);

        console.log(`Page ${page + 1}: received ${items.length} items (total so far: ${allItems.length})`);

        if (items.length < PAGE_SIZE) {
          console.log('Last page reached (received fewer items than page size)');
          break;
        }

        // Small delay between pages to avoid rate limiting
        if (page < MAX_PAGES - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      console.log(`Pagination complete: ${allItems.length} total vendor bills fetched`);
      return { items: allItems, totalResults: allItems.length };
    } catch (error) {
      console.error('SuiteQL Error:', error);
      throw error;
    }
  }

  async searchVendorBillsFull(fromDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      throw new Error(`Invalid date format: ${fromDate}. Expected YYYY-MM-DD.`);
    }

    // Single query fetches bill details + every expense line + vendor name
    const query = `
      SELECT
        t.id,
        t.tranid,
        t.trandate,
        t.entity,
        ABS(t.foreigntotal) as bill_total,
        ABS(tl.foreignamount) as line_amount,
        t.memo as header_memo,
        BUILTIN.DF(t.status) as status_display,
        BUILTIN.DF(t.currency) as currency_display,
        BUILTIN.DF(t.entity) as vendor_name,
        BUILTIN.DF(tl.department) as department_name,
        BUILTIN.DF(tl.location) as location_name,
        BUILTIN.DF(tl.account) as account_name,
        tl.memo as line_memo,
        tl.description as line_description,
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
      const MAX_PAGES = 10;

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
          break;
        }

        if (page < MAX_PAGES - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
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
        line_description: row.line_description || null,
        linesequencenumber: row.linesequencenumber != null ? row.linesequencenumber.toString() : null,
      }));

      console.log(`Bulk query complete: ${records.length} rows (expense lines)`);
      return records;
    } catch (error) {
      console.error('Bulk SuiteQL Error:', error);
      throw error;
    }
  }

  async getVendorDetails(vendorId: string) {
    // Fetch vendor details from the vendor endpoint
    console.log(`Fetching vendor details for ID: ${vendorId}`);
    
    try {
      const response = await this.makeRequest(
        `/services/rest/record/v1/vendor/${vendorId}`,
        'GET'
      );
      
      return response;
    } catch (error) {
      console.error(`Error fetching vendor ${vendorId}:`, error);
      return null;
    }
  }

  async getVendorBillDetails(billId: string) {
    // Fetch full vendor bill details including amount, status, etc.
    console.log(`Fetching bill details for ID: ${billId}`);
    
    try {
      const response = await this.makeRequest(
        `/services/rest/record/v1/vendorBill/${billId}`,
        'GET'
      );
      
      return response;
    } catch (error) {
      console.error(`Error fetching bill ${billId}:`, error);
      return null;
    }
  }

  async getVendorBillExpenseLines(billId: string) {
    // Fetch expense line items for a vendor bill
    console.log(`Fetching expense lines for bill ID: ${billId}`);
    
    try {
      const response = await this.makeRequest(
        `/services/rest/record/v1/vendorBill/${billId}/expense`,
        'GET'
      );
      
      // If we got items with links, fetch the full details for each
      if (response.items && response.items.length > 0) {
        const detailedItems = [];
        
        for (const item of response.items) {
          if (item.links && item.links[0]?.href) {
            try {
              // Extract the path from the full URL
              const url = new URL(item.links[0].href);
              const path = url.pathname;
              
              console.log(`Fetching expense line details from: ${path}`);
              const details = await this.makeRequest(path, 'GET');
              detailedItems.push(details);
            } catch (error) {
              console.error(`Error fetching expense line detail:`, error);
            }
          }
        }
        
        return { items: detailedItems, totalResults: response.totalResults };
      }
      
      return response;
    } catch (error) {
      console.error(`Error fetching expense lines for bill ${billId}:`, error);
      return null;
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

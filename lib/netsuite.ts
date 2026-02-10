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
        AND trandate >= '${fromDate}'
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
  const config: NetSuiteConfig = {
    accountId: process.env.NETSUITE_ACCOUNT_ID!,
    consumerKey: process.env.NETSUITE_CONSUMER_KEY!,
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET!,
    tokenId: process.env.NETSUITE_TOKEN_ID!,
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET!,
  };

  return new NetSuiteClient(config);
}

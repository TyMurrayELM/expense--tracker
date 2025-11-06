/**
 * Bill.com Spend & Expense API Client
 * For syncing Divvy credit card transactions
 */

interface BillConfig {
  apiToken: string;
  baseUrl: string;
}

interface BillTransaction {
  id: string;
  userId: string;
  merchantName: string;
  occurredTime: string;
  amount: number;
  complete: boolean;
  isReviewed: boolean;
  receiptStatus: string;
  budgetId: string;
  transactionType: string;
  customFields?: Array<{
    id: string;
    uuid?: string;
    customFieldUuid?: string;
    note?: string;
    selectedValues?: Array<{ value: string; uuid?: string }>;
  }>;
}

interface BillUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface BillCustomField {
  id: string;
  uuid: string;
  name: string;
  type: string;
  multiSelect: boolean;
  allowCustomValues: boolean;
  required: boolean;
  global: boolean;
  retired?: boolean;
}

interface BillAPIResponse<T> {
  results: T[];
  nextPage?: string;
  prevPage?: string;
}

export class BillClient {
  private config: BillConfig;

  constructor(config: BillConfig) {
    this.config = config;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'apiToken': this.config.apiToken,
      'Accept': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bill.com API Error: ${response.status} - ${errorText}`);
      }

      return response.json();
    } catch (error: any) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(`Bill.com API request timed out after 30 seconds. Try reducing the date range or fetching in smaller batches.`);
      }
      throw error;
    }
  }

  /**
   * Get all users from Bill.com API
   */
  async getUsers(options: {
    max?: number;
    nextPage?: string;
  } = {}): Promise<BillAPIResponse<BillUser>> {
    const queryParams = new URLSearchParams();
    
    if (options.max) queryParams.append('max', options.max.toString());
    if (options.nextPage) queryParams.append('nextPage', options.nextPage);

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.makeRequest<BillAPIResponse<BillUser>>(`/spend/users${queryString}`);
  }

  /**
   * Get all custom fields from Bill.com API
   */
  async getCustomFields(options: {
    max?: number;
    nextPage?: string;
  } = {}): Promise<BillAPIResponse<BillCustomField>> {
    const queryParams = new URLSearchParams();
    
    if (options.max) queryParams.append('max', options.max.toString());
    if (options.nextPage) queryParams.append('nextPage', options.nextPage);

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.makeRequest<BillAPIResponse<BillCustomField>>(`/spend/custom-fields${queryString}`);
  }

  /**
   * Get all transactions from Bill.com API with pagination
   */
  async getTransactions(options: {
    max?: number;
    nextPage?: string;
    filters?: string;
    sort?: string;
  } = {}): Promise<BillAPIResponse<BillTransaction>> {
    const queryParams = new URLSearchParams();
    
    if (options.max) queryParams.append('max', options.max.toString());
    if (options.nextPage) queryParams.append('nextPage', options.nextPage);
    if (options.filters) queryParams.append('filters', options.filters);
    if (options.sort) queryParams.append('sort', options.sort);

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.makeRequest<BillAPIResponse<BillTransaction>>(`/spend/transactions${queryString}`);
  }

  /**
   * Fetch all transactions with automatic pagination
   */
  async fetchAllTransactions(
    daysBack: number = 8,
    includeIncomplete: boolean = true
  ): Promise<BillTransaction[]> {
    const transactions: BillTransaction[] = [];
    
    // Calculate start date
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Build filters - Bill.com API doesn't support transactionType in filters
    // So we'll filter for CLEAR transactions after fetching
    let filters = `occurredTime:gte:${startDateStr}`;
    if (!includeIncomplete) {
      filters = `complete:eq:true,${filters}`;
    }

    let currentOptions: any = {
      max: 25, // Reduced from 50 to avoid timeouts
      filters: filters
    };

    let pageCount = 0;
    const maxPages = 20; // Safety limit to prevent infinite loops

    // Paginate through all results
    while (pageCount < maxPages) {
      pageCount++;
      console.log(`Fetching page ${pageCount} of transactions...`);
      
      const response = await this.getTransactions(currentOptions);
      
      if (response.results && response.results.length > 0) {
        transactions.push(...response.results);
        console.log(`Fetched ${response.results.length} transactions. Total: ${transactions.length}`);
        
        if (response.nextPage) {
          currentOptions.nextPage = response.nextPage;
          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.log('No more pages to fetch');
          break;
        }
      } else {
        console.log('No results in current page');
        break;
      }
    }

    if (pageCount >= maxPages) {
      console.log(`Reached max page limit of ${maxPages}. There may be more transactions.`);
    }

    // Filter to only include CLEAR (posted) transactions, excluding AUTHORIZATION and DECLINE
    const filtered = transactions.filter(t => t.transactionType === 'CLEAR');
    console.log(`Fetched ${transactions.length} total transactions, filtered to ${filtered.length} CLEAR (posted) transactions`);
    console.log(`Excluded ${transactions.length - filtered.length} non-CLEAR transactions (pending authorizations, declines, etc.)`);
    return filtered;
  }

  /**
   * Fetch all transactions for historical import (higher page limit)
   */
  async fetchAllTransactionsHistorical(
    daysBack: number
  ): Promise<BillTransaction[]> {
    const transactions: BillTransaction[] = [];
    
    // Calculate start date
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Build filters - Bill.com API doesn't support transactionType in filters
    // So we'll filter for CLEAR transactions after fetching
    const filters = `occurredTime:gte:${startDateStr}`;

    let currentOptions: any = {
      max: 50, // Larger page size for historical import
      filters: filters
    };

    let pageCount = 0;
    const maxPages = 100; // Higher limit for historical import

    console.log(`Starting historical fetch from ${startDateStr} (${daysBack} days)`);

    // Paginate through all results
    while (pageCount < maxPages) {
      pageCount++;
      
      if (pageCount % 10 === 0) {
        console.log(`Fetching page ${pageCount} of transactions...`);
      }
      
      const response = await this.getTransactions(currentOptions);
      
      if (response.results && response.results.length > 0) {
        transactions.push(...response.results);
        
        if (pageCount % 10 === 0) {
          console.log(`Progress: ${transactions.length} transactions fetched so far...`);
        }
        
        if (response.nextPage) {
          currentOptions.nextPage = response.nextPage;
          // Smaller delay for historical import (still avoid rate limits)
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          console.log(`Completed pagination. Total pages: ${pageCount}`);
          break;
        }
      } else {
        console.log('No results in current page');
        break;
      }
    }

    if (pageCount >= maxPages) {
      console.log(`âš ï¸  Reached max page limit of ${maxPages}. There may be more transactions to fetch.`);
      console.log(`Consider running the import again or contact support if you need more than ${transactions.length} transactions.`);
    }

    // Filter to only include CLEAR (posted) transactions, excluding AUTHORIZATION and DECLINE
    const filtered = transactions.filter(t => t.transactionType === 'CLEAR');
    console.log(`Fetched ${transactions.length} total transactions, filtered to ${filtered.length} CLEAR (posted) transactions`);
    console.log(`Excluded ${transactions.length - filtered.length} non-CLEAR transactions (pending authorizations, declines, etc.)`);
    console.log(`Final count: ${filtered.length} CLEAR (posted) transactions ready for import`);
    
    return filtered;
  }

  /**
   * Create a mapping of user IDs to full names
   */
  async getUserNameMapping(): Promise<Record<string, string>> {
    const userMapping: Record<string, string> = {};
    let currentOptions: any = { max: 100 };

    // Paginate through all users
    while (true) {
      const response = await this.getUsers(currentOptions);
      
      if (response.results && response.results.length > 0) {
        response.results.forEach(user => {
          const firstName = user.firstName || '';
          const lastName = user.lastName || '';
          const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown User';
          userMapping[user.id] = fullName;
        });
        
        if (response.nextPage) {
          currentOptions.nextPage = response.nextPage;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return userMapping;
  }

  /**
   * Get custom field UUID by field name
   */
  async getCustomFieldUuidByName(fieldName: string): Promise<string | null> {
    try {
      const response = await this.getCustomFields({ max: 100 });
      
      if (response.results && response.results.length > 0) {
        const field = response.results.find(
          f => f.name === fieldName && !f.retired
        );
        
        if (field) {
          console.log(`Found custom field "${fieldName}" with UUID: ${field.uuid}`);
          return field.uuid;
        }
      }
      
      console.log(`Custom field "${fieldName}" not found`);
      return null;
    } catch (error) {
      console.error(`Error fetching custom field "${fieldName}":`, error);
      return null;
    }
  }

  /**
   * Extract custom field value from transaction
   */
  extractCustomFieldValue(
    transaction: BillTransaction,
    customFieldUuid: string
  ): string | null {
    if (!transaction.customFields || transaction.customFields.length === 0) {
      return null;
    }

    const customField = transaction.customFields.find(
      cf => cf.customFieldUuid === customFieldUuid || cf.uuid === customFieldUuid
    );

    if (!customField) {
      return null;
    }

    // Handle NOTE type custom fields
    if (customField.note) {
      return customField.note;
    }

    // Handle CUSTOM_SELECTOR type custom fields
    if (customField.selectedValues && customField.selectedValues.length > 0) {
      return customField.selectedValues.map(sv => sv.value).join(', ');
    }

    return null;
  }
}

export function createBillClient(): BillClient {
  const config: BillConfig = {
    apiToken: process.env.BILL_API_TOKEN!,
    baseUrl: process.env.BILL_BASE_URL!,
  };

  return new BillClient(config);
}

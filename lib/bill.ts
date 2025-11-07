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
  accountingIntegrationTransactions?: Array<{
    id?: string;
    billable?: boolean;
    integrationTxId?: string;
    syncStatus?: string;
    syncMessage?: string;
    integrationType?: string;
    integrationId?: string;
    syncRequestId?: string;
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
   * Fetch transactions by sync status with automatic pagination
   */
  async fetchTransactionsBySyncStatus(
    daysBack: number,
    syncStatus: 'SYNCED' | 'MANUAL_SYNCED' | 'NOT_SYNCED' | 'ERROR',
    includeIncomplete: boolean = true
  ): Promise<BillTransaction[]> {
    const transactions: BillTransaction[] = [];
    
    // Calculate start date
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Build filters with syncStatus
    let filters = `occurredTime:gte:${startDateStr},syncStatus:eq:${syncStatus}`;
    if (!includeIncomplete) {
      filters = `complete:eq:true,${filters}`;
    }

    console.log(`Fetching transactions with syncStatus=${syncStatus}, filters: ${filters}`);

    let currentOptions: any = {
      max: 25,
      filters: filters
    };

    let pageCount = 0;
    const maxPages = 20;

    while (pageCount < maxPages) {
      pageCount++;
      
      const response = await this.getTransactions(currentOptions);
      
      if (response.results && response.results.length > 0) {
        transactions.push(...response.results);
        
        if (response.nextPage) {
          currentOptions.nextPage = response.nextPage;
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Filter to only include CLEAR (posted) transactions
    const filtered = transactions.filter(t => t.transactionType === 'CLEAR');
    console.log(`Fetched ${transactions.length} total transactions with syncStatus=${syncStatus}, filtered to ${filtered.length} CLEAR transactions`);
    
    return filtered;
  }

  /**
   * Fetch transactions by sync status for historical import with higher page limit
   */
  async fetchTransactionsBySyncStatusHistorical(
    daysBack: number,
    syncStatus: 'SYNCED' | 'MANUAL_SYNCED' | 'NOT_SYNCED' | 'ERROR'
  ): Promise<BillTransaction[]> {
    const transactions: BillTransaction[] = [];
    
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    const filters = `occurredTime:gte:${startDateStr},syncStatus:eq:${syncStatus}`;

    console.log(`Fetching historical transactions with syncStatus=${syncStatus}, filters: ${filters}`);

    let currentOptions: any = {
      max: 50, // Larger page size for historical
      filters: filters
    };

    let pageCount = 0;
    const maxPages = 100; // Higher limit for historical

    while (pageCount < maxPages) {
      pageCount++;
      
      if (pageCount % 10 === 0) {
        console.log(`  Page ${pageCount} for syncStatus=${syncStatus}...`);
      }
      
      const response = await this.getTransactions(currentOptions);
      
      if (response.results && response.results.length > 0) {
        transactions.push(...response.results);
        
        if (response.nextPage) {
          currentOptions.nextPage = response.nextPage;
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const filtered = transactions.filter(t => t.transactionType === 'CLEAR');
    console.log(`Fetched ${transactions.length} total transactions with syncStatus=${syncStatus}, filtered to ${filtered.length} CLEAR transactions`);
    
    return filtered;
  }

  /**
   * Fetch all transactions with automatic pagination
   * DEPRECATED: Use fetchTransactionsBySyncStatus for better sync status coverage
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

    let filters = `occurredTime:gte:${startDateStr}`;
    if (!includeIncomplete) {
      filters = `complete:eq:true,${filters}`;
    }

    let currentOptions: any = {
      max: 25,
      filters: filters
    };

    let pageCount = 0;
    const maxPages = 20;

    while (pageCount < maxPages) {
      pageCount++;
      
      const response = await this.getTransactions(currentOptions);
      
      if (response.results && response.results.length > 0) {
        transactions.push(...response.results);
        
        if (response.nextPage) {
          currentOptions.nextPage = response.nextPage;
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const filtered = transactions.filter(t => t.transactionType === 'CLEAR');
    console.log(`Fetched ${transactions.length} total transactions, filtered to ${filtered.length} CLEAR (posted) transactions`);
    
    return filtered;
  }

  /**
   * Fetch all transactions for historical import (higher page limit)
   * DEPRECATED: Use fetchTransactionsBySyncStatusHistorical for better sync status coverage
   */
  async fetchAllTransactionsHistorical(
    daysBack: number
  ): Promise<BillTransaction[]> {
    const transactions: BillTransaction[] = [];
    
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    const filters = `occurredTime:gte:${startDateStr}`;

    let currentOptions: any = {
      max: 50,
      filters: filters
    };

    let pageCount = 0;
    const maxPages = 100;

    console.log(`Starting historical fetch from ${startDateStr} (${daysBack} days)`);

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
      console.log(`⚠️  Reached max page limit of ${maxPages}. There may be more transactions to fetch.`);
    }

    const filtered = transactions.filter(t => t.transactionType === 'CLEAR');
    console.log(`Fetched ${transactions.length} total transactions, filtered to ${filtered.length} CLEAR (posted) transactions`);
    
    return filtered;
  }

  /**
   * Create a mapping of user IDs to full names
   */
  async getUserNameMapping(): Promise<Record<string, string>> {
    const userMapping: Record<string, string> = {};
    let currentOptions: any = { max: 100 };

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

    if (customField.note) {
      return customField.note;
    }

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
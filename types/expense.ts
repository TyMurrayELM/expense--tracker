export interface Expense {
  id: string;
  netsuite_id: string;
  transaction_date: string;
  vendor_name: string;
  amount: number;
  currency: string;
  status: string | null;
  department: string | null;
  branch: string | null;
  memo: string | null;
  category: string | null;
  flag_category: string | null;
  transaction_type: string;
  cardholder: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string;
}

export interface SyncLog {
  id: string;
  sync_started_at: string;
  sync_completed_at: string | null;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  errors: any;
  status: 'running' | 'success' | 'failed' | 'partial';
}

export interface ExpenseFilters {
  branch?: string;
  vendor?: string;
  department?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface ExpenseSummary {
  totalAmount: number;
  totalCount: number;
  byBranch: Record<string, { amount: number; count: number }>;
  byDepartment: Record<string, { amount: number; count: number }>;
}

export const FLAG_CATEGORIES = [
  'Needs Review',
  'Wrong Department',
  'Wrong Branch',
  'Duplicate',
  'Needs Better Description',
] as const;

export type FlagCategory = typeof FLAG_CATEGORIES[number];

export const TRANSACTION_TYPES = [
  'Vendor Bill',
  'Credit Card',
] as const;

export type TransactionType = typeof TRANSACTION_TYPES[number];

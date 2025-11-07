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
  transaction_type: string;
  cardholder: string | null;
  flag_category: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  bill_sync_status: string | null; // NEW: PENDING, SYNCED, ERROR, MANUAL_SYNCED, NOT_SYNCED
}

export const FLAG_CATEGORIES = [
  'Needs Review',
  'Wrong Department',
  'Duplicate',
  'Personal',
] as const;

export type FlagCategory = typeof FLAG_CATEGORIES[number];

// Helper to check if a transaction is synced in Bill.com
export function isBillSynced(syncStatus: string | null): boolean {
  if (!syncStatus) return false;
  return syncStatus === 'SYNCED' || syncStatus === 'MANUAL_SYNCED';
}

// Helper to get sync status display info
export function getSyncStatusInfo(syncStatus: string | null): {
  label: string;
  color: string;
  icon: 'synced' | 'pending' | 'error' | 'not-synced';
} {
  switch (syncStatus) {
    case 'SYNCED':
    case 'MANUAL_SYNCED':
      return {
        label: 'Synced',
        color: 'text-green-600',
        icon: 'synced'
      };
    case 'PENDING':
      return {
        label: 'Pending',
        color: 'text-yellow-600',
        icon: 'pending'
      };
    case 'ERROR':
      return {
        label: 'Error',
        color: 'text-red-600',
        icon: 'error'
      };
    case 'NOT_SYNCED':
      return {
        label: 'Not Synced',
        color: 'text-gray-400',
        icon: 'not-synced'
      };
    default:
      return {
        label: 'Unknown',
        color: 'text-gray-400',
        icon: 'not-synced'
      };
  }
}
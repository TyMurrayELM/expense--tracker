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
  approval_status: 'approved' | 'rejected' | null; // NEW: Approval status
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  bill_sync_status: string | null; // NEW: PENDING, SYNCED, ERROR, MANUAL_SYNCED, NOT_SYNCED
}

export const FLAG_CATEGORIES = [
  'Needs Review',
  'Wrong Department',
  'Wrong Branch',
  'Wrong Category',
  'Poor Description',
  'Duplicate',
  'Personal',
  'Good to Sync',
  'Has WO #',
] as const;

export type FlagCategory = typeof FLAG_CATEGORIES[number];

// Helper to get flag color styling based on category
export function getFlagColorClasses(flagCategory: string | null): {
  bg: string;
  border: string;
  text: string;
} {
  if (!flagCategory) {
    return {
      bg: 'bg-white',
      border: 'border-gray-300',
      text: 'text-gray-700',
    };
  }

  // Light red for Wrong Branch, Wrong Department, Wrong Category, Poor Description
  if (flagCategory === 'Wrong Branch' || 
      flagCategory === 'Wrong Department' || 
      flagCategory === 'Wrong Category' ||
      flagCategory === 'Poor Description') {
    return {
      bg: 'bg-red-100',
      border: 'border-red-400',
      text: 'text-red-900',
    };
  }

  // Light green for Good to Sync
  if (flagCategory === 'Good to Sync') {
    return {
      bg: 'bg-green-100',
      border: 'border-green-400',
      text: 'text-green-900',
    };
  }

  // Light gray for Has WO #
  if (flagCategory === 'Has WO #') {
    return {
      bg: 'bg-gray-100',
      border: 'border-gray-400',
      text: 'text-gray-900',
    };
  }

  // Light yellow for all other flags (Needs Review, Duplicate, Personal)
  return {
    bg: 'bg-yellow-100',
    border: 'border-yellow-400',
    text: 'text-yellow-900',
  };
}

// Helper to get row background color based on flag category
export function getFlagRowBgColor(flagCategory: string | null): string {
  if (!flagCategory) return '';

  // Red for Wrong Branch, Wrong Department, Wrong Category, Poor Description
  if (flagCategory === 'Wrong Branch' || 
      flagCategory === 'Wrong Department' || 
      flagCategory === 'Wrong Category' ||
      flagCategory === 'Poor Description') {
    return 'bg-red-100';
  }

  // Green for Good to Sync
  if (flagCategory === 'Good to Sync') {
    return 'bg-green-100';
  }

  // Gray for Has WO #
  if (flagCategory === 'Has WO #') {
    return 'bg-gray-100';
  }

  // Yellow for all other flags
  return 'bg-yellow-100';
}

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
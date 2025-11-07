'use client';

import { getSyncStatusInfo } from '@/types/expense';

interface SyncStatusIconProps {
  syncStatus: string | null;
  transactionType: string;
}

export default function SyncStatusIcon({ syncStatus, transactionType }: SyncStatusIconProps) {
  // Only show for Credit Card transactions
  if (transactionType !== 'Credit Card') {
    return null;
  }

  const { label, color, icon } = getSyncStatusInfo(syncStatus);

  return (
    <div className="inline-flex items-center" title={`Bill.com Sync: ${label}`}>
      {icon === 'synced' && (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )}
      {icon === 'pending' && (
        <svg className={`w-4 h-4 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {icon === 'error' && (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
      {icon === 'not-synced' && (
        <svg className={`w-4 h-4 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      )}
    </div>
  );
}

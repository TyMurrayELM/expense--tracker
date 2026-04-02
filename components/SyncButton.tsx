'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { UserWithPermissions } from '@/types/user';

interface SyncButtonProps {
  currentUser: UserWithPermissions;
}

export default function SyncButton({ currentUser }: SyncButtonProps) {
  const [syncingVendorBills, setSyncingVendorBills] = useState(false);
  const [syncingCreditCards, setSyncingCreditCards] = useState(false);
  const [syncingHistorical, setSyncingHistorical] = useState(false);
  const [message, setMessage] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Fetch last sync time on mount - MUST be before the early return
  useEffect(() => {
    if (currentUser.is_admin) {
      fetchLastSyncTime();
    }
  }, [currentUser.is_admin]);

  const fetchLastSyncTime = async () => {
    try {
      const response = await fetch('/api/sync/last-sync');
      const data = await response.json();
      
      if (data.success && data.lastSyncTime) {
        setLastSyncTime(data.lastSyncTime);
      }
    } catch (error) {
      console.error('Error fetching last sync time:', error);
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Never';
    
    const date = new Date(lastSyncTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    // Format as relative time if recent
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    // Otherwise show full date/time in local timezone
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleVendorBillSync = async () => {
    setSyncingVendorBills(true);
    setMessage('');

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✓ Vendor Bills synced: ${data.stats.created} created, ${data.stats.updated} updated`);
        fetchLastSyncTime();
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMessage(`✗ Vendor Bill sync failed: ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setSyncingVendorBills(false);
    }
  };

  const handleCreditCardSync = async () => {
    setSyncingCreditCards(true);
    setMessage('');

    try {
      const response = await fetch('/api/sync-credit-cards', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✓ Credit Cards synced: ${data.stats.created} created, ${data.stats.updated} updated`);
        fetchLastSyncTime();
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMessage(`✗ Credit Card sync failed: ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setSyncingCreditCards(false);
    }
  };

  const handleHistoricalImport = async () => {
    if (!confirm('Import ALL credit card transactions from March 1, 2026 to present?\n\nThis may take several minutes. Run this once to get historical data.')) {
      return;
    }

    setSyncingHistorical(true);
    setMessage('⏳ Historical import in progress... This may take 2-5 minutes. Please wait.');

    try {
      const response = await fetch('/api/sync-credit-cards-historical', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setMessage(`✓ Historical import complete: ${data.stats.created} created, ${data.stats.updated} updated (${data.stats.dateRange})`);
        fetchLastSyncTime();
        setTimeout(() => window.location.reload(), 3000);
      } else {
        setMessage(`✗ Historical import failed: ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setSyncingHistorical(false);
    }
  };

  const isAnySyncing = syncingVendorBills || syncingCreditCards || syncingHistorical;

  // Only show sync buttons for admins - MUST be after all hooks
  if (!currentUser.is_admin) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1 w-full lg:w-auto">
      {message && (
        <span className="text-xs text-white">
          {message}
        </span>
      )}

      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center gap-2">
        <button
          onClick={handleVendorBillSync}
          disabled={isAnySyncing}
          className="px-2.5 py-1.5 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 border border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Image src="/logos/netsuite.png" alt="NetSuite" width={14} height={14} className="flex-shrink-0" />
          {syncingVendorBills ? 'Syncing...' : 'Vendor Bills'}
        </button>
        <button
          onClick={handleCreditCardSync}
          disabled={isAnySyncing}
          className="px-2.5 py-1.5 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 border border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Image src="/logos/bill.png" alt="Bill.com" width={14} height={14} className="flex-shrink-0" />
          {syncingCreditCards ? 'Syncing...' : 'Credit Cards'}
        </button>
        <button
          onClick={handleHistoricalImport}
          disabled={isAnySyncing}
          className="px-2.5 py-1.5 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 border border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="One-time import of all transactions since Mar 1, 2026"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          {syncingHistorical ? 'Importing...' : 'Historical'}
        </button>
        <span className="text-[10px] text-white/70 ml-1">{formatLastSyncTime()}</span>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden w-full">
        <div className="flex gap-2">
          <button
            onClick={handleVendorBillSync}
            disabled={isAnySyncing}
            className="flex-1 px-2 py-2 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 border border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Image src="/logos/netsuite.png" alt="NetSuite" width={14} height={14} className="flex-shrink-0" />
            {syncingVendorBills ? 'Syncing...' : 'Vendor Bills'}
          </button>
          <button
            onClick={handleCreditCardSync}
            disabled={isAnySyncing}
            className="flex-1 px-2 py-2 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 border border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Image src="/logos/bill.png" alt="Bill.com" width={14} height={14} className="flex-shrink-0" />
            {syncingCreditCards ? 'Syncing...' : 'Credit Cards'}
          </button>
          <button
            onClick={handleHistoricalImport}
            disabled={isAnySyncing}
            className="flex-1 px-2 py-2 bg-white/15 text-white text-xs font-medium rounded-lg hover:bg-white/25 border border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            title="One-time import of all transactions since Mar 1, 2026"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            {syncingHistorical ? 'Importing...' : 'Historical'}
          </button>
        </div>
        <p className="text-[10px] text-white/70 text-center mt-1.5">{formatLastSyncTime()}</p>
      </div>
    </div>
  );
}
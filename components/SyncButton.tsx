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
    if (!confirm('Import ALL credit card transactions from January 1, 2026 to present?\n\nThis may take several minutes. Run this once to get historical data.')) {
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
    <div className="flex flex-col items-end gap-2 w-full lg:w-auto">
      {message && (
        <span className={`text-sm ${message.startsWith('✓') ? 'text-green-600' : message.startsWith('⏳') ? 'text-blue-600' : 'text-red-600'}`}>
          {message}
        </span>
      )}
      
      {/* Desktop Layout */}
      <div className="hidden lg:flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <div className="flex flex-col items-center">
            <button
              onClick={handleVendorBillSync}
              disabled={isAnySyncing}
              className="px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-md hover:bg-teal-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Image
                src="/logos/netsuite.png"
                alt="NetSuite"
                width={20}
                height={20}
                className="flex-shrink-0"
              />
              {syncingVendorBills ? 'Syncing...' : 'Sync Vendor Bills'}
            </button>
            <span className="text-xs text-gray-500 mt-1">
              Last: {formatLastSyncTime()}
            </span>
          </div>
          
          <div className="flex flex-col items-center">
            <button
              onClick={handleCreditCardSync}
              disabled={isAnySyncing}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Image
                src="/logos/bill.png"
                alt="Bill.com"
                width={20}
                height={20}
                className="flex-shrink-0"
              />
              {syncingCreditCards ? 'Syncing...' : 'Sync Credit Cards'}
            </button>
            <span className="text-xs text-gray-500 mt-1">
              Last: {formatLastSyncTime()}
            </span>
          </div>
          
          <div className="flex flex-col items-center">
            <button
              onClick={handleHistoricalImport}
              disabled={isAnySyncing}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              title="One-time import of all transactions since Oct 1, 2025"
            >
              <svg 
                className="w-5 h-5" 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              {syncingHistorical ? 'Importing...' : 'Historical Import'}
            </button>
            <span className="text-xs text-gray-500 mt-1">
              Last: {formatLastSyncTime()}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden w-full space-y-3">
        <div className="flex flex-col gap-2">
          <button
            onClick={handleVendorBillSync}
            disabled={isAnySyncing}
            className="w-full px-4 py-3 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Image
              src="/logos/netsuite.png"
              alt="NetSuite"
              width={20}
              height={20}
              className="flex-shrink-0"
            />
            <span>{syncingVendorBills ? 'Syncing...' : 'Sync Vendor Bills'}</span>
          </button>
          
          <button
            onClick={handleCreditCardSync}
            disabled={isAnySyncing}
            className="w-full px-4 py-3 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Image
              src="/logos/bill.png"
              alt="Bill.com"
              width={20}
              height={20}
              className="flex-shrink-0"
            />
            <span>{syncingCreditCards ? 'Syncing...' : 'Sync Credit Cards'}</span>
          </button>
          
          <button
            onClick={handleHistoricalImport}
            disabled={isAnySyncing}
            className="w-full px-4 py-3 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            title="One-time import of all transactions since Oct 1, 2025"
          >
            <svg 
              className="w-5 h-5" 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            <span>{syncingHistorical ? 'Importing...' : 'Historical Import'}</span>
          </button>
        </div>
        
        <div className="text-xs text-gray-500 text-center">
          Last sync: {formatLastSyncTime()}
        </div>
      </div>
    </div>
  );
}
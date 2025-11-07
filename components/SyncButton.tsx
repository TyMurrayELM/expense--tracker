'use client';

import { useState } from 'react';
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

  // Only show sync buttons for admins
  if (!currentUser.is_admin) {
    return null;
  }

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
        // Refresh the page to show new data
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
        // Refresh the page to show new data
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
    if (!confirm('Import ALL credit card transactions from October 1, 2025 to present?\n\nThis may take several minutes. Run this once to get historical data.')) {
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
        // Refresh the page to show new data
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

  const handleSyncBoth = async () => {
    setSyncingVendorBills(true);
    setSyncingCreditCards(true);
    setMessage('Syncing both vendor bills and credit cards...');

    try {
      // Run both syncs in parallel
      const [vendorResponse, creditResponse] = await Promise.all([
        fetch('/api/sync', { method: 'POST' }),
        fetch('/api/sync-credit-cards', { method: 'POST' })
      ]);

      const vendorData = await vendorResponse.json();
      const creditData = await creditResponse.json();

      const vendorSuccess = vendorData.success;
      const creditSuccess = creditData.success;

      if (vendorSuccess && creditSuccess) {
        setMessage(
          `✓ Sync complete! Vendor Bills: ${vendorData.stats.created}/${vendorData.stats.updated}, Credit Cards: ${creditData.stats.created}/${creditData.stats.updated}`
        );
        setTimeout(() => window.location.reload(), 2000);
      } else if (vendorSuccess) {
        setMessage(`✓ Vendor Bills synced, ✗ Credit Cards failed: ${creditData.error}`);
      } else if (creditSuccess) {
        setMessage(`✗ Vendor Bills failed: ${vendorData.error}, ✓ Credit Cards synced`);
      } else {
        setMessage(`✗ Both syncs failed`);
      }
    } catch (error: any) {
      setMessage(`✗ Error: ${error.message}`);
    } finally {
      setSyncingVendorBills(false);
      setSyncingCreditCards(false);
    }
  };

  const isAnySyncing = syncingVendorBills || syncingCreditCards || syncingHistorical;

  return (
    <div className="flex flex-col items-end gap-2">
      {message && (
        <span className={`text-sm ${message.startsWith('✓') ? 'text-green-600' : message.startsWith('⏳') ? 'text-blue-600' : 'text-red-600'}`}>
          {message}
        </span>
      )}
      <div className="flex gap-2">
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
      </div>
    </div>
  );
}
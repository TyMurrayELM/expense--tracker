// components/SlackSyncButton.tsx
'use client';

import { useState } from 'react';
import { SlackSyncResponse } from '@/types/user';

interface SlackSyncButtonProps {
  onSyncComplete?: () => void;
}

export default function SlackSyncButton({ onSyncComplete }: SlackSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [syncResults, setSyncResults] = useState<SlackSyncResponse | null>(null);

  const handleSync = async () => {
    if (syncing) return;

    const confirmed = window.confirm(
      'This will sync Slack user data (IDs and display names) with existing users in the database by matching email addresses. Continue?'
    );

    if (!confirmed) return;

    setSyncing(true);
    setShowResults(false);
    setSyncResults(null);

    try {
      const response = await fetch('/api/sync/slack', {
        method: 'POST',
      });

      const data: SlackSyncResponse = await response.json();

      if (data.success) {
        setSyncResults(data);
        setShowResults(true);
        
        // Call callback if provided
        if (onSyncComplete) {
          onSyncComplete();
        }
      } else {
        alert(`Sync failed: ${data.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error syncing Slack users:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const closeResults = () => {
    setShowResults(false);
    setSyncResults(null);
  };

  return (
    <>
      <button
        onClick={handleSync}
        disabled={syncing}
        className={`
          flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
          transition-colors
          ${syncing 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-purple-600 text-white hover:bg-purple-700'
          }
        `}
      >
        {syncing ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Syncing...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Sync Slack Users</span>
          </>
        )}
      </button>

      {/* Results Modal */}
      {showResults && syncResults && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">
                Slack Sync Results
              </h3>
              <button
                onClick={closeResults}
                className="text-gray-700 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Total Slack Users:</span>
                <span className="font-semibold text-gray-900">{syncResults.stats.total}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Matched by Email:</span>
                <span className="font-semibold text-green-600">{syncResults.stats.matched}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Updated:</span>
                <span className="font-semibold text-blue-600">{syncResults.stats.updated}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">New Users Created:</span>
                <span className="font-semibold text-purple-600">{syncResults.stats.created}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Failed:</span>
                <span className="font-semibold text-orange-600">{syncResults.stats.notFound}</span>
              </div>
            </div>

            {syncResults.errors && syncResults.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm font-semibold text-red-800 mb-2">Errors:</p>
                <ul className="text-xs text-red-700 space-y-1">
                  {syncResults.errors.map((error, idx) => (
                    <li key={idx}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeResults}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

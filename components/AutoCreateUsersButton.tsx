'use client';

import { useState } from 'react';

interface AutoCreateUsersButtonProps {
  onComplete?: () => void;
}

interface AutoCreateResponse {
  success: boolean;
  message: string;
  stats: {
    totalPurchasers: number;
    created: number;
    skipped: number;
    errorCount: number;
  };
  createdUsers?: Array<{
    name: string;
    email: string;
    id: string;
  }>;
  errors?: string[];
}

export default function AutoCreateUsersButton({ onComplete }: AutoCreateUsersButtonProps) {
  const [creating, setCreating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<AutoCreateResponse | null>(null);

  const handleAutoCreate = async () => {
    const confirmed = window.confirm(
      'This will create user accounts for all purchasers (cardholders) in the expense data.\n\n' +
      'Emails will be generated as firstname.lastname@encorelm.com\n\n' +
      'Existing users will be skipped. Continue?'
    );

    if (!confirmed) return;

    setCreating(true);
    setShowResults(false);
    setResults(null);

    try {
      const response = await fetch('/api/users/auto-create', {
        method: 'POST',
      });

      const data: AutoCreateResponse = await response.json();

      if (data.success) {
        setResults(data);
        setShowResults(true);
        
        if (onComplete) {
          onComplete();
        }
      } else {
        alert(`Failed: ${data.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error auto-creating users:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  const closeResults = () => {
    setShowResults(false);
    setResults(null);
  };

  return (
    <>
      <button
        onClick={handleAutoCreate}
        disabled={creating}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium
          transition-colors
          ${creating 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-green-600 text-white hover:bg-green-700'
          }
        `}
      >
        {creating ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Creating...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Auto-Create Users</span>
          </>
        )}
      </button>

      {/* Results Modal */}
      {showResults && results && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">
                Auto-Create Users Results
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

            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Total Purchasers Found:</span>
                <span className="font-semibold text-gray-900">{results.stats.totalPurchasers}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">New Users Created:</span>
                <span className="font-semibold text-green-600">{results.stats.created}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Skipped (Already Exist):</span>
                <span className="font-semibold text-blue-600">{results.stats.skipped}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-700">Errors:</span>
                <span className="font-semibold text-red-600">{results.stats.errorCount}</span>
              </div>
            </div>

            {results.createdUsers && results.createdUsers.length > 0 && (
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">Created Users:</h4>
                <div className="bg-gray-50 rounded p-3 max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.createdUsers.map((user) => (
                        <tr key={user.id} className="border-b last:border-0">
                          <td className="py-1">{user.name}</td>
                          <td className="py-1 text-gray-700">{user.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.errors && results.errors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm font-semibold text-red-800 mb-2">Errors:</p>
                <ul className="text-xs text-red-700 space-y-1">
                  {results.errors.map((error, idx) => (
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

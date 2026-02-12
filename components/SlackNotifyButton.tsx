'use client';

import { useState, useEffect } from 'react';

interface SlackNotifyButtonProps {
  expenseId: string;
  netsuiteId: string;
  transactionType: string;
  purchaserName: string;
  vendor: string;
  amount: number;
  date: string;
  memo: string | null;
  currentBranch: string | null;
  currentDepartment: string | null;
  currentCategory: string | null;
  correctBranch?: string | null;
  correctDepartment?: string | null;
  correctCategory?: string | null;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  slack_id: string;
}

export default function SlackNotifyButton({
  expenseId,
  netsuiteId,
  transactionType,
  purchaserName,
  vendor,
  amount,
  date,
  memo,
  currentBranch,
  currentDepartment,
  currentCategory,
  correctBranch,
  correctDepartment,
  correctCategory,
}: SlackNotifyButtonProps) {
  const [sending, setSending] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [corrections, setCorrections] = useState({
    branch: correctBranch || currentBranch || '',
    department: correctDepartment || currentDepartment || '',
    category: correctCategory || currentCategory || '',
  });
  const [improveDescription, setImproveDescription] = useState(false);
  
  // New state for additional recipients - auto-enable when no purchaser (vendor bills)
  const isVendorBill = !purchaserName;
  const [includeAdditionalUsers, setIncludeAdditionalUsers] = useState(isVendorBill);
  const [additionalUserIds, setAdditionalUserIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // New state for additional message
  const [includeAdditionalMessage, setIncludeAdditionalMessage] = useState(false);
  const [additionalMessage, setAdditionalMessage] = useState('');

  // Fetch users with Slack IDs when modal opens and checkbox is checked
  useEffect(() => {
    if (showModal && includeAdditionalUsers && availableUsers.length === 0) {
      fetchUsersWithSlack();
    }
  }, [showModal, includeAdditionalUsers]);

  const fetchUsersWithSlack = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        // Filter to only users with Slack IDs and exclude the current purchaser
        const usersWithSlack = data.users.filter(
          (user: User) => user.slack_id && user.full_name !== purchaserName
        );
        setAvailableUsers(usersWithSlack);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Generate transaction URL based on type
  const getTransactionUrl = () => {
    if (transactionType === 'Credit Card') {
      // Bill.com URL
      const billId = netsuiteId.replace('BILL-', '');
      return `https://spend.bill.com/companies/Q29tcGFueToxNDI3OQ==/transactions/pending-and-cleared/${billId}`;
    } else {
      // NetSuite URL
      return `https://system.netsuite.com/app/accounting/transactions/vendbill.nl?id=${netsuiteId}`;
    }
  };

  // Check if there are any actual changes or description improvement requested
  const hasChanges = () => {
    return (
      corrections.branch !== currentBranch ||
      corrections.department !== currentDepartment ||
      corrections.category !== currentCategory ||
      improveDescription
    );
  };

  const handleSendNotification = async () => {
    if (!hasChanges()) {
      alert('Please specify at least one correction or check "Description needs improvement" before sending.');
      return;
    }

    if (isVendorBill && additionalUserIds.length === 0) {
      alert('This is a vendor bill with no cardholder. Please select at least one recipient.');
      return;
    }

    if (includeAdditionalUsers && additionalUserIds.length === 0) {
      alert('Please select at least one additional recipient or uncheck the option.');
      return;
    }

    setSending(true);

    try {
      // Find the additional users' Slack IDs if selected
      let additionalSlackIds: string[] = [];
      if (includeAdditionalUsers && additionalUserIds.length > 0) {
        additionalSlackIds = additionalUserIds
          .map(id => availableUsers.find(user => user.id === id)?.slack_id)
          .filter((id): id is string => !!id);
      }

      const response = await fetch('/api/notify/slack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenseId,
          purchaserName,
          incorrectBranch: currentBranch,
          correctBranch: corrections.branch !== currentBranch ? corrections.branch : null,
          incorrectDepartment: currentDepartment,
          correctDepartment: corrections.department !== currentDepartment ? corrections.department : null,
          incorrectCategory: currentCategory,
          correctCategory: corrections.category !== currentCategory ? corrections.category : null,
          vendor,
          amount,
          date,
          memo,
          billUrl: getTransactionUrl(),
          improveDescription,
          additionalSlackIds: additionalSlackIds.length > 0 ? additionalSlackIds : null,
          additionalMessage: includeAdditionalMessage ? additionalMessage : null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.message}`);
        setShowModal(false);
        // Reset states
        setImproveDescription(false);
        setIncludeAdditionalUsers(false);
        setAdditionalUserIds([]);
        setIncludeAdditionalMessage(false);
        setAdditionalMessage('');
      } else {
        alert(`❌ Failed: ${data.error}\n${data.suggestion || ''}`);
      }
    } catch (error: any) {
      console.error('Error sending notification:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
        title="Notify via Slack"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
                Send Slack Notification
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-700 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded">
              {isVendorBill && (
                <p className="text-xs text-amber-600 mb-1">Vendor bill — no cardholder. Select recipients below.</p>
              )}
              <p className="text-sm text-gray-700">
                <strong>To:</strong>{' '}
                {purchaserName || <span className="text-gray-400 italic">No cardholder</span>}
                {includeAdditionalUsers && additionalUserIds.length > 0 && (
                  <span className="text-purple-600">
                    {purchaserName ? ' + ' : ''}{additionalUserIds.map(id => availableUsers.find(u => u.id === id)?.full_name).filter(Boolean).join(', ')}
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Expense:</strong> {vendor} - ${amount.toFixed(2)} on {date}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correct Branch
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={corrections.branch}
                    onChange={(e) => setCorrections({ ...corrections, branch: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="Phoenix - North"
                  />
                  {currentBranch && currentBranch !== corrections.branch && (
                    <span className="text-xs text-red-600">Was: {currentBranch}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correct Department
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={corrections.department}
                    onChange={(e) => setCorrections({ ...corrections, department: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="Operations"
                  />
                  {currentDepartment && currentDepartment !== corrections.department && (
                    <span className="text-xs text-red-600">Was: {currentDepartment}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correct Category
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={corrections.category}
                    onChange={(e) => setCorrections({ ...corrections, category: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="Equipment"
                  />
                  {currentCategory && currentCategory !== corrections.category && (
                    <span className="text-xs text-red-600">Was: {currentCategory}</span>
                  )}
                </div>
              </div>

              {/* Description Improvement Checkbox */}
              <div className="pt-2 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={improveDescription}
                    onChange={(e) => setImproveDescription(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">
                    Description needs improvement
                  </span>
                </label>
                {memo && (
                  <p className="mt-1 ml-6 text-xs text-gray-700">
                    Current: "{memo}"
                  </p>
                )}
              </div>

              {/* Additional Recipients Section */}
              <div className="pt-2 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAdditionalUsers}
                    disabled={isVendorBill}
                    onChange={(e) => {
                      setIncludeAdditionalUsers(e.target.checked);
                      if (!e.target.checked) {
                        setAdditionalUserIds([]);
                      }
                    }}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">
                    {isVendorBill ? 'Select recipients (required)' : 'Include additional recipients (group message)'}
                  </span>
                </label>

                {includeAdditionalUsers && (
                  <div className="mt-3 ml-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Users
                    </label>
                    {loadingUsers ? (
                      <p className="text-sm text-gray-700">Loading users...</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2 space-y-1">
                        {availableUsers.map((user) => (
                          <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                            <input
                              type="checkbox"
                              checked={additionalUserIds.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAdditionalUserIds([...additionalUserIds, user.id]);
                                } else {
                                  setAdditionalUserIds(additionalUserIds.filter(id => id !== user.id));
                                }
                              }}
                              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                            <span className="text-sm text-gray-700">{user.full_name} ({user.email})</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {availableUsers.length === 0 && !loadingUsers && (
                      <p className="mt-1 text-xs text-gray-700">
                        No other users with Slack IDs found
                      </p>
                    )}
                    {additionalUserIds.length > 0 && (
                      <p className="mt-1 text-xs text-gray-700">
                        {additionalUserIds.length} user{additionalUserIds.length !== 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Additional Message Section */}
              <div className="pt-2 border-t border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAdditionalMessage}
                    onChange={(e) => {
                      setIncludeAdditionalMessage(e.target.checked);
                      if (!e.target.checked) {
                        setAdditionalMessage('');
                      }
                    }}
                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-700">
                    Include additional message (optional)
                  </span>
                </label>

                {includeAdditionalMessage && (
                  <div className="mt-3 ml-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Additional Message
                    </label>
                    <textarea
                      value={additionalMessage}
                      onChange={(e) => setAdditionalMessage(e.target.value)}
                      placeholder="Add any extra context or instructions..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500 resize-none"
                    />
                    <p className="mt-1 text-xs text-gray-700">
                      This message will appear at the end of the notification
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNotification}
                disabled={sending || !hasChanges()}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send to Slack'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
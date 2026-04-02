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
  slackNotificationCount?: number;
  slackLastNotifiedAt?: string | null;
  onNotificationSent?: () => void;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  slack_id: string;
}

type SendMode = 'dm' | 'group' | 'channel';

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
  slackNotificationCount = 0,
  slackLastNotifiedAt,
  onNotificationSent,
}: SlackNotifyButtonProps) {
  const [sending, setSending] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [corrections, setCorrections] = useState({
    branch: correctBranch || currentBranch || '',
    department: correctDepartment || currentDepartment || '',
    category: correctCategory || currentCategory || '',
  });
  const [improveDescription, setImproveDescription] = useState(false);

  const isVendorBill = !purchaserName;
  const [sendMode, setSendMode] = useState<SendMode>(isVendorBill ? 'group' : 'dm');

  // Group message recipients
  const [additionalUserIds, setAdditionalUserIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Channel
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [availableChannels, setAvailableChannels] = useState<{ label: string; channelId: string }[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Additional message
  const [additionalMessage, setAdditionalMessage] = useState('');

  // Fetch users when group mode is active
  useEffect(() => {
    if (showModal && sendMode === 'group' && availableUsers.length === 0) {
      fetchUsersWithSlack();
    }
  }, [showModal, sendMode]);

  // Fetch channels when channel mode is active
  useEffect(() => {
    if (showModal && sendMode === 'channel' && availableChannels.length === 0) {
      fetchChannels();
    }
  }, [showModal, sendMode]);

  const fetchUsersWithSlack = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
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

  const fetchChannels = async () => {
    setLoadingChannels(true);
    try {
      const response = await fetch('/api/slack-channels');
      if (response.ok) {
        const data = await response.json();
        setAvailableChannels(data.channels);
      }
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const getTransactionUrl = () => {
    if (transactionType === 'Credit Card') {
      const billId = netsuiteId.replace('BILL-', '');
      return `https://spend.bill.com/companies/Q29tcGFueToxNDI3OQ==/transactions/pending-and-cleared/${billId}`;
    } else {
      return `https://system.netsuite.com/app/accounting/transactions/vendbill.nl?id=${netsuiteId}`;
    }
  };

  const hasChanges = () => {
    return (
      corrections.branch !== currentBranch ||
      corrections.department !== currentDepartment ||
      corrections.category !== currentCategory ||
      improveDescription
    );
  };

  // Build the "To" display text
  const getRecipientDisplay = () => {
    if (sendMode === 'channel') {
      if (selectedChannelId) {
        return <span className="text-purple-600">{availableChannels.find(c => c.channelId === selectedChannelId)?.label || 'Channel'}</span>;
      }
      return <span className="text-gray-400 italic">Select a channel below</span>;
    }
    if (sendMode === 'group') {
      const names = additionalUserIds.map(id => availableUsers.find(u => u.id === id)?.full_name).filter(Boolean);
      if (purchaserName && names.length > 0) {
        return <>{purchaserName} <span className="text-purple-600">+ {names.join(', ')}</span></>;
      }
      if (names.length > 0) {
        return <span className="text-purple-600">{names.join(', ')}</span>;
      }
      if (purchaserName) {
        return <>{purchaserName} <span className="text-gray-400 italic">+ select recipients below</span></>;
      }
      return <span className="text-gray-400 italic">Select recipients below</span>;
    }
    return <>{purchaserName || <span className="text-gray-400 italic">No cardholder</span>}</>;
  };

  const handleSendNotification = async () => {
    if (!hasChanges()) {
      alert('Please specify at least one correction or check "Description needs improvement" before sending.');
      return;
    }

    if (sendMode === 'channel' && !selectedChannelId) {
      alert('Please select a channel.');
      return;
    }

    if (sendMode === 'group' && additionalUserIds.length === 0) {
      alert(isVendorBill
        ? 'This is a vendor bill with no cardholder. Please select at least one recipient.'
        : 'Please select at least one additional recipient.');
      return;
    }

    if (sendMode === 'dm' && isVendorBill) {
      alert('This is a vendor bill with no cardholder. Please use Group Message or Channel.');
      return;
    }

    setSending(true);

    try {
      let additionalSlackIds: string[] = [];
      if (sendMode === 'group' && additionalUserIds.length > 0) {
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
          additionalSlackIds: sendMode === 'group' && additionalSlackIds.length > 0 ? additionalSlackIds : null,
          additionalMessage: additionalMessage.trim() || null,
          channelOverride: sendMode === 'channel' ? selectedChannelId : null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`\u2705 ${data.message}`);
        setShowModal(false);
        setImproveDescription(false);
        setSendMode(isVendorBill ? 'group' : 'dm');
        setAdditionalUserIds([]);
        setSelectedChannelId('');
        setAdditionalMessage('');
        onNotificationSent?.();
      } else {
        alert(`\u274C Failed: ${data.error}\n${data.suggestion || ''}`);
      }
    } catch (error: any) {
      console.error('Error sending notification:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const sendModeOptions: { value: SendMode; label: string; disabled?: boolean }[] = [
    { value: 'dm', label: 'Direct Message', disabled: isVendorBill },
    { value: 'group', label: 'Group Message' },
    { value: 'channel', label: 'Channel' },
  ];

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="relative p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
        title={slackNotificationCount > 0
          ? `Notified ${slackNotificationCount} time${slackNotificationCount !== 1 ? 's' : ''}${slackLastNotifiedAt ? ` — Last: ${new Date(slackLastNotifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
          : 'Notify via Slack'}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
        </svg>
        {slackNotificationCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {slackNotificationCount}
          </span>
        )}
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
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Expense Summary */}
            <div className="mb-5 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-700">
                <strong>To:</strong> {getRecipientDisplay()}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Expense:</strong> {vendor} - ${amount.toFixed(2)} on {date}
              </p>
            </div>

            {/* Send As selector */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Send as</label>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                {sendModeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (opt.disabled) return;
                      setSendMode(opt.value);
                      if (opt.value !== 'group') setAdditionalUserIds([]);
                      if (opt.value !== 'channel') setSelectedChannelId('');
                    }}
                    disabled={opt.disabled}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      sendMode === opt.value
                        ? 'bg-purple-600 text-white'
                        : opt.disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } ${opt.value !== 'dm' ? 'border-l border-gray-300' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {isVendorBill && sendMode !== 'dm' && (
                <p className="mt-1 text-xs text-amber-600">Vendor bill — no cardholder for direct message.</p>
              )}
            </div>

            {/* Group Message: recipient picker */}
            {sendMode === 'group' && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients</label>
                {purchaserName && (
                  <p className="text-xs text-gray-500 mb-2">{purchaserName} is already included. Select additional recipients:</p>
                )}
                {loadingUsers ? (
                  <p className="text-sm text-gray-500">Loading users...</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-0.5">
                    {availableUsers.map((user) => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
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
                        <span className="text-sm text-gray-700">{user.full_name}</span>
                        <span className="text-xs text-gray-400">{user.email}</span>
                      </label>
                    ))}
                  </div>
                )}
                {availableUsers.length === 0 && !loadingUsers && (
                  <p className="mt-1 text-xs text-gray-500">No other users with Slack IDs found</p>
                )}
                {additionalUserIds.length > 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    {additionalUserIds.length} user{additionalUserIds.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )}

            {/* Channel: channel picker */}
            {sendMode === 'channel' && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
                {loadingChannels ? (
                  <p className="text-sm text-gray-500">Loading channels...</p>
                ) : (
                  <select
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">Choose a channel...</option>
                    {availableChannels.map((ch) => (
                      <option key={ch.channelId + ch.label} value={ch.channelId}>
                        {ch.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Corrections */}
            <div className="space-y-3 mb-5">
              <label className="block text-sm font-medium text-gray-700">Corrections</label>
              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={corrections.branch}
                    onChange={(e) => setCorrections({ ...corrections, branch: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Branch"
                  />
                  {currentBranch && currentBranch !== corrections.branch && (
                    <span className="text-xs text-red-600 whitespace-nowrap">Was: {currentBranch}</span>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={corrections.department}
                    onChange={(e) => setCorrections({ ...corrections, department: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Department"
                  />
                  {currentDepartment && currentDepartment !== corrections.department && (
                    <span className="text-xs text-red-600 whitespace-nowrap">Was: {currentDepartment}</span>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={corrections.category}
                    onChange={(e) => setCorrections({ ...corrections, category: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Category"
                  />
                  {currentCategory && currentCategory !== corrections.category && (
                    <span className="text-xs text-red-600 whitespace-nowrap">Was: {currentCategory}</span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={improveDescription}
                  onChange={(e) => setImproveDescription(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">Description needs improvement</span>
              </label>
              {improveDescription && memo && (
                <p className="ml-6 text-xs text-gray-500">Current: &quot;{memo}&quot;</p>
              )}
            </div>

            {/* Additional Message */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional message <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea
                value={additionalMessage}
                onChange={(e) => setAdditionalMessage(e.target.value)}
                placeholder="Add any extra context or instructions..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-purple-500 focus:border-purple-500 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNotification}
                disabled={sending || !hasChanges()}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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

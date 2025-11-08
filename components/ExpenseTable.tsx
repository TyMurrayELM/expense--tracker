'use client';

import { Expense, FLAG_CATEGORIES } from '@/types/expense';
import { format } from 'date-fns';
import { useState } from 'react';
import Image from 'next/image';
import SlackNotifyButton from './SlackNotifyButton';
import SyncStatusIcon from './SyncStatusIcon';

interface ExpenseTableProps {
  expenses: Expense[];
  onFlagUpdate?: (expenseId: string, newFlagCategory: string | null) => void;
  isAdmin?: boolean;
  isMasquerading?: boolean;
}

export default function ExpenseTable({ 
  expenses, 
  onFlagUpdate, 
  isAdmin = false,
  isMasquerading = false 
}: ExpenseTableProps) {
  const [updatingFlags, setUpdatingFlags] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Show Notify column only if user is admin AND not masquerading
  const showNotifyColumn = isAdmin && !isMasquerading;

  const toggleRow = (expenseId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
      } else {
        next.add(expenseId);
      }
      return next;
    });
  };

  // Helper function to determine row background color based on flag category
  const getRowBackgroundColor = (flagCategory: string | null | undefined): string => {
    if (!flagCategory) return '';
    
    // Light red for error flags
    if (['Wrong Branch', 'Wrong Department', 'Poor Description'].includes(flagCategory)) {
      return 'bg-red-50';
    }
    
    // Light green for positive flag
    if (flagCategory === 'Good to Sync') {
      return 'bg-green-50';
    }
    
    // Light yellow for all other flags
    return 'bg-yellow-50';
  };

  // Helper function to determine dropdown styling based on flag category
  const getDropdownStyling = (flagCategory: string | null | undefined): string => {
    if (!flagCategory) {
      return 'border-gray-300 bg-white text-gray-700';
    }
    
    // Red styling for error flags
    if (['Wrong Branch', 'Wrong Department', 'Poor Description'].includes(flagCategory)) {
      return 'border-red-400 bg-red-100 text-red-900 font-medium';
    }
    
    // Green styling for positive flag
    if (flagCategory === 'Good to Sync') {
      return 'border-green-400 bg-green-100 text-green-900 font-medium';
    }
    
    // Yellow styling for all other flags
    return 'border-yellow-400 bg-yellow-100 text-yellow-900 font-medium';
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    // Map full currency names to codes
    const currencyMap: Record<string, string> = {
      'US Dollar': 'USD',
      'Euro': 'EUR',
      'British Pound': 'GBP',
      'Canadian Dollar': 'CAD',
      'Mexican Peso': 'MXN',
      'Japanese Yen': 'JPY',
    };
    
    const currencyCode = currencyMap[currency] || currency;
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    // Parse date string as YYYY-MM-DD without timezone conversion
    // Don't use new Date() directly as it interprets as UTC and converts to local timezone
    const [year, month, day] = dateString.substring(0, 10).split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return format(date, 'MMM d');
  };

  // Generate transaction URL based on type
  const getTransactionUrl = (expense: Expense) => {
    if (expense.transaction_type === 'Credit Card') {
      // Bill.com URL
      const billId = expense.netsuite_id.replace('BILL-', '');
      return `https://spend.bill.com/companies/Q29tcGFueToxNDI3OQ==/transactions/pending-and-cleared/${billId}`;
    } else {
      // NetSuite URL
      return `https://system.netsuite.com/app/accounting/transactions/vendbill.nl?id=${expense.netsuite_id}`;
    }
  };

  const handleFlagChange = async (expenseId: string, flagCategory: string | null) => {
    setUpdatingFlags(prev => new Set(prev).add(expenseId));

    try {
      const response = await fetch('/api/expenses/flag', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenseId,
          flagCategory: flagCategory === '' ? null : flagCategory,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Trigger a refresh of the data with the new flag
        if (onFlagUpdate) {
          onFlagUpdate(expenseId, flagCategory === '' ? null : flagCategory);
        }
      } else {
        console.error('Failed to update flag:', data.error);
        alert('Failed to update flag. Please try again.');
      }
    } catch (error) {
      console.error('Error updating flag:', error);
      alert('Error updating flag. Please try again.');
    } finally {
      setUpdatingFlags(prev => {
        const next = new Set(prev);
        next.delete(expenseId);
        return next;
      });
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto max-h-[calc(100vh-400px)] overflow-y-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '70px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '280px' }} />
            <col style={{ width: '60px' }} />
            {showNotifyColumn && <col style={{ width: '60px' }} />}
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Flag
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Date
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Vendor
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Purchaser
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Category
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Branch
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Department
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Amount
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                Memo
              </th>
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                View
              </th>
              {showNotifyColumn && (
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                  Notify
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={showNotifyColumn ? 12 : 11} className="px-6 py-12 text-center text-gray-500">
                  No expenses found. Try adjusting your filters or sync data from NetSuite.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr 
                  key={expense.id} 
                  className={`hover:bg-gray-50 ${getRowBackgroundColor(expense.flag_category)}`}
                >
                  {/* Flag Column */}
                  <td className="px-3 py-3">
                    <select
                      value={expense.flag_category || ''}
                      onChange={(e) => handleFlagChange(expense.id, e.target.value)}
                      disabled={updatingFlags.has(expense.id)}
                      className={`text-xs border rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        getDropdownStyling(expense.flag_category)
                      } ${updatingFlags.has(expense.id) ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                    >
                      <option value="">No Flag</option>
                      {FLAG_CATEGORIES.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Date Column */}
                  <td className="px-3 py-3 text-sm text-gray-900">
                    {formatDate(expense.transaction_date)}
                  </td>

                  {/* Vendor Column */}
                  <td className="px-3 py-3 text-sm text-gray-900 truncate" title={expense.vendor_name}>
                    <div className="flex items-center gap-2">
                      {expense.transaction_type === 'Credit Card' ? (
                        <Image
                          src="/logos/bill.png"
                          alt="Bill.com Credit Card"
                          width={16}
                          height={16}
                          className="flex-shrink-0"
                          title="Credit Card Transaction"
                        />
                      ) : (
                        <Image
                          src="/logos/netsuite.png"
                          alt="NetSuite Vendor Bill"
                          width={16}
                          height={16}
                          className="flex-shrink-0"
                          title="Vendor Bill"
                        />
                      )}
                      <span className="truncate">{expense.vendor_name}</span>
                    </div>
                  </td>

                  {/* Purchaser Column */}
                  <td className="px-3 py-3 text-sm text-gray-600 truncate" title={expense.cardholder || ''}>
                    {expense.cardholder || '-'}
                  </td>

                  {/* Category Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.category || ''}>
                    {expense.category || '-'}
                  </td>

                  {/* Branch Column */}
                  <td className="px-3 py-3">
                    {expense.branch && expense.branch !== 'QnVkZ2V0OjcyNDQ0MQ==-' && !expense.branch.includes('=') && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        expense.branch === 'Phoenix - North' ? 'bg-green-100 text-green-800' :
                        expense.branch === 'Phoenix - SouthEast' ? 'bg-red-100 text-red-800' :
                        expense.branch === 'Phoenix - SouthWest' ? 'bg-blue-100 text-blue-800' :
                        expense.branch === 'Las Vegas' ? 'bg-yellow-100 text-yellow-800' :
                        expense.branch === 'Corporate' ? 'bg-gray-100 text-gray-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {expense.branch}
                      </span>
                    )}
                  </td>

                  {/* Department Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.department || ''}>
                    {expense.department || '-'}
                  </td>

                  {/* Amount Column */}
                  <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>

                  {/* Status Column - UPDATED with Sync Icon */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {expense.status && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          expense.status === 'Paid' || expense.status === 'Paid In Full' || expense.status === 'Complete' ? 'bg-green-100 text-green-800' :
                          expense.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                          expense.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {expense.status}
                        </span>
                      )}
                      <SyncStatusIcon 
                        syncStatus={expense.bill_sync_status} 
                        transactionType={expense.transaction_type}
                      />
                    </div>
                  </td>

                  {/* Memo Column */}
                  <td className="px-3 py-3 text-sm text-gray-500 truncate" title={expense.memo || ''}>
                    {expense.memo || '-'}
                  </td>

                  {/* View Column */}
                  <td className="px-3 py-3 text-center">
                    <a
                      href={getTransactionUrl(expense)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 inline-block"
                      title={expense.transaction_type === 'Credit Card' ? 'View in Bill.com' : 'View in NetSuite'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </td>

                  {/* Slack Notify Column - Only show when admin AND not masquerading */}
                  {showNotifyColumn && (
                    <td className="px-3 py-3 text-center">
                      {expense.cardholder && (
                        <SlackNotifyButton
                          expenseId={expense.id}
                          netsuiteId={expense.netsuite_id}
                          transactionType={expense.transaction_type}
                          purchaserName={expense.cardholder}
                          vendor={expense.vendor_name}
                          amount={expense.amount}
                          date={expense.transaction_date}
                          memo={expense.memo}
                          currentBranch={expense.branch}
                          currentDepartment={expense.department}
                          currentCategory={expense.category}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="lg:hidden max-h-[calc(100vh-300px)] overflow-y-auto">
        {expenses.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500">
            No expenses found. Try adjusting your filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {expenses.map((expense) => {
              const isExpanded = expandedRows.has(expense.id);
              
              return (
                <div 
                  key={expense.id} 
                  className={`p-4 ${getRowBackgroundColor(expense.flag_category)}`}
                >
                  {/* Main Row - Always Visible */}
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => toggleRow(expense.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {expense.transaction_type === 'Credit Card' ? (
                          <Image
                            src="/logos/bill.png"
                            alt="Bill.com"
                            width={14}
                            height={14}
                            className="flex-shrink-0"
                          />
                        ) : (
                          <Image
                            src="/logos/netsuite.png"
                            alt="NetSuite"
                            width={14}
                            height={14}
                            className="flex-shrink-0"
                          />
                        )}
                        <span className="font-medium text-gray-900 text-sm">{expense.vendor_name}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{formatDate(expense.transaction_date)}</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(expense.amount, expense.currency)}</span>
                      </div>
                      
                      <div className="text-xs text-gray-600">
                        {expense.cardholder || 'No purchaser'}
                      </div>
                    </button>

                    {/* Expand/Collapse Icon */}
                    <button
                      onClick={() => toggleRow(expense.id)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <svg 
                        className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      {/* Flag */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">Flag:</span>
                        <select
                          value={expense.flag_category || ''}
                          onChange={(e) => handleFlagChange(expense.id, e.target.value)}
                          disabled={updatingFlags.has(expense.id)}
                          className={`text-xs border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            getDropdownStyling(expense.flag_category)
                          }`}
                        >
                          <option value="">No Flag</option>
                          {FLAG_CATEGORIES.map(category => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Category */}
                      {expense.category && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Category:</span>
                          <span className="text-xs text-gray-900">{expense.category}</span>
                        </div>
                      )}

                      {/* Branch */}
                      {expense.branch && expense.branch !== 'QnVkZ2V0OjcyNDQ0MQ==-' && !expense.branch.includes('=') && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Branch:</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            expense.branch === 'Phoenix - North' ? 'bg-green-100 text-green-800' :
                            expense.branch === 'Phoenix - SouthEast' ? 'bg-red-100 text-red-800' :
                            expense.branch === 'Phoenix - SouthWest' ? 'bg-blue-100 text-blue-800' :
                            expense.branch === 'Las Vegas' ? 'bg-yellow-100 text-yellow-800' :
                            expense.branch === 'Corporate' ? 'bg-gray-100 text-gray-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {expense.branch}
                          </span>
                        </div>
                      )}

                      {/* Department */}
                      {expense.department && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Department:</span>
                          <span className="text-xs text-gray-900">{expense.department}</span>
                        </div>
                      )}

                      {/* Status */}
                      {expense.status && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500">Status:</span>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              expense.status === 'Paid' || expense.status === 'Paid In Full' || expense.status === 'Complete' ? 'bg-green-100 text-green-800' :
                              expense.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                              expense.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {expense.status}
                            </span>
                            <SyncStatusIcon 
                              syncStatus={expense.bill_sync_status} 
                              transactionType={expense.transaction_type}
                            />
                          </div>
                        </div>
                      )}

                      {/* Memo */}
                      {expense.memo && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-gray-500">Memo:</span>
                          <span className="text-xs text-gray-900">{expense.memo}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-2">
                        <a
                          href={getTransactionUrl(expense)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View
                        </a>
                        
                        {/* Slack Notify Button - Show for admins not masquerading */}
                        {showNotifyColumn && expense.cardholder && (
                          <div className="flex-1">
                            <SlackNotifyButton
                              expenseId={expense.id}
                              netsuiteId={expense.netsuite_id}
                              transactionType={expense.transaction_type}
                              purchaserName={expense.cardholder}
                              vendor={expense.vendor_name}
                              amount={expense.amount}
                              date={expense.transaction_date}
                              memo={expense.memo}
                              currentBranch={expense.branch}
                              currentDepartment={expense.department}
                              currentCategory={expense.category}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}